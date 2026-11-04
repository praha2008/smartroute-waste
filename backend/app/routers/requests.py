"""Citizen side: create and track pickup requests."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PickupRequest, User, utcnow
from ..schemas import PhotoIn, PickupCreate, PickupDetail, PickupOut
from ..security import get_current_user, require_role
from ..services import pickup_detail, priority_score, sla_deadline
from ..uploads import save_base64_image, save_image

router = APIRouter(prefix="/requests", tags=["citizen"])
citizen = require_role("citizen")


def _own(db: Session, req_id: int, user: User) -> PickupRequest:
    req = db.get(PickupRequest, req_id)
    if not req or (req.user_id != user.id and user.role not in ("admin", "collector")):
        raise HTTPException(404, "Request not found")
    return req


@router.post("", response_model=PickupOut, status_code=201)
def create_request(body: PickupCreate, user: User = Depends(citizen), db: Session = Depends(get_db)):
    open_count = db.scalar(
        select(func.count()).select_from(PickupRequest).where(
            PickupRequest.user_id == user.id, PickupRequest.status.in_(["pending", "scheduled", "in_progress"])
        )
    )
    if open_count >= 15:
        raise HTTPException(400, "You already have 15 open requests. Please wait for them to be collected.")
    now = utcnow()
    req = PickupRequest(
        user_id=user.id,
        waste_type=body.waste_type,
        urgency=body.urgency,
        est_kg=body.est_kg,
        lat=body.lat,
        lng=body.lng,
        address=body.address or user.address,
        notes=body.notes,
        created_at=now,
        sla_deadline=sla_deadline(body.waste_type, body.urgency, now),
    )
    req.priority_score = priority_score(req, now)
    db.add(req)
    db.commit()
    # Dynamic insertion: urgent requests jump straight into a truck that is already out
    if req.waste_type == "hazardous" or req.urgency == "critical":
        from ..engine.planner import insert_urgent

        insert_urgent(db, req)
        db.refresh(req)
    return req


@router.post("/{req_id}/photo", response_model=PickupOut)
async def upload_photo(
    req_id: int, file: UploadFile = File(...), user: User = Depends(citizen), db: Session = Depends(get_db)
):
    req = _own(db, req_id, user)
    req.photo_url = await save_image(file, f"req{req.id}")
    db.commit()
    return req


@router.post("/{req_id}/photo64", response_model=PickupOut)
def upload_photo_base64(req_id: int, body: PhotoIn, user: User = Depends(citizen), db: Session = Depends(get_db)):
    req = _own(db, req_id, user)
    req.photo_url = save_base64_image(body.data, f"req{req.id}")
    db.commit()
    return req


@router.get("/mine", response_model=list[PickupDetail])
def my_requests(user: User = Depends(citizen), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(PickupRequest).where(PickupRequest.user_id == user.id).order_by(PickupRequest.id.desc())
    ).all()
    return [pickup_detail(db, r) for r in rows]


@router.get("/stats")
def my_stats(user: User = Depends(citizen), db: Session = Depends(get_db)):
    rows = db.scalars(select(PickupRequest).where(PickupRequest.user_id == user.id)).all()
    collected = [r for r in rows if r.status == "collected"]
    by_type: dict[str, float] = {}
    for r in collected:
        by_type[r.waste_type] = by_type.get(r.waste_type, 0) + (r.actual_kg or 0)
    diverted = sum(kg for t, kg in by_type.items() if t in ("recyclable", "e_waste", "organic"))
    return {
        "total_requests": len(rows),
        "open_requests": sum(1 for r in rows if r.status in ("pending", "scheduled", "in_progress")),
        "collected": len(collected),
        "total_kg": round(sum(r.actual_kg or 0 for r in collected), 1),
        "kg_by_type": {k: round(v, 1) for k, v in by_type.items()},
        "kg_diverted_from_landfill": round(diverted, 1),
        # ~1.9 kg CO2e avoided per kg recycled/composted vs landfill (indicative factor)
        "co2_saved_kg": round(diverted * 1.9, 1),
        "green_credits": user.green_credits,
        "reliability": user.reliability,
    }


@router.get("/{req_id}", response_model=PickupDetail)
def get_request(req_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return pickup_detail(db, _own(db, req_id, user), include_contact=user.role != "citizen")


@router.post("/{req_id}/cancel", response_model=PickupOut)
def cancel_request(req_id: int, user: User = Depends(citizen), db: Session = Depends(get_db)):
    req = _own(db, req_id, user)
    if req.status not in ("pending", "scheduled"):
        raise HTTPException(400, f"Cannot cancel a request that is {req.status}")
    if req.route_id:
        for s in req.route.stops:
            if s.request_id == req.id:
                s.status = "skipped"
    req.status = "cancelled"
    req.skip_reason = "Cancelled by user"
    db.commit()
    return req
