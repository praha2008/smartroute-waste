"""Route-planning entry point used by the API.

planner = "smart"  : DBSCAN communities -> density-triggered dispatch -> OR-Tools CVRP
                     with capacity, waste-type compatibility, SLA soft deadlines and
                     priority-based drop penalties.          (the SmartRoute method)
planner = "greedy" : priority-aware nearest-neighbour baseline, no clustering.

Rolling horizon: each call plans only the currently *pending* requests for trucks
that are free, so the admin (or a timer) can re-run it during the day as new
requests arrive. Urgent requests can also be inserted live into trucks that are
already out - see `insert_urgent()`.
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..geo import SERVICE_MIN_PER_STOP, road_km, travel_minutes
from ..models import PickupRequest, Route, RouteStop, Vehicle, utcnow
from ..services import recompute_etas, refresh_priorities
from .clustering import ClusterParams, select_for_dispatch
from .greedy import solve_greedy
from .model import Job, PlanResult, Truck

PLANNERS = {"smart": "DBSCAN + CVRP (OR-Tools)", "greedy": "Greedy nearest-neighbour"}


def effective_kg(req: PickupRequest) -> float:
    """Users with a poor estimate history get a safety margin on truck capacity."""
    reliability = req.user.reliability if req.user else 1.0
    return round(req.est_kg * (1 + (1 - reliability) * 0.5), 2)


def to_job(req: PickupRequest, now) -> Job:
    return Job(
        id=req.id, lat=req.lat, lng=req.lng, kg=effective_kg(req), waste_type=req.waste_type,
        urgency=req.urgency, priority=req.priority_score,
        deadline_min=(req.sla_deadline - now).total_seconds() / 60, service_min=SERVICE_MIN_PER_STOP,
    )


def to_truck(v: Vehicle) -> Truck:
    return Truck(id=v.id, capacity_kg=v.capacity_kg, allowed=set(v.allowed_list),
                 start=(v.depot_lat, v.depot_lng), end=(v.depot_lat, v.depot_lng), name=v.name)


def compute_plan(trucks: list[Truck], jobs: list[Job], planner: str = "smart",
                 cparams: ClusterParams | None = None, time_limit_s: float = 5.0) -> PlanResult:
    """Pure function (no database) - also used by the evaluation simulator."""
    notes: list[str] = []
    if planner == "greedy":
        routes, dropped, source, secs = solve_greedy(trucks, jobs)
        return PlanResult(routes, dropped, [], {}, "greedy", source, secs, notes)

    cparams = cparams or ClusterParams()
    dispatch, deferred, clusters = select_for_dispatch(jobs, cparams)
    try:
        from .cvrp import CVRPParams, solve_cvrp

        routes, dropped, source, secs = solve_cvrp(trucks, dispatch, CVRPParams(time_limit_s=time_limit_s))
        name = "smart"
    except ImportError:
        notes.append("OR-Tools not installed - used greedy routing after clustering (pip install ortools)")
        routes, dropped, source, secs = solve_greedy(trucks, dispatch)
        name = "smart-greedy"
    return PlanResult(routes, dropped, deferred, clusters, name, source, secs, notes)


def plan_routes(db: Session, planner: str = "smart", eps_km: float | None = None,
                min_samples: int | None = None, defer: bool = True, time_limit_s: float = 5.0) -> dict:
    refresh_priorities(db)
    now = utcnow()
    busy = set(db.scalars(select(Route.vehicle_id).where(Route.status.in_(["planned", "active"]))).all())
    vehicles = [
        v for v in db.scalars(select(Vehicle).where(Vehicle.driver_id.is_not(None))).all()
        if v.id not in busy and v.status != "offline"
    ]
    pending = list(db.scalars(select(PickupRequest).where(PickupRequest.status == "pending")).all())
    req_by_id = {r.id: r for r in pending}
    jobs = [to_job(r, now) for r in pending]
    cp = ClusterParams(defer_enabled=defer)
    if eps_km:
        cp.eps_km = eps_km
    if min_samples:
        cp.min_samples = min_samples

    result = compute_plan([to_truck(v) for v in vehicles], jobs, planner, cp, time_limit_s) if vehicles else \
        PlanResult([], jobs, [], {}, planner, "none", 0.0, ["No free vehicles with a driver"])

    # remember community membership for the map
    for j in jobs:
        req_by_id[j.id].cluster_id = j.cluster if (j.cluster is not None and j.cluster >= 0) else None

    route_ids = []
    for pr in result.routes:
        route = Route(vehicle_id=pr.truck.id, planner=result.planner, status="planned",
                      total_km=round(pr.km, 2), total_kg=round(sum(req_by_id[j.id].est_kg for j in pr.jobs), 1))
        db.add(route)
        db.flush()
        stops = []
        for seq, (j, leg, arr) in enumerate(zip(pr.jobs, pr.legs_km, pr.arrival_min), start=1):
            r = req_by_id[j.id]
            stop = RouteStop(route_id=route.id, request_id=r.id, seq=seq, leg_km=leg, eta=now + timedelta(minutes=arr))
            stop.request = r
            stops.append(stop)
            db.add(stop)
            r.status, r.route_id, r.scheduled_at = "scheduled", route.id, now
        route_ids.append(route.id)
    db.commit()

    scheduled = sum(len(r.jobs) for r in result.routes)
    return {
        "planner": result.planner,
        "planner_label": PLANNERS.get(planner, planner),
        "routes_created": len(route_ids),
        "requests_scheduled": scheduled,
        "requests_left": len(pending) - scheduled,
        "deferred": len(result.deferred),
        "dropped": len(result.dropped),
        "clusters": len(result.clusters),
        "total_km": round(result.total_km, 2),
        "km_per_pickup": round(result.total_km / scheduled, 2) if scheduled else None,
        "distance_source": result.distance_source,
        "solve_seconds": result.solve_seconds,
        "notes": result.notes,
        "routes": route_ids,
    }


def insert_urgent(db: Session, req: PickupRequest) -> int | None:
    """Dynamic insertion: put an urgent request straight into a compatible truck that is
    already planned/out, at the cheapest position among its remaining stops.
    Returns the route id, or None if no truck can take it (it then waits for the next plan)."""
    routes = db.scalars(select(Route).where(Route.status.in_(["planned", "active"]))).all()
    best = None  # (extra_km, route, insert_after_seq)
    for rt in routes:
        v = rt.vehicle
        if req.waste_type not in v.allowed_list:
            continue
        load = sum(s.request.est_kg for s in rt.stops if s.status != "skipped")
        if load + req.est_kg > v.capacity_kg:
            continue
        pending = [s for s in rt.stops if s.status == "pending"]
        done = [s for s in rt.stops if s.status != "pending"]
        if rt.status == "active" and v.cur_lat and v.cur_lng:
            start = (v.cur_lat, v.cur_lng)
        elif done:
            start = (done[-1].request.lat, done[-1].request.lng)
        else:
            start = (v.depot_lat, v.depot_lng)
        chain = [start] + [(s.request.lat, s.request.lng) for s in pending] + [(v.depot_lat, v.depot_lng)]
        for k in range(len(chain) - 1):
            a, b = chain[k], chain[k + 1]
            extra = road_km(*a, req.lat, req.lng) + road_km(req.lat, req.lng, *b) - road_km(*a, *b)
            after_seq = pending[k - 1].seq if k > 0 else (done[-1].seq if done else 0)
            if best is None or extra < best[0]:
                best = (extra, rt, after_seq)
    if best is None:
        return None
    extra, rt, after_seq = best
    for s in rt.stops:
        if s.seq > after_seq:
            s.seq += 1
    stop = RouteStop(route_id=rt.id, request_id=req.id, seq=after_seq + 1, leg_km=0)
    stop.request = req
    rt.stops.append(stop)
    rt.stops.sort(key=lambda s: s.seq)
    rt.total_km = round(rt.total_km + extra, 2)
    rt.total_kg = round(rt.total_kg + req.est_kg, 1)
    now = utcnow()
    req.route_id, req.scheduled_at = rt.id, now
    req.status = "in_progress" if rt.status == "active" else "scheduled"
    v = rt.vehicle
    start = (v.cur_lat, v.cur_lng) if (rt.status == "active" and v.cur_lat) else (v.depot_lat, v.depot_lng)
    recompute_etas(rt.stops, start[0], start[1], now)
    # leg distance for the new stop
    prev = next((s for s in rt.stops if s.seq == after_seq), None)
    plat, plng = (prev.request.lat, prev.request.lng) if prev else (v.depot_lat, v.depot_lng)
    stop.leg_km = round(road_km(plat, plng, req.lat, req.lng), 3)
    db.commit()
    return rt.id


__all__ = ["plan_routes", "compute_plan", "insert_urgent", "PLANNERS", "travel_minutes"]
