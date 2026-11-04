"""Baseline planner: priority-aware greedy nearest neighbour (one truck at a time).
Kept to compare against DBSCAN + CVRP in the evaluation."""
import time

from ..geo import AVG_SPEED_KMPH, road_km
from .model import Job, PlannedRoute, Truck

MAX_STOPS = 40
DISTANCE_WEIGHT = 1.0  # priority points one km of detour is worth


def solve_greedy(trucks: list[Truck], jobs: list[Job], shift_min: float = 480) -> tuple[list[PlannedRoute], list[Job], str, float]:
    t0 = time.time()
    left = sorted(jobs, key=lambda j: -j.priority)
    routes: list[PlannedRoute] = []
    for t in trucks:
        lat, lng = t.start
        seq, legs, arrivals, load, clock, km = [], [], [], 0.0, 0.0, 0.0
        while len(seq) < MAX_STOPS:
            best, best_score = None, float("-inf")
            for j in left:
                if j.waste_type not in t.allowed or load + j.kg > t.capacity_kg:
                    continue
                score = j.priority - DISTANCE_WEIGHT * road_km(lat, lng, j.lat, j.lng)
                if score > best_score:
                    best, best_score = j, score
            if best is None:
                break
            leg = road_km(lat, lng, best.lat, best.lng)
            back = road_km(best.lat, best.lng, *t.end)
            if clock + (leg + back) / AVG_SPEED_KMPH * 60 + best.service_min > shift_min:
                break
            clock += leg / AVG_SPEED_KMPH * 60
            arrivals.append(clock)
            clock += best.service_min
            km += leg
            legs.append(round(leg, 3))
            load += best.kg
            seq.append(best)
            left.remove(best)
            lat, lng = best.lat, best.lng
        if seq:
            km += road_km(lat, lng, *t.end)
            clock += road_km(lat, lng, *t.end) / AVG_SPEED_KMPH * 60
            routes.append(PlannedRoute(truck=t, jobs=seq, km=round(km, 3), minutes=clock, load_kg=round(load, 1),
                                       arrival_min=arrivals, legs_km=legs))
    return routes, left, "haversine", round(time.time() - t0, 3)
