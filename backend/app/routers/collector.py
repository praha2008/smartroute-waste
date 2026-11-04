"""Collector (driver) side: today's route, pickups, live location."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PickupRequest, Route, RouteStop, User, Vehicle, utcnow
from ..schemas import CollectIn, LocationIn, PhotoIn, RouteOut, SkipIn, StopOut, VehicleOut
from ..security import require_role
from ..services import award_credits, create_lot_if_recyclable, pickup_detail, recompute_etas
from ..uploads import save_base64_image, save_image

router = APIRouter(prefix="/collector", tags=["collector"])
collector = require_role("collector")


def my_vehicle(db: Session, user: User) -> Vehicle:
    v = db.scalar(select(Vehicle).where(Vehicle.driver_id == user.id))
    if not v:
        raise HTTPException(404, "No vehicle is assigned to you yet. Ask the admin to assign one.")
    return v


def vehicle_out(v: Vehicle) -> VehicleOut:
    out = VehicleOut.model_validate(v)
    out.driver_name = v.driver.name if v.driver else None
    return out


def route_out(db: Session, route: Route, contact: bool = True) -> RouteOut:
    return RouteOut(
        id=route.id, vehicle_id=route.vehicle_id, status=route.status, planner=route.planner,
        total_km=route.total_km, total_kg=route.total_kg, created_at=route.created_at,
        started_at=route.started_at, completed_at=route.completed_at,
        vehicle=vehicle_out(route.vehicle),
        stops=[
            StopOut(id=s.id, seq=s.seq, status=s.status, eta=s.eta, leg_km=s.leg_km, completed_at=s.completed_at,
                    request=pickup_detail(db, s.request, include_contact=contact))
            for s in route.stops
        ],
    )


def _my_stop(db: Session, stop_id: int, user: User) -> RouteStop:
    stop = db.get(RouteStop, stop_id)
    if not stop or stop.route.vehicle.driver_id != user.id:
        raise HTTPException(404, "Stop not found")
    if stop.route.status != "active":
        raise HTTPException(400, "Start the route first")
    if stop.status != "pending":
        raise HTTPException(400, f"Stop already {stop.status}")
    return stop


def _maybe_finish(db: Session, route: Route) -> None:
    if all(s.status != "pending" for s in route.stops):
        route.status = "completed"
        route.completed_at = utcnow()
        route.vehicle.status = "idle"


@router.get("/me")
def dashboard(user: User = Depends(collector), db: Session = Depends(get_db)):
    v = db.scalar(select(Vehicle).where(Vehicle.driver_id == user.id))
    if not v:
        return {"vehicle": None, "route": None, "today": {"routes": 0, "stops_done": 0, "kg": 0, "km": 0}}
    route = db.scalar(
        select(Route).where(Route.vehicle_id == v.id, Route.status.in_(["active", "planned"]))
        .order_by(Route.status.asc(), Route.id.asc())  # 'active' sorts before 'planned'
    )
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    done = db.scalars(
        select(Route).where(Route.vehicle_id == v.id, Route.status == "completed", Route.completed_at >= today)
    ).all()
    stops_done = [s for r in done for s in r.stops if s.status == "done"]
    return {
        "vehicle": vehicle_out(v),
        "route": route_out(db, route) if route else None,
        "today": {
            "routes": len(done),
            "stops_done": len(stops_done),
            "kg": round(sum(s.request.actual_kg or 0 for s in stops_done), 1),
            "km": round(sum(r.total_km for r in done), 1),
        },
    }


@router.post("/route/{route_id}/start", response_model=RouteOut)
def start_route(route_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    v = my_vehicle(db, user)
    route = db.get(Route, route_id)
    if not route or route.vehicle_id != v.id:
        raise HTTPException(404, "Route not found")
    if route.status != "planned":
        raise HTTPException(400, f"Route is already {route.status}")
    if db.scalar(select(Route).where(Route.vehicle_id == v.id, Route.status == "active")):
        raise HTTPException(400, "Finish your active route first")
    now = utcnow()
    route.status, route.started_at = "active", now
    v.status = "on_route"
    for s in route.stops:
        if s.status == "pending":
            s.request.status = "in_progress"
    recompute_etas(route.stops, v.cur_lat or v.depot_lat, v.cur_lng or v.depot_lng, now)
    db.commit()
    return route_out(db, route)


@router.post("/stops/{stop_id}/collect", response_model=StopOut)
def collect(stop_id: int, body: CollectIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    stop = _my_stop(db, stop_id, user)
    req: PickupRequest = stop.request
    now = utcnow()
    stop.status, stop.completed_at = "done", now
    req.status, req.actual_kg, req.collected_at = "collected", body.actual_kg, now
    if body.note:
        req.notes = (req.notes + "\n" if req.notes else "") + f"[collector] {body.note}"
    db.flush()
    award_credits(db, req)
    create_lot_if_recyclable(db, req)
    v = stop.route.vehicle
    v.cur_lat, v.cur_lng, v.last_seen = req.lat, req.lng, now
    recompute_etas(stop.route.stops, req.lat, req.lng, now)
    _maybe_finish(db, stop.route)
    db.commit()
    return StopOut(id=stop.id, seq=stop.seq, status=stop.status, eta=stop.eta, leg_km=stop.leg_km,
                   completed_at=stop.completed_at, request=pickup_detail(db, req, include_contact=True))


@router.post("/stops/{stop_id}/photo", response_model=StopOut)
async def stop_photo(stop_id: int, file: UploadFile = File(...), user: User = Depends(collector),
                     db: Session = Depends(get_db)):
    stop = db.get(RouteStop, stop_id)
    if not stop or stop.route.vehicle.driver_id != user.id:
        raise HTTPException(404, "Stop not found")
    stop.request.proof_photo_url = await save_image(file, f"proof{stop.request_id}")
    db.commit()
    return StopOut(id=stop.id, seq=stop.seq, status=stop.status, eta=stop.eta, leg_km=stop.leg_km,
                   completed_at=stop.completed_at, request=pickup_detail(db, stop.request, include_contact=True))


@router.post("/stops/{stop_id}/photo64", response_model=StopOut)
def stop_photo_base64(stop_id: int, body: PhotoIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    stop = db.get(RouteStop, stop_id)
    if not stop or stop.route.vehicle.driver_id != user.id:
        raise HTTPException(404, "Stop not found")
    stop.request.proof_photo_url = save_base64_image(body.data, f"proof{stop.request_id}")
    db.commit()
    return StopOut(id=stop.id, seq=stop.seq, status=stop.status, eta=stop.eta, leg_km=stop.leg_km,
                   completed_at=stop.completed_at, request=pickup_detail(db, stop.request, include_contact=True))


@router.post("/stops/{stop_id}/skip", response_model=StopOut)
def skip(stop_id: int, body: SkipIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    stop = _my_stop(db, stop_id, user)
    req = stop.request
    stop.status, stop.completed_at = "skipped", utcnow()
    # put it back in the pool so the next planning run picks it up again
    req.status, req.route_id, req.skip_reason = "pending", None, body.reason
    _maybe_finish(db, stop.route)
    db.commit()
    return StopOut(id=stop.id, seq=stop.seq, status=stop.status, eta=stop.eta, leg_km=stop.leg_km,
                   completed_at=stop.completed_at, request=pickup_detail(db, req, include_contact=True))


@router.post("/route/{route_id}/complete", response_model=RouteOut)
def complete_route(route_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    v = my_vehicle(db, user)
    route = db.get(Route, route_id)
    if not route or route.vehicle_id != v.id or route.status != "active":
        raise HTTPException(400, "No active route with this id")
    for s in route.stops:
        if s.status == "pending":
            s.status = "skipped"
            s.request.status, s.request.route_id = "pending", None
            s.request.skip_reason = "Route ended before this stop"
    _maybe_finish(db, route)
    db.commit()
    return route_out(db, route)


@router.post("/location")
def update_location(body: LocationIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    v = my_vehicle(db, user)
    now = utcnow()
    v.cur_lat, v.cur_lng, v.last_seen = body.lat, body.lng, now
    route = db.scalar(select(Route).where(Route.vehicle_id == v.id, Route.status == "active"))
    if route:
        recompute_etas(route.stops, body.lat, body.lng, now)
    db.commit()
    return {"ok": True}


@router.get("/history", response_model=list[RouteOut])
def history(user: User = Depends(collector), db: Session = Depends(get_db)):
    v = my_vehicle(db, user)
    routes = db.scalars(
        select(Route).where(Route.vehicle_id == v.id, Route.status == "completed").order_by(Route.id.desc()).limit(20)
    ).all()
    return [route_out(db, r, contact=False) for r in routes]
