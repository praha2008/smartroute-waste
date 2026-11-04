"""Plain data objects used by the engine. Keeping the engine independent of the
database lets the same code run on live data (planner) and on simulations (evaluation)."""
from dataclasses import dataclass, field


@dataclass
class Job:
    id: int
    lat: float
    lng: float
    kg: float                 # load to reserve on the truck (estimate, reliability-adjusted)
    waste_type: str
    urgency: str
    priority: float           # higher = more important (see services.priority_score)
    deadline_min: float       # minutes from "now" until the SLA deadline (negative = already late)
    service_min: float = 4.0  # loading time at the stop
    cluster: int | None = None


@dataclass
class Truck:
    id: int
    capacity_kg: float
    allowed: set[str]
    start: tuple[float, float]
    end: tuple[float, float]
    name: str = ""


@dataclass
class PlannedRoute:
    truck: Truck
    jobs: list[Job]
    km: float
    minutes: float
    load_kg: float
    arrival_min: list[float] = field(default_factory=list)  # minutes from start for each job
    legs_km: list[float] = field(default_factory=list)      # distance driven to reach each job


@dataclass
class PlanResult:
    routes: list[PlannedRoute]
    dropped: list[Job]         # dispatched but not routed (no capacity / no compatible truck)
    deferred: list[Job]        # held back by DBSCAN (sparse & not urgent): wait for neighbours
    clusters: dict[int, list[int]]  # cluster id -> job ids
    planner: str
    distance_source: str
    solve_seconds: float
    notes: list[str] = field(default_factory=list)

    @property
    def total_km(self) -> float:
        return sum(r.km for r in self.routes)
