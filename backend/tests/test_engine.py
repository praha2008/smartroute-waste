"""Unit tests for the routing engine (no database)."""
import random

from app.engine.clustering import ClusterParams, select_for_dispatch
from app.engine.cvrp import CVRPParams, solve_cvrp
from app.engine.greedy import solve_greedy
from app.engine.model import Job, Truck

DEPOT = (12.9249, 79.1353)


def job(i, lat, lng, kg=5, wt="organic", urg="medium", prio=8, deadline=600):
    return Job(id=i, lat=lat, lng=lng, kg=kg, waste_type=wt, urgency=urg, priority=prio, deadline_min=deadline)


def trucks():
    return [
        Truck(1, 100, {"organic", "general"}, DEPOT, DEPOT, "Compactor"),
        Truck(2, 60, {"recyclable", "e_waste"}, DEPOT, DEPOT, "Recycler"),
        Truck(3, 80, {"hazardous"}, DEPOT, DEPOT, "Hazmat"),
    ]


def random_jobs(n=40, seed=1):
    rnd = random.Random(seed)
    types = ["organic", "organic", "general", "recyclable", "e_waste", "hazardous"]
    return [
        job(i, 12.92 + rnd.uniform(-0.03, 0.03), 79.14 + rnd.uniform(-0.03, 0.03), kg=round(rnd.uniform(1, 8), 1),
            wt=rnd.choice(types), urg=rnd.choice(["low", "medium", "high"]), prio=rnd.uniform(4, 16))
        for i in range(1, n + 1)
    ]


def test_dbscan_groups_dense_and_defers_isolated():
    dense = [job(i, 12.9300 + i * 0.0005, 79.1400, urg="low", deadline=2000) for i in range(1, 6)]
    far_low = job(50, 12.99, 79.25, urg="low", deadline=2000)          # isolated, not urgent -> defer
    far_haz = job(51, 12.85, 79.05, wt="hazardous", deadline=2000)     # isolated but hazardous -> go
    near = job(52, 12.9330, 79.1460, urg="low", deadline=2000)         # noise but close -> attach
    dispatch, deferred, clusters = select_for_dispatch(dense + [far_low, far_haz, near], ClusterParams())
    ids = {j.id for j in dispatch}
    assert len(clusters) == 1
    assert {1, 2, 3, 4, 5, 51, 52} <= ids
    assert [j.id for j in deferred] == [50]


def test_cvrp_respects_capacity_compatibility_and_serves_mandatory():
    jobs = random_jobs()
    routes, dropped, _, _ = solve_cvrp(trucks(), jobs, CVRPParams(time_limit_s=2))
    for r in routes:
        assert sum(j.kg for j in r.jobs) <= r.truck.capacity_kg + 1e-6
        assert all(j.waste_type in r.truck.allowed for j in r.jobs)
    served = {j.id for r in routes for j in r.jobs}
    # every hazardous request must be served (capacity allows it here)
    haz = [j for j in jobs if j.waste_type == "hazardous"]
    assert sum(j.kg for j in haz) <= 80
    assert all(j.id in served for j in haz)
    assert len(served) + len(dropped) == len(jobs)


def test_cvrp_beats_greedy_on_distance():
    jobs = random_jobs(50, seed=7)
    g_routes, g_drop, _, _ = solve_greedy(trucks(), [Job(**vars(j)) for j in jobs])
    c_routes, c_drop, _, _ = solve_cvrp(trucks(), jobs, CVRPParams(time_limit_s=3))
    g_served = sum(len(r.jobs) for r in g_routes)
    c_served = sum(len(r.jobs) for r in c_routes)
    assert c_served >= g_served
    g_km = sum(r.km for r in g_routes) / g_served
    c_km = sum(r.km for r in c_routes) / c_served
    assert c_km < g_km


def test_urgent_deadline_visited_early():
    # one critical request with a 20-minute deadline among many others
    jobs = random_jobs(25, seed=3)
    for j in jobs:
        j.waste_type = "organic"
    jobs.append(job(99, 12.95, 79.17, urg="critical", prio=30, deadline=20))
    routes, _, _, _ = solve_cvrp([Truck(1, 500, {"organic"}, DEPOT, DEPOT)], jobs, CVRPParams(time_limit_s=2))
    r = routes[0]
    pos = [j.id for j in r.jobs].index(99)
    assert r.arrival_min[pos] <= 25  # reached within (about) its deadline
