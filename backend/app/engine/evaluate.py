"""Evaluation: simulate one day of waste collection in Vellore and compare strategies.

Strategies (same requests, same fleet, same depot):
  fixed  - TODAY'S SYSTEM. Every generator belongs to a fixed sector. Each compactor-type truck
           drives a fixed door-to-door tour through ALL generators of its sector at 07:00 and
           14:00, whether they have waste or not (stopping only where there is waste). The hazmat
           van does a fixed 14:00 run for the special waste known by then.
  greedy - on-demand, re-planned every 2 h with the greedy nearest-neighbour planner.
  smart  - on-demand, re-planned every 2 h with DBSCAN + OR-Tools CVRP (SmartRoute).

Timeline: requests appear 06:00-19:00 (morning peak). On-demand strategies re-plan every
`replan_h` hours from 07:00 to 19:00 (default 4 h -> 07, 11, 15, 19); each slot's routes must finish
before the next slot. Anything not collected by the end of the day counts as "not collected
today" (and late if its deadline has passed). `tradeoff()` varies the re-planning interval.

Fuel 2.5 km/L for a loaded municipal compactor, 2.68 kg CO2 per litre of diesel (indicative).

Run from the backend folder:
    python -m app.engine.evaluate                 # one scenario, printed
    python -m app.engine.evaluate --sweep         # 50..250 requests/day -> evaluation_results.csv
"""
import argparse
import csv
import math
import random
import time
from dataclasses import asdict, dataclass, field

from .. import config
from ..geo import AVG_SPEED_KMPH, SERVICE_MIN_PER_STOP, road_km
from .clustering import ClusterParams, select_for_dispatch
from .cvrp import CVRPParams, solve_cvrp
from .greedy import solve_greedy
from .model import Job, Truck

KM_PER_LITRE = 2.5
CO2_PER_LITRE = 2.68
DAY_START, DAY_END = 6 * 60, 19 * 60        # requests arrive (minutes after midnight)
FIXED_RUNS = [7 * 60, 14 * 60]
END_OF_DAY = 21 * 60

WARDS = {  # centre lat, lng, spread, profile (same geography as the demo data)
    "Katpadi": (12.9716, 79.1590, 0.006, "students"), "Gandhi Nagar": (12.9535, 79.1365, 0.005, "residential"),
    "Sathuvachari": (12.9330, 79.1580, 0.006, "residential"), "Thottapalayam": (12.9230, 79.1390, 0.004, "mixed"),
    "Saidapet": (12.9125, 79.1265, 0.004, "residential"), "Velapadi": (12.9195, 79.1320, 0.003, "market"),
    "Kagithapattarai": (12.9285, 79.1255, 0.004, "residential"), "Allapuram": (12.9045, 79.1480, 0.005, "industrial"),
    "Bagayam": (12.8880, 79.1345, 0.006, "residential"), "Shenbakkam": (12.9340, 79.1680, 0.005, "residential"),
}
MIX = {
    "residential": {"organic": 46, "recyclable": 24, "general": 20, "e_waste": 6, "hazardous": 4},
    "students": {"organic": 30, "recyclable": 38, "general": 16, "e_waste": 12, "hazardous": 4},
    "market": {"organic": 64, "recyclable": 18, "general": 14, "e_waste": 2, "hazardous": 2},
    "mixed": {"organic": 42, "recyclable": 26, "general": 20, "e_waste": 7, "hazardous": 5},
    "industrial": {"organic": 24, "recyclable": 26, "general": 22, "e_waste": 12, "hazardous": 16},
}
URG = {"low": 30, "medium": 46, "high": 19, "critical": 5}
BASE_KG = {"organic": 5.5, "recyclable": 4.0, "general": 5.0, "e_waste": 3.0, "hazardous": 1.5}


def default_fleet() -> list[Truck]:
    d = config.DEFAULT_DEPOT
    return [
        Truck(1, 2000, {"organic", "general"}, d, d, "Compactor 1"),
        Truck(2, 2000, {"organic", "general", "recyclable"}, d, d, "Compactor 2"),
        Truck(3, 1200, {"recyclable", "e_waste", "general"}, d, d, "Recycling Truck"),
        Truck(4, 400, {"hazardous", "e_waste"}, d, d, "Hazmat Van"),
    ]


