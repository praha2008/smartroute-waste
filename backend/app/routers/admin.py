"""Admin / municipality side: used by the web dashboard."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine.planner import plan_routes
from ..models import PickupRequest, RecyclableLot, Route, User, Vehicle, utcnow
from ..schemas import PickupDetail, PlanOut, RouteOut, StaffCreate, UserOut, VehicleIn, VehicleOut
from ..security import hash_password, require_role
from ..services import pickup_detail, refresh_priorities
from .collector import route_out, vehicle_out

router = APIRouter(prefix="/admin", tags=["admin"])
admin = require_role("admin")


@router.get("/overview")
def overview(_: User = Depends(admin), db: Session = Depends(get_db)):
    now = utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    reqs = db.scalars(select(PickupRequest)).all()
    status_counts: dict[str, int] = defaultdict(int)
    for r in reqs:
        status_counts[r.status] += 1
    open_reqs = [r for r in reqs if r.status in ("pending", "scheduled", "in_progress")]
    collected = [r for r in reqs if r.status == "collected"]
    on_time = [r for r in collected if r.collected_at and r.collected_at <= r.sla_deadline]
    vehicles = db.scalars(select(Vehicle)).all()
    routes_today = db.scalars(select(Route).where(Route.created_at >= today)).all()
    cap = sum(v.capacity_kg for v in vehicles if any(rt.vehicle_id == v.id for rt in routes_today)) or 1
    return {
        "requests_total": len(reqs),
        "status_counts": status_counts,
        "open_requests": len(open_reqs),
        "overdue_open": sum(1 for r in open_reqs if r.sla_deadline < now),
        "collected_today": sum(1 for r in collected if r.collected_at and r.collected_at >= today),
        "kg_collected_total": round(sum(r.actual_kg or 0 for r in collected), 1),
        "kg_collected_today": round(sum(r.actual_kg or 0 for r in collected if r.collected_at and r.collected_at >= today), 1),
        "sla_compliance_pct": round(100 * len(on_time) / len(collected), 1) if collected else None,
        "vehicles_total": len(vehicles),
        "vehicles_on_route": sum(1 for v in vehicles if v.status == "on_route"),
        "routes_today": len(routes_today),
        "km_planned_today": round(sum(rt.total_km for rt in routes_today), 1),
        "utilization_pct_today": round(100 * sum(rt.total_kg for rt in routes_today) / cap, 1) if routes_today else None,
        "citizens": db.scalar(select(func.count()).select_from(User).where(User.role == "citizen")),
        "recyclable_lots_available": db.scalar(
            select(func.count()).select_from(RecyclableLot).where(RecyclableLot.status == "available")
        ),
    }


@router.get("/requests", response_model=list[PickupDetail])
def list_requests(status: str | None = None, waste_type: str | None = None, limit: int = 500,
                  _: User = Depends(admin), db: Session = Depends(get_db)):
    q = select(PickupRequest)
    if status:
        q = q.where(PickupRequest.status.in_(status.split(",")))
    if waste_type:
        q = q.where(PickupRequest.waste_type == waste_type)
    rows = db.scalars(q.order_by(PickupRequest.id.desc()).limit(limit)).all()
    return [pickup_detail(db, r, include_contact=True) for r in rows]


@router.get("/live")
def live(_: User = Depends(admin), db: Session = Depends(get_db)):
    """Everything the live map needs in one call."""
    refresh_priorities(db)
    db.commit()
    open_reqs = db.scalars(
        select(PickupRequest).where(PickupRequest.status.in_(["pending", "scheduled", "in_progress"]))
    ).all()
    routes = db.scalars(select(Route).where(Route.status.in_(["planned", "active"]))).all()
    return {
        "requests": [PickupDetail.model_validate(r).model_dump(mode="json") for r in open_reqs],
        "vehicles": [vehicle_out(v).model_dump(mode="json") for v in db.scalars(select(Vehicle)).all()],
        "routes": [
            {
                "id": rt.id, "vehicle_id": rt.vehicle_id, "status": rt.status, "total_km": rt.total_km,
                "path": [[rt.vehicle.depot_lat, rt.vehicle.depot_lng]]
                + [[s.request.lat, s.request.lng] for s in rt.stops]
                + [[rt.vehicle.depot_lat, rt.vehicle.depot_lng]],
                "stops": [{"seq": s.seq, "status": s.status, "request_id": s.request_id} for s in rt.stops],
            }
            for rt in routes
        ],
    }


@router.post("/plan", response_model=PlanOut)
def run_planner(_: User = Depends(admin), db: Session = Depends(get_db)):
    return plan_routes(db)


@router.get("/routes", response_model=list[RouteOut])
def list_routes(status: str | None = None, limit: int = 50, _: User = Depends(admin), db: Session = Depends(get_db)):
    q = select(Route)
    if status:
        q = q.where(Route.status.in_(status.split(",")))
    return [route_out(db, r) for r in db.scalars(q.order_by(Route.id.desc()).limit(limit)).all()]


@router.get("/routes/{route_id}", response_model=RouteOut)
def get_route(route_id: int, _: User = Depends(admin), db: Session = Depends(get_db)):
    route = db.get(Route, route_id)
    if not route:
        raise HTTPException(404, "Route not found")
    return route_out(db, route)


@router.delete("/routes/{route_id}")
def cancel_route(route_id: int, _: User = Depends(admin), db: Session = Depends(get_db)):
    """Cancel a planned (not started) route and release its requests back to the pool."""
    route = db.get(Route, route_id)
    if not route or route.status != "planned":
        raise HTTPException(400, "Only planned routes can be cancelled")
    for s in route.stops:
        s.request.status, s.request.route_id, s.request.scheduled_at = "pending", None, None
    db.delete(route)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ fleet
@router.get("/vehicles", response_model=list[VehicleOut])
def list_vehicles(_: User = Depends(admin), db: Session = Depends(get_db)):
    return [vehicle_out(v) for v in db.scalars(select(Vehicle).order_by(Vehicle.id)).all()]


def _check_driver(db: Session, driver_id: int | None, vehicle_id: int | None = None):
    if driver_id is None:
        return
    d = db.get(User, driver_id)
    if not d or d.role != "collector":
        raise HTTPException(400, "Driver must be a collector account")
    other = db.scalar(select(Vehicle).where(Vehicle.driver_id == driver_id))
    if other and other.id != vehicle_id:
        raise HTTPException(400, f"This collector already drives {other.reg_no}")


@router.post("/vehicles", response_model=VehicleOut, status_code=201)
def create_vehicle(body: VehicleIn, _: User = Depends(admin), db: Session = Depends(get_db)):
    _check_driver(db, body.driver_id)
    data = body.model_dump()
    data["allowed_types"] = ",".join(body.allowed_types)
    v = Vehicle(**data)
    db.add(v)
    db.commit()
    return vehicle_out(v)


@router.put("/vehicles/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: int, body: VehicleIn, _: User = Depends(admin), db: Session = Depends(get_db)):
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    _check_driver(db, body.driver_id, vehicle_id)
    for k, val in body.model_dump().items():
        setattr(v, k, ",".join(val) if k == "allowed_types" else val)
    db.commit()
    return vehicle_out(v)


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, _: User = Depends(admin), db: Session = Depends(get_db)):
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if db.scalar(select(Route).where(Route.vehicle_id == v.id)):
        raise HTTPException(400, "Vehicle has route history; unassign the driver or mark it offline instead")
    db.delete(v)
    db.commit()
    return {"ok": True}


@router.post("/vehicles/{vehicle_id}/status/{status}", response_model=VehicleOut)
def set_vehicle_status(vehicle_id: int, status: str, _: User = Depends(admin), db: Session = Depends(get_db)):
    if status not in ("idle", "offline"):
        raise HTTPException(400, "Status must be idle or offline")
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    v.status = status
    db.commit()
    return vehicle_out(v)


# ------------------------------------------------------------------ users
@router.get("/users", response_model=list[UserOut])
def list_users(role: str | None = None, _: User = Depends(admin), db: Session = Depends(get_db)):
    q = select(User)
    if role:
        q = q.where(User.role == role)
    return db.scalars(q.order_by(User.id)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: StaffCreate, _: User = Depends(admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(400, "Email already used")
    u = User(name=body.name, email=email, phone=body.phone, role=body.role, password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    return u


# ------------------------------------------------------------------ analytics
@router.get("/analytics")
def analytics(days: int = 14, _: User = Depends(admin), db: Session = Depends(get_db)):
    now = utcnow()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    reqs = db.scalars(select(PickupRequest).where(PickupRequest.created_at >= start)).all()
    daily: dict[str, dict[str, float]] = {}
    for i in range(days):
        daily[(start + timedelta(days=i)).date().isoformat()] = defaultdict(float)
    kg_by_type: dict[str, float] = defaultdict(float)
    by_ward: dict[str, int] = defaultdict(int)
    for r in reqs:
        day = r.created_at.date().isoformat()
        if day in daily:
            daily[day][r.waste_type] += 1
        if r.status == "collected":
            kg_by_type[r.waste_type] += r.actual_kg or 0
        by_ward[(r.user.ward if r.user and r.user.ward else "Unknown")] += 1
    routes = db.scalars(select(Route).where(Route.status == "completed", Route.created_at >= start)).all()
    return {
        "daily_requests": [{"date": d, **counts} for d, counts in daily.items()],
        "kg_by_type": {k: round(v, 1) for k, v in kg_by_type.items()},
        "requests_by_ward": dict(sorted(by_ward.items(), key=lambda kv: -kv[1])),
        "completed_routes": len(routes),
        "avg_km_per_route": round(sum(r.total_km for r in routes) / len(routes), 2) if routes else None,
        "avg_kg_per_route": round(sum(r.total_kg for r in routes) / len(routes), 1) if routes else None,
    }
