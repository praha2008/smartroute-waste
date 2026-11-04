"""Recycler side: marketplace of collected recyclable lots."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..geo import haversine_km
from ..models import RecyclableLot, User, utcnow
from ..schemas import LotOut
from ..security import require_role

router = APIRouter(prefix="/recycler", tags=["recycler"])
recycler = require_role("recycler")


def _with_distance(lot: RecyclableLot, user: User) -> dict:
    d = LotOut.model_validate(lot).model_dump(mode="json")
    d["distance_km"] = round(haversine_km(user.lat, user.lng, lot.lat, lot.lng), 2) if user.lat and user.lng else None
    d["total_value"] = round(lot.kg * lot.price_per_kg, 2)
    return d


@router.get("/lots")
def available_lots(material: str | None = None, user: User = Depends(recycler), db: Session = Depends(get_db)):
    q = select(RecyclableLot).where(RecyclableLot.status == "available")
    if material:
        q = q.where(RecyclableLot.material == material)
    lots = [_with_distance(lot, user) for lot in db.scalars(q.order_by(RecyclableLot.id.desc())).all()]
    lots.sort(key=lambda d: (d["distance_km"] is None, d["distance_km"] or 0))
    return lots


@router.get("/lots/mine")
def my_lots(user: User = Depends(recycler), db: Session = Depends(get_db)):
    lots = db.scalars(
        select(RecyclableLot).where(RecyclableLot.recycler_id == user.id).order_by(RecyclableLot.id.desc())
    ).all()
    return [_with_distance(lot, user) for lot in lots]


@router.post("/lots/{lot_id}/claim")
def claim(lot_id: int, user: User = Depends(recycler), db: Session = Depends(get_db)):
    lot = db.get(RecyclableLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if lot.status != "available":
        raise HTTPException(409, "Someone already claimed this lot")
    lot.status, lot.recycler_id, lot.claimed_at = "claimed", user.id, utcnow()
    db.commit()
    return _with_distance(lot, user)


@router.post("/lots/{lot_id}/release")
def release(lot_id: int, user: User = Depends(recycler), db: Session = Depends(get_db)):
    lot = db.get(RecyclableLot, lot_id)
    if not lot or lot.recycler_id != user.id or lot.status != "claimed":
        raise HTTPException(400, "You can only release a lot you have claimed")
    lot.status, lot.recycler_id, lot.claimed_at = "available", None, None
    db.commit()
    return _with_distance(lot, user)


@router.post("/lots/{lot_id}/picked")
def picked(lot_id: int, user: User = Depends(recycler), db: Session = Depends(get_db)):
    lot = db.get(RecyclableLot, lot_id)
    if not lot or lot.recycler_id != user.id or lot.status != "claimed":
        raise HTTPException(400, "You can only confirm pickup of a lot you have claimed")
    lot.status, lot.picked_at = "picked", utcnow()
    db.commit()
    return _with_distance(lot, user)


@router.get("/stats")
def stats(user: User = Depends(recycler), db: Session = Depends(get_db)):
    mine = db.scalars(select(RecyclableLot).where(RecyclableLot.recycler_id == user.id)).all()
    picked_lots = [lot for lot in mine if lot.status == "picked"]
    available = db.scalars(select(RecyclableLot).where(RecyclableLot.status == "available")).all()
    by_material: dict[str, float] = {}
    for lot in picked_lots:
        by_material[lot.material] = by_material.get(lot.material, 0) + lot.kg
    return {
        "available_lots": len(available),
        "available_kg": round(sum(lot.kg for lot in available), 1),
        "claimed": sum(1 for lot in mine if lot.status == "claimed"),
        "picked": len(picked_lots),
        "kg_recovered": round(sum(lot.kg for lot in picked_lots), 1),
        "kg_by_material": {k: round(v, 1) for k, v in by_material.items()},
        "value_inr": round(sum(lot.kg * lot.price_per_kg for lot in picked_lots), 2),
    }
