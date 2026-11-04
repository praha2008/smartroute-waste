"""Fresh demo data for Vellore.
Run:  python -m app.seed --reset          -> CLEAN start: accounts + fleet, no requests (default)
      python -m app.seed --reset --full   -> also 30 days of history + 38 scenario requests
(or press "Reset demo data" in the dashboard -> Users page)

What it creates
---------------
People     1 admin, 5 drivers (1 on standby), 3 recyclers, 80 waste generators
           (64 households + 16 businesses) across 10 Vellore wards.
Fleet      5 vehicles: 2 compactors, recycling truck, hazmat van, mini tipper (in maintenance).
History    30 days of requests, collected by real two-shift routes (07:00 & 14:00 IST),
           with weekly patterns, a slight growth trend, late pickups, cancellations,
           green credits, reliability scores and recyclable lots in every state.
Today      ~45 open requests built to show every case the engine handles:
             - 4 dense "communities" (DBSCAN clusters) incl. a big market load
             - isolated, non-urgent requests (held back by the planner)
             - isolated but urgent ones (hazardous / critical -> dispatched anyway)
             - overdue and nearly-due requests (SLA)
             - a request skipped earlier ("gate locked") back in the queue, one cancelled
Logins     admin@smartroute.in / admin123   driver1..5@smartroute.in / driver123
           citizen@smartroute.in, business@smartroute.in / citizen123
           recycler@smartroute.in (also recycler2, recycler3) / recycler123
"""
import argparse
import random
from datetime import datetime, timedelta

from .config import DEFAULT_DEPOT
from .database import Base, SessionLocal, engine
from .geo import SERVICE_MIN_PER_STOP, road_km, travel_minutes
from .models import AppMeta, PickupRequest, RecyclableLot, Route, RouteStop, User, Vehicle, utcnow
from .security import hash_password
from .services import award_credits, create_lot_if_recyclable, priority_score, sla_deadline

IST = timedelta(hours=5, minutes=30)

# name, lat, lng, spread (deg), profile
WARDS = {
    "Katpadi":         (12.9716, 79.1590, 0.006, "students"),     # near VIT: recyclables, e-waste
    "Gandhi Nagar":    (12.9535, 79.1365, 0.005, "residential"),
    "Sathuvachari":    (12.9330, 79.1580, 0.006, "residential"),
    "Thottapalayam":   (12.9230, 79.1390, 0.004, "mixed"),
    "Saidapet":        (12.9125, 79.1265, 0.004, "residential"),
    "Velapadi":        (12.9195, 79.1320, 0.003, "market"),       # old town bazaar: organic heavy
    "Kagithapattarai": (12.9285, 79.1255, 0.004, "residential"),
    "Allapuram":       (12.9045, 79.1480, 0.005, "industrial"),   # workshops: hazardous more likely
    "Bagayam":         (12.8880, 79.1345, 0.006, "residential"),
    "Shenbakkam":      (12.9340, 79.1680, 0.005, "residential"),
}
PROFILE_MIX = {  # relative frequency of waste types
    "residential": {"organic": 46, "recyclable": 24, "general": 20, "e_waste": 6, "hazardous": 4},
    "students":    {"organic": 30, "recyclable": 38, "general": 16, "e_waste": 12, "hazardous": 4},
    "market":      {"organic": 64, "recyclable": 18, "general": 14, "e_waste": 2, "hazardous": 2},
    "mixed":       {"organic": 42, "recyclable": 26, "general": 20, "e_waste": 7, "hazardous": 5},
    "industrial":  {"organic": 24, "recyclable": 26, "general": 22, "e_waste": 12, "hazardous": 16},
}
URG_MIX = {"low": 30, "medium": 46, "high": 19, "critical": 5}
BASE_KG = {"organic": 5.5, "recyclable": 4.0, "general": 5.0, "e_waste": 3.0, "hazardous": 1.5}

FIRST = ["Arun", "Priya", "Karthik", "Divya", "Suresh", "Lakshmi", "Vignesh", "Meena", "Rahul", "Kavya", "Sanjay",
         "Anitha", "Prakash", "Revathi", "Dinesh", "Swathi", "Manoj", "Deepa", "Ganesh", "Nithya", "Hari", "Janani",
         "Balaji", "Keerthana", "Sathish", "Gayathri", "Mohan", "Pavithra", "Ravi", "Sowmya"]