@dataclass
class SimRequest:
    id: int
    gen: int
    lat: float
    lng: float
    kg: float
    waste_type: str
    urgency: str
    created: float      # minutes after midnight
    deadline: float     # minutes after midnight
    served: float | None = None


@dataclass
class Scenario:
    generators: list[tuple[float, float, str]]  # lat, lng, ward
    requests: list[SimRequest]


def make_scenario(n_requests: int = 120, n_generators: int = 300, seed: int = 7) -> Scenario:
    rnd = random.Random(seed)
    names = list(WARDS)
    gens = []
    for i in range(n_generators):
        w = names[i % len(names)]
        lat, lng, s, _ = WARDS[w]
        gens.append((lat + rnd.uniform(-s, s), lng + rnd.uniform(-s, s), w))
    reqs = []
    for i in range(n_requests):
        g = rnd.randrange(n_generators)
        lat, lng, w = gens[g]
        wt = rnd.choices(list(MIX[WARDS[w][3]]), weights=list(MIX[WARDS[w][3]].values()))[0]
        urg = rnd.choices(list(URG), weights=list(URG.values()))[0]
        # morning-heavy arrivals: mixture of a 07-10h peak and a flat background
        t = rnd.uniform(6 * 60, 10 * 60) if rnd.random() < 0.45 else rnd.uniform(DAY_START, DAY_END)
        biz = 4 if rnd.random() < 0.15 else 1
        kg = max(0.5, BASE_KG[wt] * rnd.uniform(0.5, 1.7) * biz)
        hours = config.WASTE_TYPES[wt]["base_sla_hours"] * config.URGENCY_LEVELS[urg]["sla_factor"]
        reqs.append(SimRequest(i + 1, g, lat, lng, round(kg, 1), wt, urg, t, t + hours * 60))
    return Scenario(gens, reqs)


def priority(r: SimRequest, now: float) -> float:
    type_p = config.WASTE_TYPES[r.waste_type]["priority"]
    urg_p = config.URGENCY_LEVELS[r.urgency]["bonus"]
    hours_left = (r.deadline - now) / 60
    time_p = 5.0 if hours_left <= 0 else max(0.0, 5.0 - hours_left / 6)
    return type_p * 2 + urg_p * 1.5 + time_p


@dataclass
class Metrics:
    strategy: str
    requests: int
    collected: int
    collected_pct: float
    on_time_pct: float
    late_hazardous: int
    avg_wait_h: float
    total_km: float
    fuel_l: float
    co2_kg: float
    km_per_pickup: float
    truck_trips: int
    utilization_pct: float
    compute_s: float
    timeline: list[dict] = field(default_factory=list)  # per slot: time, km, collected


def _finish(name: str, reqs: list[SimRequest], km: float, trips: int, loads: list[tuple[float, float]],
            compute: float, timeline: list[dict]) -> Metrics:
    served = [r for r in reqs if r.served is not None]
    on_time = [r for r in served if r.served <= r.deadline]
    late_haz = sum(1 for r in reqs if r.waste_type == "hazardous" and (r.served is None or r.served > r.deadline))
    wait = sum(r.served - r.created for r in served) / len(served) / 60 if served else 0
    util = 100 * sum(lo for lo, _ in loads) / sum(c for _, c in loads) if loads else 0
    fuel = km / KM_PER_LITRE
    return Metrics(name, len(reqs), len(served), round(100 * len(served) / len(reqs), 1),
                   round(100 * len(on_time) / len(reqs), 1), late_haz, round(wait, 2), round(km, 1),
                   round(fuel, 1), round(fuel * CO2_PER_LITRE, 1), round(km / len(served), 2) if served else 0,
                   trips, round(util, 1), round(compute, 1), timeline)


