"""Stage 2 - Capacitated Vehicle Routing Problem with SLA time windows (Google OR-Tools).

Model
-----
* Nodes: every truck depot + every dispatched request.
* Cost to minimise: total driven distance (metres)
                    + a fixed cost per truck used (fewer trucks = less fuel/crew)
                    + lateness penalties (soft SLA deadlines, weighted by priority)
                    + penalties for requests left unserved.
* Constraints:
    - Capacity:      load on each truck <= its capacity (kg)
    - Compatibility: a request can only go on a truck allowed to carry its waste type
                     (e.g. hazardous -> Hazmat van only)
    - Shift length:  every route fits in one shift (default 8 h incl. 4 min loading per stop)
    - SLA deadlines: soft upper bound on arrival time; being late costs
                     (priority x minutes late), so urgent requests are visited early
    - Priority:      every request is optional with a drop-penalty; hazardous / critical /
                     soon-due requests get a huge penalty (effectively mandatory), while
                     low-priority ones may wait for the next run if trucks are full.
Search: PATH_CHEAPEST_ARC initial solution, then Guided Local Search for a few seconds.
"""
import math
import time
from dataclasses import dataclass

import numpy as np

from .distance import build_matrices
from .model import Job, PlannedRoute, Truck


@dataclass
class CVRPParams:
    shift_min: float = 480          # max route duration
    time_limit_s: float = 5.0       # search time
    vehicle_fixed_cost_m: int = 3000  # using a truck "costs" like driving 3 km
    late_cost_per_min: float = 120  # metres-equivalent per minute late, per priority point
    mandatory_penalty: int = 10_000_000
    optional_base_penalty: int = 40_000
    max_stops: int = 40


def _is_mandatory(j: Job, p: CVRPParams) -> bool:
    return j.waste_type == "hazardous" or j.urgency == "critical" or j.deadline_min <= p.shift_min


def solve_cvrp(trucks: list[Truck], jobs: list[Job], p: CVRPParams | None = None) -> tuple[list[PlannedRoute], list[Job], str, float]:
    """Returns (routes, dropped_jobs, distance_source, seconds)."""
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    p = p or CVRPParams()
    t0 = time.time()
    if not trucks or not jobs:
        return [], list(jobs), "none", 0.0

    # jobs no truck can carry are dropped up front
    routable = [j for j in jobs if any(j.waste_type in t.allowed for t in trucks)]
    dropped = [j for j in jobs if j not in routable]
    if not routable:
        return [], dropped, "none", 0.0

    # ---- nodes: unique depots first, then jobs
    depot_pts: list[tuple[float, float]] = []
    start_idx, end_idx = [], []
    for t in trucks:
        for pt, lst in ((t.start, start_idx), (t.end, end_idx)):
            if pt not in depot_pts:
                depot_pts.append(pt)
            lst.append(depot_pts.index(pt))
    n_dep = len(depot_pts)
    points = depot_pts + [(j.lat, j.lng) for j in routable]
    km, minutes, source = build_matrices(points)
    dist_m = np.rint(km * 1000).astype(int)
    service_s = [0] * n_dep + [int(j.service_min * 60) for j in routable]
    travel_s = np.rint(minutes * 60).astype(int)

    manager = pywrapcp.RoutingIndexManager(len(points), len(trucks), start_idx, end_idx)
    routing = pywrapcp.RoutingModel(manager)

    # ---- cost: distance
    def dist_cb(i, j):
        return int(dist_m[manager.IndexToNode(i), manager.IndexToNode(j)])

    dist_idx = routing.RegisterTransitCallback(dist_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(dist_idx)
    routing.SetFixedCostOfAllVehicles(p.vehicle_fixed_cost_m)

    # ---- capacity (0.1 kg units)
    demands = [0] * n_dep + [int(math.ceil(j.kg * 10)) for j in routable]

    def demand_cb(i):
        return demands[manager.IndexToNode(i)]

    dem_idx = routing.RegisterUnaryTransitCallback(demand_cb)
    routing.AddDimensionWithVehicleCapacity(dem_idx, 0, [int(t.capacity_kg * 10) for t in trucks], True, "Load")

    # ---- stop count
    count_idx = routing.RegisterUnaryTransitCallback(lambda i: 0 if manager.IndexToNode(i) < n_dep else 1)
    routing.AddDimension(count_idx, 0, p.max_stops, True, "Stops")

    # ---- time (seconds): travel + loading time at the origin stop
    def time_cb(i, j):
        a, b = manager.IndexToNode(i), manager.IndexToNode(j)
        return int(travel_s[a, b] + service_s[a])

    time_idx = routing.RegisterTransitCallback(time_cb)
    horizon = int(p.shift_min * 60)
    routing.AddDimension(time_idx, 0, horizon, True, "Time")
    time_dim = routing.GetDimensionOrDie("Time")

    for k, j in enumerate(routable):
        node = n_dep + k
        index = manager.NodeToIndex(node)
        # SLA as a soft deadline, weighted by priority
        deadline_s = int(max(0.0, j.deadline_min) * 60)
        if deadline_s < horizon:
            coef = max(1, int(round(p.late_cost_per_min * max(1.0, j.priority) / 60)))
            time_dim.SetCumulVarSoftUpperBound(index, deadline_s, coef)
        # waste-type compatibility
        allowed = [v for v, t in enumerate(trucks) if j.waste_type in t.allowed]
        routing.VehicleVar(index).SetValues([-1] + allowed)
        # optional with penalty (priority-aware)
        penalty = p.mandatory_penalty if _is_mandatory(j, p) else int(p.optional_base_penalty + 3000 * j.priority)
        routing.AddDisjunction([index], penalty)

    for v in range(len(trucks)):
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.End(v)))

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromMilliseconds(int(p.time_limit_s * 1000))

    solution = routing.SolveWithParameters(params)
    secs = round(time.time() - t0, 2)
    if solution is None:
        return [], dropped + routable, source, secs

    routes: list[PlannedRoute] = []
    served: set[int] = set()
    for v, truck in enumerate(trucks):
        idx = routing.Start(v)
        seq: list[Job] = []
        arrivals: list[float] = []
        legs: list[float] = []
        route_km = 0.0
        while not routing.IsEnd(idx):
            nxt = solution.Value(routing.NextVar(idx))
            a, b = manager.IndexToNode(idx), manager.IndexToNode(nxt)
            route_km += float(km[a, b])
            if b >= n_dep:
                seq.append(routable[b - n_dep])
                arrivals.append(solution.Value(time_dim.CumulVar(nxt)) / 60.0)
                legs.append(round(float(km[a, b]), 3))
            idx = nxt
        if seq:
            served.update(j.id for j in seq)
            routes.append(
                PlannedRoute(
                    truck=truck, jobs=seq, km=round(route_km, 3),
                    minutes=solution.Value(time_dim.CumulVar(routing.End(v))) / 60.0,
                    load_kg=round(sum(j.kg for j in seq), 1), arrival_min=arrivals, legs_km=legs,
                )
            )
    dropped += [j for j in routable if j.id not in served]
    return routes, dropped, source, secs
