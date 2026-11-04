"""Business rules shared by the routers: SLA, priority, credits, recyclable lots."""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import CreditTransaction, PickupRequest, RecyclableLot, RouteStop, User, Vehicle, utcnow
from .schemas import PickupDetail, VehicleBrief


def sla_deadline(waste_type: str, urgency: str, created: datetime) -> datetime:
    hours = config.WASTE_TYPES[waste_type]["base_sla_hours"] * config.URGENCY_LEVELS[urgency]["sla_factor"]
    return created + timedelta(hours=hours)


def priority_score(req: PickupRequest, now: datetime | None = None) -> float:
    """Higher = serve earlier. Combines waste-type priority, chosen urgency
    and how close the request is to breaching its SLA deadline."""
    now = now or utcnow()
    type_p = config.WASTE_TYPES[req.waste_type]["priority"]
    urg_p = config.URGENCY_LEVELS[req.urgency]["bonus"]
    hours_left = (req.sla_deadline - now).total_seconds() / 3600
    # 0 when far from deadline, up to 5 when late
    time_p = 5.0 if hours_left <= 0 else max(0.0, 5.0 - hours_left / 6)
    return round(type_p * 2 + urg_p * 1.5 + time_p, 2)


def refresh_priorities(db: Session) -> None:
    now = utcnow()
    for r in db.scalars(select(PickupRequest).where(PickupRequest.status.in_(["pending", "scheduled"]))):
        r.priority_score = priority_score(r, now)


def pickup_detail(db: Session, req: PickupRequest, include_contact: bool = False) -> PickupDetail:
    d = PickupDetail.model_validate(req)
    if include_contact and req.user:
        d.requester_name = req.user.name
        d.requester_phone = req.user.phone
    if req.route_id and req.status in ("scheduled", "in_progress"):
        route = req.route
        vehicle: Vehicle = route.vehicle
        d.vehicle = VehicleBrief.model_validate(vehicle)
        my_stop = next((s for s in route.stops if s.request_id == req.id), None)
        if my_stop:
            d.stops_before = sum(1 for s in route.stops if s.seq < my_stop.seq and s.status == "pending")
            d.eta = my_stop.eta
    return d


def award_credits(db: Session, req: PickupRequest) -> int:
    user: User = req.user
    points = config.CREDITS_BASE
    reasons = ["pickup completed"]
    if req.waste_type != "general":
        points += config.CREDITS_SEGREGATED
        reasons.append("segregated")
    if req.urgency == "low":
        points += config.CREDITS_FLEXIBLE
        reasons.append("flexible timing")
    accuracy = 0.0
    if req.actual_kg and req.actual_kg > 0:
        err = abs(req.est_kg - req.actual_kg) / req.actual_kg
        accuracy = max(0.0, 1.0 - err)
        if err <= 0.25:
            points += config.CREDITS_ACCURATE
            reasons.append("accurate estimate")
    # reliability = exponential moving average of estimate accuracy
    user.reliability = round(0.8 * user.reliability + 0.2 * accuracy, 3)
    user.green_credits += points
    req.credits_awarded = points
    db.add(CreditTransaction(user_id=user.id, request_id=req.id, points=points, reason=", ".join(reasons)))
    return points


def create_lot_if_recyclable(db: Session, req: PickupRequest) -> RecyclableLot | None:
    if not config.WASTE_TYPES[req.waste_type]["recyclable"] or not req.actual_kg:
        return None
    lot = RecyclableLot(
        request_id=req.id,
        material=req.waste_type,
        kg=req.actual_kg,
        price_per_kg=config.RECYCLE_PRICES.get(req.waste_type, 10.0),
        ward=req.user.ward if req.user else None,
        lat=req.lat,
        lng=req.lng,
        photo_url=req.proof_photo_url or req.photo_url,
    )
    db.add(lot)
    return lot


def recompute_etas(route_stops: list[RouteStop], start_lat: float, start_lng: float, start_time: datetime) -> None:
    """Re-estimate arrival times for the remaining stops of a route."""
    from .geo import SERVICE_MIN_PER_STOP, road_km, travel_minutes

    t, lat, lng = start_time, start_lat, start_lng
    for s in sorted(route_stops, key=lambda x: x.seq):
        if s.status != "pending":
            continue
        km = road_km(lat, lng, s.request.lat, s.request.lng)
        t = t + timedelta(minutes=travel_minutes(km))
        s.eta = t
        t = t + timedelta(minutes=SERVICE_MIN_PER_STOP)
        lat, lng = s.request.lat, s.request.lng
