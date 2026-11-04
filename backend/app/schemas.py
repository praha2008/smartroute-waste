"""Request / response shapes (Pydantic)."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

# Naive UTC datetimes are sent to clients as ISO strings with a 'Z' suffix
UTC = Annotated[datetime, PlainSerializer(lambda d: d.isoformat(timespec="seconds") + "Z", return_type=str)]

WasteType = Literal["organic", "recyclable", "hazardous", "e_waste", "general"]
Urgency = Literal["low", "medium", "high", "critical"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- auth / users
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=128)
    phone: str = Field(min_length=10, max_length=16)
    language: str | None = None
    role: Literal["citizen", "recycler"] = "citizen"
    account_type: Literal["household", "business"] | None = "household"
    organization: str | None = None
    address: str | None = None
    ward: str | None = None
    lat: float | None = None
    lng: float | None = None


class LoginIn(BaseModel):
    email: str  # email OR phone number
    password: str


class PhoneIn(BaseModel):
    phone: str


class VerifyPhoneIn(BaseModel):
    phone: str
    code: str = Field(min_length=4, max_length=8)


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6, max_length=128)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class CodeSentOut(BaseModel):
    ok: bool = True
    channel: str
    target: str
    demo: bool = False
    dev_code: str | None = None


class UserOut(ORM):
    id: int
    name: str
    email: str
    phone: str | None
    role: str
    account_type: str | None
    organization: str | None
    address: str | None
    ward: str | None
    lat: float | None
    lng: float | None
    green_credits: int
    reliability: float
    phone_verified: bool | None = None
    approved: bool | None = None
    must_change_password: bool | None = None
    language: str | None = None
    is_active: bool = True
    created_at: UTC


class TokenOut(BaseModel):
    token: str
    user: UserOut


class ProfileUpdate(BaseModel):
    name: str | None = None
    language: str | None = None
    address: str | None = None
    ward: str | None = None
    organization: str | None = None
    lat: float | None = None
    lng: float | None = None


class StaffCreate(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    phone: str | None = None
    role: Literal["collector", "admin", "recycler", "citizen"] = "collector"


# ---------------------------------------------------------------- requests
class PickupCreate(BaseModel):
    waste_type: WasteType
    urgency: Urgency = "medium"
    est_kg: float = Field(gt=0, le=2000)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    address: str | None = None
    notes: str | None = None


class VehicleBrief(ORM):
    id: int
    reg_no: str
    name: str
    cur_lat: float | None
    cur_lng: float | None
    last_seen: UTC | None


class PickupOut(ORM):
    id: int
    user_id: int
    waste_type: str
    urgency: str
    est_kg: float
    actual_kg: float | None
    lat: float
    lng: float
    address: str | None
    notes: str | None
    photo_url: str | None
    proof_photo_url: str | None
    status: str
    priority_score: float
    sla_deadline: UTC
    cluster_id: int | None
    route_id: int | None
    credits_awarded: int
    skip_reason: str | None
    ai_type: str | None = None
    ai_confidence: float | None = None
    ai_item: str | None = None
    ai_mismatch: bool = False
    created_at: UTC
    scheduled_at: UTC | None
    collected_at: UTC | None


class PickupDetail(PickupOut):
    requester_name: str | None = None
    requester_phone: str | None = None
    vehicle: VehicleBrief | None = None
    stops_before: int | None = None  # how many stops before the truck reaches you
    eta: UTC | None = None


# ---------------------------------------------------------------- vehicles / routes
class VehicleIn(BaseModel):
    reg_no: str
    name: str
    capacity_kg: float = Field(gt=0)
    allowed_types: list[WasteType]
    depot_lat: float
    depot_lng: float
    driver_id: int | None = None


class VehicleOut(ORM):
    id: int
    reg_no: str
    name: str
    capacity_kg: float
    allowed_types: str
    depot_lat: float
    depot_lng: float
    driver_id: int | None
    status: str
    cur_lat: float | None
    cur_lng: float | None
    last_seen: UTC | None
    driver_name: str | None = None


class StopOut(ORM):
    id: int
    seq: int
    status: str
    eta: UTC | None
    leg_km: float
    completed_at: UTC | None
    request: PickupDetail


class RouteOut(ORM):
    id: int
    vehicle_id: int
    status: str
    planner: str
    total_km: float
    total_kg: float
    created_at: UTC
    started_at: UTC | None
    completed_at: UTC | None
    vehicle: VehicleOut
    stops: list[StopOut]


class CollectIn(BaseModel):
    actual_kg: float = Field(ge=0, le=5000)
    note: str | None = None


class PhotoIn(BaseModel):
    data: str = Field(min_length=20, description="base64-encoded JPEG/PNG/WebP")


class SkipIn(BaseModel):
    reason: str = Field(min_length=2, max_length=255)


class LocationIn(BaseModel):
    lat: float
    lng: float


class PlanOut(BaseModel):
    planner: str
    planner_label: str
    routes_created: int
    requests_scheduled: int
    requests_left: int
    deferred: int
    dropped: int
    clusters: int
    total_km: float
    km_per_pickup: float | None
    distance_source: str
    solve_seconds: float
    notes: list[str]
    routes: list[int]


# ---------------------------------------------------------------- recycler
class LotOut(ORM):
    id: int
    request_id: int
    material: str
    kg: float
    price_per_kg: float
    ward: str | None
    lat: float
    lng: float
    photo_url: str | None
    status: str
    recycler_id: int | None
    created_at: UTC
    claimed_at: UTC | None
    picked_at: UTC | None


class CreditTxOut(ORM):
    id: int
    request_id: int | None
    points: int
    reason: str
    created_at: UTC