LAST = ["Kumar", "Raman", "Subramani", "Iyer", "Natarajan", "Krishnan", "Murugan", "Pillai", "Reddy", "Shankar",
        "Rajan", "Venkatesh", "Sundaram", "Babu", "Mani"]
BUSINESSES = [  # name, ward, typical kg multiplier
    ("Hotel Annapoorna", "Gandhi Nagar", 6), ("Sri Murugan Mess", "Velapadi", 5), ("Palar Fruits Market", "Velapadi", 12),
    ("Green Leaf Restaurant", "Katpadi", 5), ("Vellore Fresh Mart", "Sathuvachari", 4), ("City Bakery", "Thottapalayam", 3),
    ("Arcot Road Textiles", "Saidapet", 3), ("Fort View Hospital Canteen", "Thottapalayam", 8),
    ("Sunrise Electronics", "Katpadi", 2), ("Kumaran Boys Hostel", "Katpadi", 7), ("Sri Lakshmi Kalyana Mandapam", "Sathuvachari", 9),
    ("Velapadi Flower Market", "Velapadi", 6), ("Allapuram Auto Works", "Allapuram", 3), ("Bagayam Supermarket", "Bagayam", 4),
    ("Shenbakkam Tea Stall", "Shenbakkam", 2), ("Kagithapattarai Sweets", "Kagithapattarai", 3),
]


def ist_to_utc(d: datetime) -> datetime:
    return d - IST


def pick(rnd: random.Random, mix: dict[str, int]) -> str:
    return rnd.choices(list(mix), weights=list(mix.values()))[0]


def near(rnd, lat, lng, spread):
    return round(lat + rnd.uniform(-spread, spread), 6), round(lng + rnd.uniform(-spread, spread), 6)


def new_request(user: User, wt: str, urg: str, kg: float, created: datetime, lat=None, lng=None, **kw) -> PickupRequest:
    r = PickupRequest(
        user=user, waste_type=wt, urgency=urg, est_kg=round(kg, 1), lat=lat or user.lat, lng=lng or user.lng,
        address=user.address, created_at=created, sla_deadline=sla_deadline(wt, urg, created), **kw,
    )
    return r


def ensure_admin(db) -> User | None:
    """Create the real admin from ADMIN_EMAIL / ADMIN_PASSWORD (Render environment) if it doesn't exist."""
    from .config import ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_PHONE

    if not (ADMIN_EMAIL and ADMIN_PASSWORD):
        return None
    u = db.query(User).filter(User.email == ADMIN_EMAIL.lower()).first()
    if u is None:
        u = User(name=ADMIN_NAME, email=ADMIN_EMAIL.lower(), role="admin", password_hash=hash_password(ADMIN_PASSWORD),
                 phone=ADMIN_PHONE or None, phone_verified=True, approved=True)
        db.add(u)
        db.commit()
    return u


