"""Database tables for SmartRoute Waste."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (stored as-is, serialised with a trailing 'Z')."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    # citizen | collector | recycler | admin
    role: Mapped[str] = mapped_column(String(20), index=True)
    # household | business (citizens only)
    account_type: Mapped[str | None] = mapped_column(String(20))
    organization: Mapped[str | None] = mapped_column(String(160))  # business / recycler company name
    address: Mapped[str | None] = mapped_column(String(255))
    ward: Mapped[str | None] = mapped_column(String(60))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    green_credits: Mapped[int] = mapped_column(Integer, default=0)
    # 0..1 - how close this user's weight estimates are to the real weight
    reliability: Mapped[float] = mapped_column(Float, default=1.0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    requests: Mapped[list["PickupRequest"]] = relationship(back_populates="user", foreign_keys="PickupRequest.user_id")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    reg_no: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    capacity_kg: Mapped[float] = mapped_column(Float)
    # comma separated list of waste types this vehicle may carry
    allowed_types: Mapped[str] = mapped_column(String(200))
    depot_lat: Mapped[float] = mapped_column(Float)
    depot_lng: Mapped[float] = mapped_column(Float)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    # idle | on_route | offline
    status: Mapped[str] = mapped_column(String(20), default="idle")
    cur_lat: Mapped[float | None] = mapped_column(Float)
    cur_lng: Mapped[float | None] = mapped_column(Float)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime)

    driver: Mapped[User | None] = relationship()

    @property
    def allowed_list(self) -> list[str]:
        return [t for t in self.allowed_types.split(",") if t]


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    # planned | active | completed
    status: Mapped[str] = mapped_column(String(20), default="planned")
    planner: Mapped[str] = mapped_column(String(40), default="greedy")
    total_km: Mapped[float] = mapped_column(Float, default=0)
    total_kg: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    vehicle: Mapped[Vehicle] = relationship()
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route", order_by="RouteStop.seq", cascade="all, delete-orphan"
    )


class PickupRequest(Base):
    __tablename__ = "pickup_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    waste_type: Mapped[str] = mapped_column(String(20))
    urgency: Mapped[str] = mapped_column(String(20), default="medium")
    est_kg: Mapped[float] = mapped_column(Float)
    actual_kg: Mapped[float | None] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    address: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(255))
    proof_photo_url: Mapped[str | None] = mapped_column(String(255))
    # pending | scheduled | in_progress | collected | missed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    priority_score: Mapped[float] = mapped_column(Float, default=0)
    sla_deadline: Mapped[datetime] = mapped_column(DateTime)
    cluster_id: Mapped[int | None] = mapped_column(Integer)  # filled by DBSCAN (next phase)
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"))
    credits_awarded: Mapped[int] = mapped_column(Integer, default=0)
    skip_reason: Mapped[str | None] = mapped_column(String(255))
    # AI photo check (filled when the citizen's photo is classified)
    ai_type: Mapped[str | None] = mapped_column(String(20))
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_item: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="requests", foreign_keys=[user_id])
    route: Mapped[Route | None] = relationship()

    @property
    def ai_mismatch(self) -> bool:
        """AI is confident the photo shows a different waste type than the citizen selected."""
        return bool(self.ai_type and self.ai_confidence is not None and self.ai_confidence >= 0.70
                    and self.ai_type != self.waste_type)


class RouteStop(Base):
    __tablename__ = "route_stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id"))
    seq: Mapped[int] = mapped_column(Integer)
    # pending | done | skipped
    status: Mapped[str] = mapped_column(String(20), default="pending")
    eta: Mapped[datetime | None] = mapped_column(DateTime)
    leg_km: Mapped[float] = mapped_column(Float, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    route: Mapped[Route] = relationship(back_populates="stops")
    request: Mapped[PickupRequest] = relationship()


class RecyclableLot(Base):
    """Created automatically when a recyclable / e-waste pickup is collected.
    Recyclers browse and claim these lots in the Recycler app."""
    __tablename__ = "recyclable_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("pickup_requests.id"))
    material: Mapped[str] = mapped_column(String(20))
    kg: Mapped[float] = mapped_column(Float)
    price_per_kg: Mapped[float] = mapped_column(Float)
    ward: Mapped[str | None] = mapped_column(String(60))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    photo_url: Mapped[str | None] = mapped_column(String(255))
    # available | claimed | picked
    status: Mapped[str] = mapped_column(String(20), default="available", index=True)
    recycler_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime)
    picked_at: Mapped[datetime | None] = mapped_column(DateTime)

    recycler: Mapped[User | None] = relationship()


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    request_id: Mapped[int | None] = mapped_column(ForeignKey("pickup_requests.id"))
    points: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StoredImage(Base):
    """Photos are kept in the database (not on disk) so they survive restarts on free
    cloud hosts, whose disks are wiped on every deploy."""
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    mime: Mapped[str] = mapped_column(String(30))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AppMeta(Base):
    """Small key/value table (e.g. data_epoch, changed on every demo reset)."""
    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))