# ---------------------------------------------------------------------- fixed schedule
def _tour(points: list[tuple[float, float]], start: tuple[float, float]) -> list[int]:
    """Nearest-neighbour tour + a time-capped 2-opt polish. Returns visiting order (indices)."""
    if not points:
        return []
    left = set(range(len(points)))
    order, cur = [], start
    while left:
        nxt = min(left, key=lambda i: road_km(*cur, *points[i]))
        order.append(nxt)
        left.remove(nxt)
        cur = points[nxt]
    path = [start] + [points[i] for i in order] + [start]
    t0, improved = time.time(), True
    while improved and time.time() - t0 < 1.5:
        improved = False
        for i in range(1, len(path) - 2):
            for j in range(i + 1, len(path) - 1):
                a, b, c, d = path[i - 1], path[i], path[j], path[j + 1]
                if road_km(*a, *c) + road_km(*b, *d) < road_km(*a, *b) + road_km(*c, *d) - 1e-9:
                    path[i:j + 1] = reversed(path[i:j + 1])
                    order[i - 1:j] = reversed(order[i - 1:j])
                    improved = True
    return order


def simulate_fixed(sc: Scenario, fleet: list[Truck]) -> Metrics:
    t0 = time.time()
    reqs = [SimRequest(**asdict(r)) for r in sc.requests]
    depot = fleet[0].start
    general = [t for t in fleet if "hazardous" not in t.allowed]
    hazmat = [t for t in fleet if "hazardous" in t.allowed]
    # sectors: generators split by bearing from the depot into one sector per general truck
    bearing = lambda p: math.atan2(p[1] - depot[1], p[0] - depot[0])  # noqa: E731
    gen_idx = sorted(range(len(sc.generators)), key=lambda i: bearing(sc.generators[i][:2]))
    per = math.ceil(len(gen_idx) / len(general))
    sectors = [gen_idx[k * per:(k + 1) * per] for k in range(len(general))]
    tours = [[sec[i] for i in _tour([sc.generators[g][:2] for g in sec], depot)] for sec in sectors]

    km, trips, loads, timeline = 0.0, 0, [], []
    special = {"hazardous", "e_waste"}
    for run in FIXED_RUNS:
        run_km = 0.0
        for truck, tour in zip(general, tours):
            trips += 1
            pos, clock, load = depot, float(run), 0.0
            for g in tour:  # drives past EVERY generator of the sector
                pt = sc.generators[g][:2]
                leg = road_km(*pos, *pt)
                run_km += leg
                clock += leg / AVG_SPEED_KMPH * 60
                pos = pt
                waiting = [r for r in reqs if r.gen == g and r.served is None and r.created <= clock
                           and r.waste_type not in special]
                if waiting:
                    kg = sum(r.kg for r in waiting)
                    if load + kg > truck.capacity_kg:  # unload at depot and come back
                        run_km += 2 * road_km(*pos, *depot)
                        clock += 2 * road_km(*pos, *depot) / AVG_SPEED_KMPH * 60
                        loads.append((load, truck.capacity_kg))
                        load = 0.0
                    clock += SERVICE_MIN_PER_STOP
                    for r in waiting:
                        r.served = clock
                    load += kg
            run_km += road_km(*pos, *depot)
            loads.append((load, truck.capacity_kg))
        if run == FIXED_RUNS[-1] and hazmat:  # special-waste run once a day
            van = hazmat[0]
            todo = [r for r in reqs if r.waste_type in special and r.served is None and r.created <= run]
            order = _tour([(r.lat, r.lng) for r in todo], depot)
            pos, clock = depot, float(run)
            for i in order:
                r = todo[i]
                leg = road_km(*pos, r.lat, r.lng)
                run_km += leg
                clock += leg / AVG_SPEED_KMPH * 60 + SERVICE_MIN_PER_STOP
                r.served, pos = clock, (r.lat, r.lng)
            run_km += road_km(*pos, *depot)
            trips += 1
            loads.append((sum(r.kg for r in todo), van.capacity_kg))
        km += run_km
        timeline.append({"time": run, "km": round(km, 1), "collected": sum(1 for r in reqs if r.served is not None)})
    return _finish("fixed", reqs, km, trips, loads, time.time() - t0, timeline)