def seed(reset: bool, mode: str = "clean") -> None:
    """mode="clean":   demo accounts + fleet, NO requests/history (for live demos).
    mode="full":    also 30 days of history and 38 scenario requests.
    mode="release": real deployment - only the admin from the environment + the fleet (no drivers)."""
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    rnd = random.Random(2026)
    db = SessionLocal()
    if db.query(User).count():
        print("Database already has data. Use --reset to wipe and re-seed.")
        db.close()
        return

    # new data epoch: tokens issued before this reset become invalid (see security.py)
    db.add(AppMeta(key="data_epoch", value=f"{rnd.random():.12f}-{utcnow().timestamp():.0f}"))
    if mode == "release":
        if ensure_admin(db) is None:
            db.add(User(name="Municipal Admin", email="admin@smartroute.in", role="admin", phone_verified=True,
                        password_hash=hash_password("admin123")))  # fallback; set ADMIN_EMAIL/ADMIN_PASSWORD on Render
        dlat, dlng = DEFAULT_DEPOT
        for reg, name, cap, types in [
            ("TN23 AB 1101", "Compactor 1", 2000, ["organic", "general"]),
            ("TN23 AB 1102", "Compactor 2", 2000, ["organic", "general", "recyclable"]),
            ("TN23 AB 2201", "Recycling Truck", 1200, ["recyclable", "e_waste", "general"]),
            ("TN23 AB 3301", "Hazmat Van", 400, ["hazardous", "e_waste"]),
        ]:
            db.add(Vehicle(reg_no=reg, name=name, capacity_kg=cap, allowed_types=",".join(types), depot_lat=dlat,
                           depot_lng=dlng, cur_lat=dlat, cur_lng=dlng, status="idle"))
        db.commit()
        print("Seeded RELEASE start: admin + 4 vehicles (add drivers from the dashboard)")
        db.close()
        return
    pw = {k: hash_password(f"{k}123") for k in ("admin", "driver", "citizen", "recycler")}
    now = utcnow()
    today_ist = (now + IST).replace(hour=0, minute=0, second=0, microsecond=0)

    # ------------------------------------------------------------------ staff & fleet
    db.add(User(name="Municipal Admin", email="admin@smartroute.in", role="admin", password_hash=pw["admin"], phone="+919000000001", phone_verified=True))
    drivers = []
    for i, nm in enumerate(["Ravi Shankar", "Muthu Kumar", "Senthil Nathan", "Babu Raj", "Selva Ganesh"], start=1):
        d = User(name=nm, email=f"driver{i}@smartroute.in", role="collector", password_hash=pw["driver"], phone=f"+9190000001{i:02d}", phone_verified=True)
        drivers.append(d)
        db.add(d)
    dlat, dlng = DEFAULT_DEPOT
    fleet = [
        ("TN23 AB 1101", "Compactor 1", 2000, ["organic", "general"], drivers[0], "idle"),
        ("TN23 AB 1102", "Compactor 2", 2000, ["organic", "general", "recyclable"], drivers[1], "idle"),
        ("TN23 AB 2201", "Recycling Truck", 1200, ["recyclable", "e_waste", "general"], drivers[2], "idle"),
        ("TN23 AB 3301", "Hazmat Van", 400, ["hazardous", "e_waste"], drivers[3], "idle"),
        ("TN23 AB 4401", "Mini Tipper", 700, ["organic", "general", "recyclable"], None, "offline"),  # in maintenance
    ]
    vehicles = []
    for reg, name, cap, types, drv, status in fleet:
        v = Vehicle(reg_no=reg, name=name, capacity_kg=cap, allowed_types=",".join(types), depot_lat=dlat, depot_lng=dlng,
                    driver=drv, status=status, cur_lat=dlat, cur_lng=dlng)
        vehicles.append(v)
        db.add(v)

    recyclers = []
    for i, (nm, org, ward) in enumerate([("Selvam", "Vellore Scrap Traders", "Thottapalayam"),
                                         ("Fathima", "GreenCycle Recyclers", "Katpadi"),
                                         ("Arjun", "E-Cycle Hub (e-waste)", "Sathuvachari")], start=1):
        lat, lng = near(rnd, *WARDS[ward][:3])
        r = User(name=nm, email="recycler@smartroute.in" if i == 1 else f"recycler{i}@smartroute.in", role="recycler",
                 organization=org, password_hash=pw["recycler"], phone=f"+9190000002{i:02d}", phone_verified=True, ward=ward, lat=lat, lng=lng,
                 address=f"{rnd.randint(1, 80)}, {ward}, Vellore")
        recyclers.append(r)
        db.add(r)

    # ------------------------------------------------------------------ waste generators
    citizens: list[User] = []
    ward_names = list(WARDS)
    for i in range(64):
        ward = ward_names[i % len(ward_names)]
        lat, lng = near(rnd, *WARDS[ward][:3])
        if i == 0:
            name, email, ward = "Arun Kumar", "citizen@smartroute.in", "Gandhi Nagar"
            lat, lng = 12.9541, 79.1372
        else:
            name, email = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}", f"user{i}@smartroute.in"
        c = User(name=name, email=email, role="citizen", account_type="household", password_hash=pw["citizen"],
                 phone=f"+9198{i:08d}", phone_verified=True, ward=ward, lat=lat, lng=lng, address=f"{rnd.randint(1, 140)}, {ward}, Vellore")
        citizens.append(c)
    for j, (bname, ward, _) in enumerate(BUSINESSES):
        lat, lng = near(rnd, *WARDS[ward][:3])
        email = "business@smartroute.in" if j == 0 else f"biz{j}@smartroute.in"
        c = User(name=bname, email=email, role="citizen", account_type="business", organization=bname,
                 password_hash=pw["citizen"], phone=f"+9197{j:08d}", phone_verified=True, ward=ward, lat=lat, lng=lng,
                 address=f"{rnd.randint(1, 60)}, Main Road, {ward}, Vellore")
        citizens.append(c)
    if mode == "clean":
        # a small set of accounts for live demos: 9 households in different wards + 1 business
        citizens = [c for c in citizens if c.account_type == "household"][:9] + \
                   [c for c in citizens if c.account_type == "business"][:1]
    db.add_all(citizens)
    db.flush()
    biz_mult = {b[0]: b[2] for b in BUSINESSES}
    if mode == "clean":
        db.commit()
        print("Seeded CLEAN start:", db.query(User).count(), "users |", db.query(Vehicle).count(),
              "vehicles | 0 requests")
        print("Logins: admin@smartroute.in/admin123 | driver1..5@smartroute.in/driver123 | citizen@smartroute.in, "
              "user1..8@smartroute.in, business@smartroute.in/citizen123 | recycler@smartroute.in/recycler123")
        db.close()
        return
    careless = citizens[7]  # this user's estimates are always far off -> low reliability

    def make_kg(user: User, wt: str) -> float:
        m = biz_mult.get(user.name, 1) if user.account_type == "business" else 1
        return max(0.5, BASE_KG[wt] * rnd.uniform(0.5, 1.7) * m)

    # ------------------------------------------------------------------ 30 days of history
    for day in range(30, 0, -1):
        date = today_ist - timedelta(days=day)
        weekday = date.weekday()
        trend = 1 + (30 - day) * 0.012                      # slow growth as adoption rises
        weekly = 1.25 if weekday == 6 else 1.1 if weekday == 0 else 1.0  # Sunday clean-ups, Monday backlog
        n = int(rnd.gauss(26, 3) * trend * weekly)
        requests: list[PickupRequest] = []
        for _ in range(n):
            u = rnd.choice(citizens)
            wt = pick(rnd, PROFILE_MIX[WARDS[u.ward][3]])
            urg = pick(rnd, URG_MIX)
            created = ist_to_utc(date + timedelta(hours=rnd.uniform(6, 21)))
            kg = make_kg(u, wt)
            r = new_request(u, wt, urg, kg, created, *near(rnd, u.lat, u.lng, 0.0004))
            if rnd.random() < 0.03:
                r.status, r.skip_reason = "cancelled", "Cancelled by user"
            else:
                r.status = "collected"
                factor = rnd.uniform(0.45, 0.6) if u is careless else rnd.uniform(0.8, 1.2)
                r.actual_kg = round(kg / factor if u is careless else kg * factor, 1)
            requests.append(r)
        db.add_all(requests)
        db.flush()

        # Two shifts: requests before 14:00 IST go on the 14:00 run the same day;
        # later ones go on the 07:00 run the next morning.
        afternoon = ist_to_utc(date + timedelta(hours=14))
        morning_next = min(ist_to_utc(date + timedelta(days=1, hours=7)), now - timedelta(minutes=30))
        collected = [r for r in requests if r.status == "collected"]
        for shift_start, batch in ((afternoon, [r for r in collected if r.created_at < afternoon]),
                                   (morning_next, [r for r in collected if r.created_at >= afternoon])):
            groups: dict[int, list[PickupRequest]] = {}
            for r in batch:
                if r.waste_type == "hazardous":
                    vi = 3
                elif r.waste_type == "e_waste":
                    vi = 2
                elif r.waste_type == "recyclable":
                    vi = 2 if rnd.random() < 0.7 else 1
                else:
                    vi = 0 if r.lat >= 12.925 else 1
                groups.setdefault(vi, []).append(r)
            for vi, reqs in groups.items():
                v = vehicles[vi]
                route = Route(vehicle=v, status="completed", planner="history",
                              created_at=shift_start - timedelta(minutes=10), started_at=shift_start)
                db.add(route)
                lat, lng, clock, km, left, seq = v.depot_lat, v.depot_lng, shift_start, 0.0, list(reqs), 0
                while left:
                    nxt = min(left, key=lambda q: road_km(lat, lng, q.lat, q.lng))
                    left.remove(nxt)
                    leg = road_km(lat, lng, nxt.lat, nxt.lng)
                    clock += timedelta(minutes=travel_minutes(leg))
                    seq += 1
                    km += leg
                    db.add(RouteStop(route=route, request=nxt, seq=seq, status="done", eta=clock,
                                     leg_km=round(leg, 3), completed_at=clock))
                    nxt.route, nxt.scheduled_at, nxt.collected_at = route, shift_start - timedelta(minutes=10), clock
                    clock += timedelta(minutes=SERVICE_MIN_PER_STOP)
                    lat, lng = nxt.lat, nxt.lng
                back = road_km(lat, lng, v.depot_lat, v.depot_lng)
                route.total_km = round(km + back, 2)
                route.total_kg = round(sum(q.est_kg for q in reqs), 1)
                route.completed_at = clock + timedelta(minutes=travel_minutes(back))
        db.flush()
        for r in requests:
            if r.status != "collected":
                continue
            award_credits(db, r)
            lot = create_lot_if_recyclable(db, r)
            if lot:
                lot.created_at = r.collected_at
                age = (now - r.collected_at).days
                if age > 3 or (age >= 1 and rnd.random() < 0.6):
                    buyer = recyclers[2] if r.waste_type == "e_waste" and rnd.random() < 0.7 else rnd.choice(recyclers[:2])
                    lot.recycler, lot.claimed_at = buyer, r.collected_at + timedelta(hours=rnd.uniform(1, 8))
                    if age > 3 or rnd.random() < 0.5:
                        lot.status, lot.picked_at = "picked", lot.claimed_at + timedelta(hours=rnd.uniform(4, 30))
                    else:
                        lot.status = "claimed"
        db.flush()

    # ------------------------------------------------------------------ today: scenario requests
    def by_ward(ward: str, business: bool | None = None) -> list[User]:
        return [c for c in citizens if c.ward == ward and (business is None or (c.account_type == "business") == business)]

    def mins_ago(m: float) -> datetime:
        return now - timedelta(minutes=m)

    scenario: list[PickupRequest] = []

    def add(u: User, wt: str, urg: str, kg: float, minutes_ago: float, lat=None, lng=None, **kw):
        scenario.append(new_request(u, wt, urg, kg, mins_ago(minutes_ago), lat, lng, **kw))

    # Community 1 - Katpadi (VIT side): students & hostel, recyclable heavy
    c1 = (12.9712, 79.1585)
    for k, (wt, urg, kg) in enumerate([("recyclable", "low", 4), ("organic", "medium", 6), ("recyclable", "medium", 3.5),
                                       ("e_waste", "low", 2.5), ("general", "medium", 5), ("organic", "high", 7),
                                       ("recyclable", "low", 6)]):
        u = by_ward("Katpadi")[k % len(by_ward("Katpadi"))]
        add(u, wt, urg, kg, rnd.uniform(20, 300), *near(rnd, *c1, 0.0022))
    add(next(c for c in citizens if c.name == "Kumaran Boys Hostel"), "organic", "high", 38, 75, *near(rnd, *c1, 0.0015))

    # Community 2 - Gandhi Nagar: residential (includes the demo citizen)
    c2 = (12.9538, 79.1368)
    add(citizens[0], "recyclable", "medium", 5, 25, 12.9541, 79.1372)                           # demo citizen
    for k, (wt, urg, kg) in enumerate([("organic", "medium", 5), ("organic", "low", 4), ("general", "medium", 6),
                                       ("recyclable", "medium", 3), ("organic", "high", 5)]):
        add(by_ward("Gandhi Nagar", False)[k + 1], wt, urg, kg, rnd.uniform(15, 280), *near(rnd, *c2, 0.002))
    add(by_ward("Gandhi Nagar", True)[0], "organic", "medium", 32, 140, *near(rnd, *c2, 0.0015))  # Hotel Annapoorna

    # Community 3 - Sathuvachari: residential + wedding hall (big load)
    c3 = (12.9332, 79.1578)
    for k, (wt, urg, kg) in enumerate([("organic", "medium", 6), ("general", "low", 5), ("recyclable", "medium", 4),
                                       ("organic", "medium", 5), ("general", "medium", 4)]):
        add(by_ward("Sathuvachari", False)[k % 6], wt, urg, kg, rnd.uniform(30, 260), *near(rnd, *c3, 0.002))
    add(next(c for c in citizens if c.name.startswith("Sri Lakshmi Kalyana")), "organic", "high", 95, 50, *near(rnd, *c3, 0.001))

    # Community 4 - Velapadi old-town bazaar: market loads
    c4 = (12.9196, 79.1322)
    add(next(c for c in citizens if c.name == "Palar Fruits Market"), "organic", "high", 140, 90, *near(rnd, *c4, 0.0008))
    add(next(c for c in citizens if c.name == "Sri Murugan Mess"), "organic", "medium", 30, 160, *near(rnd, *c4, 0.0008))
    add(next(c for c in citizens if c.name == "Velapadi Flower Market"), "organic", "medium", 45, 110, *near(rnd, *c4, 0.0008))
    for k, (wt, urg, kg) in enumerate([("recyclable", "medium", 8), ("general", "medium", 6), ("organic", "low", 5)]):
        add(by_ward("Velapadi", False)[k % 6], wt, urg, kg, rnd.uniform(20, 200), *near(rnd, *c4, 0.0015))

    # Isolated & NOT urgent -> the planner holds these back until neighbours appear / deadline nears
    add(by_ward("Bagayam", False)[0], "recyclable", "low", 3, 45, 12.8830, 79.1300)
    add(by_ward("Shenbakkam", False)[0], "general", "low", 4, 70, 12.9390, 79.1735)
    add(by_ward("Kagithapattarai", False)[0], "e_waste", "low", 2, 35, 12.9300, 79.1205)
    add(by_ward("Allapuram", False)[0], "recyclable", "medium", 3.5, 20, 12.8990, 79.1530)

    # Isolated BUT urgent -> dispatched even though alone
    add(next(c for c in citizens if c.name == "Allapuram Auto Works"), "hazardous", "high", 12, 40, 12.9060, 79.1500,
        notes="Used engine oil & paint cans, sealed")
    add(by_ward("Bagayam", False)[1], "organic", "critical", 8, 15, 12.8915, 79.1385, notes="Bin overflowing, street dogs")
    add(by_ward("Shenbakkam", False)[1], "e_waste", "high", 6, 55, 12.9300, 79.1650, notes="Old CRT TV")

    # SLA pressure: already overdue / nearly due
    add(by_ward("Thottapalayam", False)[0], "organic", "medium", 6, 14 * 60, 12.9225, 79.1400)    # 12 h SLA -> 2 h late
    add(by_ward("Saidapet", False)[0], "general", "high", 5, 13 * 60, 12.9120, 79.1270)           # 12 h SLA -> 1 h late
    add(next(c for c in citizens if c.name == "Fort View Hospital Canteen"), "hazardous", "medium", 3, 5 * 60, 12.9238, 79.1382,  # 6 h SLA -> 1 h left
        notes="Expired medicines from clinic")

    # Skipped earlier today (gate locked) - back in the queue; and one cancelled
    add(by_ward("Kagithapattarai", False)[1], "recyclable", "medium", 4, 6 * 60, 12.9282, 79.1262,
        skip_reason="Gate locked / nobody home")
    add(by_ward("Saidapet", False)[1], "organic", "low", 3, 90, status="cancelled")
    scenario[-1].skip_reason = "Cancelled by user"

    for r in scenario:
        if r.status is None:
            r.status = "pending"
        r.priority_score = priority_score(r, now)
    db.add_all(scenario)

    db.commit()
    print("Seeded:", db.query(User).count(), "users |", db.query(Vehicle).count(), "vehicles |",
          db.query(PickupRequest).count(), "requests (", db.query(PickupRequest).filter_by(status="pending").count(),
          "open ) |", db.query(Route).count(), "past routes |", db.query(RecyclableLot).count(), "recyclable lots")
    print("Logins: admin@smartroute.in/admin123 | driver1..5@smartroute.in/driver123 | "
          "citizen@smartroute.in, business@smartroute.in/citizen123 | recycler@smartroute.in/recycler123")
    db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="drop all tables first")
    ap.add_argument("--full", action="store_true", help="also load 30 days of history + 38 scenario requests")
    a = ap.parse_args()
    seed(a.reset, "full" if a.full else "clean")
