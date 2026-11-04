"""Route planning engine.

Phase 1 (this file): a priority-aware greedy nearest-neighbour planner that
respects vehicle capacity and waste-type compatibility. It keeps the apps
fully working end-to-end.

Phase 2 will add `dbscan_cvrp` here: DBSCAN clustering of active requests
followed by an OR-Tools CVRP with SLA time windows. The rest of the system
only calls `plan_routes()`, so the new planner can be dropped in without
touching the apps.
"""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..geo import road_km
from ..models import PickupRequest, Route, RouteStop, Vehicle, utcnow
from ..services import recompute_etas, refresh_priorities

MAX_STOPS_PER_ROUTE = 25
DISTANCE_WEIGHT = 1.0  # how many priority points one km of detour is worth


@dataclass
class Plan:
    vehicle: Vehicle
    requests: list[PickupRequest] = field(default_factory=list)
    load_kg: float = 0.0


def effective_kg(req: PickupRequest) -> float:
    """Users with a poor estimate history get a safety margin on capacity."""
    reliability = req.user.reliability if req.user else 1.0
    return req.est_kg * (1 + (1 - reliability) * 0.5)


def greedy_plan(vehicles: list[Vehicle], requests: list[PickupRequest]) -> list[Plan]:
    unassigned = sorted(requests, key=lambda r: -r.priority_score)
    plans: list[Plan] = []
    for v in vehicles:
        plan = Plan(vehicle=v)
        allowed = set(v.allowed_list)
        lat, lng = (v.cur_lat or v.depot_lat), (v.cur_lng or v.depot_lng)
        while len(plan.requests) < MAX_STOPS_PER_ROUTE:
            best, best_score = None, float("-inf")
            for r in unassigned:
                if r.waste_type not in allowed:
                    continue
                if plan.load_kg + effective_kg(r) > v.capacity_kg:
                    continue
                score = r.priority_score - DISTANCE_WEIGHT * road_km(lat, lng, r.lat, r.lng)
                if score > best_score:
                    best, best_score = r, score
            if best is None:
                break
            plan.requests.append(best)
            plan.load_kg += effective_kg(best)
            unassigned.remove(best)
            lat, lng = best.lat, best.lng
        if plan.requests:
            plans.append(plan)
    return plans


def plan_routes(db: Session, planner: str = "greedy") -> dict:
    refresh_priorities(db)
    busy_ids = set(
        db.scalars(select(Route.vehicle_id).where(Route.status.in_(["planned", "active"]))).all()
    )
    vehicles = [
        v for v in db.scalars(select(Vehicle).where(Vehicle.driver_id.is_not(None))).all()
        if v.id not in busy_ids and v.status != "offline"
    ]
    pending = list(db.scalars(select(PickupRequest).where(PickupRequest.status == "pending")).all())

    plans = greedy_plan(vehicles, pending)

    now = utcnow()
    route_ids, scheduled, total_km = [], 0, 0.0
    for p in plans:
        v = p.vehicle
        route = Route(vehicle_id=v.id, planner=planner, status="planned")
        db.add(route)
        db.flush()
        lat, lng, km = v.depot_lat, v.depot_lng, 0.0
        stops = []
        for seq, r in enumerate(p.requests, start=1):
            leg = road_km(lat, lng, r.lat, r.lng)
            km += leg
            stop = RouteStop(route_id=route.id, request_id=r.id, seq=seq, leg_km=round(leg, 3))
            stop.request = r
            stops.append(stop)
            db.add(stop)
            r.status, r.route_id, r.scheduled_at = "scheduled", route.id, now
            lat, lng = r.lat, r.lng
        km += road_km(lat, lng, v.depot_lat, v.depot_lng)  # return to depot
        recompute_etas(stops, v.depot_lat, v.depot_lng, now)
        route.total_km = round(km, 2)
        route.total_kg = round(sum(r.est_kg for r in p.requests), 1)
        route_ids.append(route.id)
        scheduled += len(p.requests)
        total_km += km
    db.commit()
    return {
        "routes_created": len(route_ids),
        "requests_scheduled": scheduled,
        "requests_left": len(pending) - scheduled,
        "total_km": round(total_km, 2),
        "routes": route_ids,
    }