# ---------------------------------------------------------------------- on-demand (greedy / smart)
def slots_for(replan_h: float) -> list[int]:
    n = int(12 // replan_h) + 1
    return [int(7 * 60 + replan_h * 60 * k) for k in range(n)]  # 07:00 ... <=19:00


def simulate_on_demand(sc: Scenario, fleet: list[Truck], strategy: str, time_limit_s: float = 1.5,
                       cparams: ClusterParams | None = None, replan_h: float = 4) -> Metrics:
    t0 = time.time()
    SLOTS, SLOT_LEN = slots_for(replan_h), int(replan_h * 60)
    reqs = [SimRequest(**asdict(r)) for r in sc.requests]
    by_id = {r.id: r for r in reqs}
    km, trips, loads, timeline = 0.0, 0, [], []
    for k, slot in enumerate(SLOTS):
        pending = [r for r in reqs if r.served is None and r.created <= slot]
        jobs = [Job(r.id, r.lat, r.lng, r.kg, r.waste_type, r.urgency, priority(r, slot), r.deadline - slot)
                for r in pending]
        if strategy == "greedy":
            routes, _, _, _ = solve_greedy(fleet, jobs, shift_min=SLOT_LEN)
        else:
            cp = cparams or ClusterParams()
            last = k == len(SLOTS) - 1
            dispatch, _, _ = select_for_dispatch(jobs, ClusterParams(cp.eps_km, cp.min_samples, cp.attach_km,
                                                                     cp.urgent_within_min, defer_enabled=not last))
            routes, _, _, _ = solve_cvrp(fleet, dispatch, CVRPParams(shift_min=SLOT_LEN, time_limit_s=time_limit_s))
        for rt in routes:
            trips += 1
            km += rt.km
            loads.append((rt.load_kg, rt.truck.capacity_kg))
            for j, arr in zip(rt.jobs, rt.arrival_min):
                by_id[j.id].served = slot + arr
        timeline.append({"time": slot, "km": round(km, 1), "collected": sum(1 for r in reqs if r.served is not None)})
    return _finish(strategy, reqs, km, trips, loads, time.time() - t0, timeline)


def evaluate(n_requests: int = 120, n_generators: int = 300, seed: int = 7, time_limit_s: float = 1.5,
             replan_h: float = 4) -> dict:
    sc = make_scenario(n_requests, n_generators, seed)
    fleet = default_fleet()
    results = [simulate_fixed(sc, fleet), simulate_on_demand(sc, fleet, "greedy", replan_h=replan_h),
               simulate_on_demand(sc, fleet, "smart", time_limit_s, replan_h=replan_h)]
    base = results[0]

    def pct(a, b):
        return round(100 * (b - a) / a, 1) if a else None

    smart = results[2]
    return {
        "scenario": {"requests": n_requests, "generators": n_generators, "seed": seed, "replan_h": replan_h,
                     "fleet": [{"name": t.name, "capacity_kg": t.capacity_kg, "allowed": sorted(t.allowed)} for t in fleet],
                     "by_type": {wt: sum(1 for r in sc.requests if r.waste_type == wt) for wt in config.WASTE_TYPES}},
        "results": [asdict(m) for m in results],
        "smart_vs_fixed": {
            "km_change_pct": pct(base.total_km, smart.total_km),
            "co2_saved_kg": round(base.co2_kg - smart.co2_kg, 1),
            "on_time_change_pts": round(smart.on_time_pct - base.on_time_pct, 1),
            "wait_change_pct": pct(base.avg_wait_h, smart.avg_wait_h),
        },
        "assumptions": [
            "Same requests, same 4 trucks and the same depot for every strategy.",
            "Fixed schedule: 3 trucks tour all registered generators of their sector at 07:00 and 14:00; "
            "the hazmat van does one 14:00 run for hazardous and e-waste.",
            f"On-demand strategies re-plan every {replan_h:g} h between 07:00 and 19:00; each route must finish "
            "before the next re-plan.",
            f"Road distance = Haversine x {1.35}; average speed {AVG_SPEED_KMPH:.0f} km/h; 4 min loading per stop.",
            f"Fuel {KM_PER_LITRE} km/L, {CO2_PER_LITRE} kg CO2 per litre of diesel (indicative values).",
        ],
    }


def tradeoff(n_requests: int = 120, seed: int = 7, intervals=(2, 3, 4, 6), time_limit_s: float = 1.0) -> dict:
    """How the re-planning interval trades kilometres against punctuality."""
    sc = make_scenario(n_requests, 300, seed)
    fleet = default_fleet()
    fixed = simulate_fixed(sc, fleet)
    rows = []
    for h in intervals:
        m = simulate_on_demand(sc, fleet, "smart", time_limit_s, replan_h=h)
        rows.append({"replan_h": h, "total_km": m.total_km, "on_time_pct": m.on_time_pct,
                     "avg_wait_h": m.avg_wait_h, "truck_trips": m.truck_trips, "late_hazardous": m.late_hazardous})
    return {"fixed": {"total_km": fixed.total_km, "on_time_pct": fixed.on_time_pct, "avg_wait_h": fixed.avg_wait_h},
            "smart": rows}


def demand_sweep(volumes=(50, 100, 150, 200, 250), seed: int = 7, time_limit_s: float = 1.0) -> list[dict]:
    """Fixed vs SmartRoute as daily demand grows (one seed - quick enough for the dashboard)."""
    out = []
    for n in volumes:
        sc = make_scenario(n, 300, seed)
        fleet = default_fleet()
        f = simulate_fixed(sc, fleet)
        m = simulate_on_demand(sc, fleet, "smart", time_limit_s)
        out.append({"requests": n, "fixed_km": f.total_km, "smart_km": m.total_km,
                    "fixed_on_time": f.on_time_pct, "smart_on_time": m.on_time_pct,
                    "fixed_collected": f.collected_pct, "smart_collected": m.collected_pct})
    return out


def sweep(volumes=(50, 100, 150, 200, 250), seeds=(1, 2, 3), out="evaluation_results.csv") -> list[dict]:
    rows = []
    for n in volumes:
        for s in seeds:
            res = evaluate(n, 300, s, time_limit_s=1.5)
            for m in res["results"]:
                m = {k: v for k, v in m.items() if k != "timeline"}
                rows.append({"requests_per_day": n, "seed": s, **m})
            print(f"{n:4d} req seed {s}: " + " | ".join(
                f"{m['strategy']}: {m['total_km']:6.1f} km, on-time {m['on_time_pct']:5.1f}%" for m in res["results"]))
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print("saved", out)
    return rows


PUBLISHED = __file__.replace("evaluate.py", "eval_results.json")


def publish(out: str = PUBLISHED) -> dict:
    """Run the full study once and save it for the dashboard (too slow to run live on a free server)."""
    import json
    from collections import defaultdict
    from datetime import date

    main = evaluate(120, 300, 7)
    rows = sweep()
    agg: dict = defaultdict(lambda: defaultdict(list))
    for r in rows:
        for k in ("total_km", "on_time_pct", "collected_pct", "avg_wait_h", "co2_kg"):
            agg[(r["requests_per_day"], r["strategy"])][k].append(r[k])
    demand = []
    for n in sorted({r["requests_per_day"] for r in rows}):
        row = {"requests": n}
        for st in ("fixed", "greedy", "smart"):
            for k, vals in agg[(n, st)].items():
                row[f"{st}_{k}"] = round(sum(vals) / len(vals), 1)
        demand.append(row)
    data = {"generated": date.today().isoformat(), "main": main, "demand_sweep": demand,
            "demand_seeds": 3, "tradeoff": tradeoff(120, 7)}
    with open(out, "w") as f:
        json.dump(data, f, indent=1)
    print("published", out)
    return data


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--publish", action="store_true", help="run the full study and save eval_results.json")
    ap.add_argument("--requests", type=int, default=120)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    if a.publish:
        publish()
    elif a.sweep:
        sweep()
    else:
        r = evaluate(a.requests, 300, a.seed)
        for m in r["results"]:
            print({k: v for k, v in m.items() if k != "timeline"})
        print(r["smart_vs_fixed"])
