"""Demo data for Vellore.  Run:  python -m app.seed --reset

Creates admin, collectors with vehicles, recyclers, households and businesses
spread over Vellore wards, 14 days of history and a fresh batch of pending
requests so every app has something to show immediately.
"""
import argparse
import random
from datetime import timedelta

from .config import DEFAULT_DEPOT, WASTE_TYPES
from .database import Base, SessionLocal, engine
from .models import PickupRequest, RecyclableLot, User, Vehicle, utcnow
from .security import hash_password
from .services import award_credits, create_lot_if_recyclable, priority_score, sla_deadline

# (ward name, lat, lng, spread in degrees)
WARDS = [
    ("Katpadi", 12.9698, 79.1446, 0.008),
    ("Gandhi Nagar", 12.9535, 79.1365, 0.005),
    ("Sathuvachari", 12.9310, 79.1530, 0.007),
    ("Thottapalayam", 12.9230, 79.1390, 0.004),
    ("Saidapet", 12.9125, 79.1265, 0.004),
    ("Velapadi", 12.9185, 79.1315, 0.003),
    ("Kagithapattarai", 12.9285, 79.1260, 0.004),
    ("Allapuram", 12.9050, 79.1470, 0.005),
    ("Bagayam", 12.8890, 79.1350, 0.006),
    ("Shenbakkam", 12.9330, 79.1640, 0.005),
]

FIRST = ["Arun", "Priya", "Karthik", "Divya", "Suresh", "Lakshmi", "Vignesh", "Meena", "Rahul", "Kavya",
         "Sanjay", "Anitha", "Prakash", "Revathi", "Dinesh", "Swathi", "Manoj", "Deepa", "Ganesh", "Nithya"]
LAST = ["Kumar", "Raman", "Subramani", "Iyer", "Natarajan", "Krishnan", "Murugan", "Pillai", "Reddy", "Shankar"]
BUSINESSES = ["Hotel Annapoorna", "Sri Murugan Mess", "Green Leaf Restaurant", "Vellore Fresh Mart",
              "City Bakery", "Arcot Road Textiles", "Fort Hospital Canteen", "Sunrise Electronics",
              "Kumaran Hostel", "Palar Fruits Market"]

# relative frequency of each waste type for households vs businesses
HOUSE_MIX = {"organic": 45, "recyclable": 25, "general": 20, "e_waste": 6, "hazardous": 4}
BIZ_MIX = {"organic": 50, "recyclable": 25, "general": 15, "e_waste": 6, "hazardous": 4}
URG_MIX = {"low": 30, "medium": 45, "high": 20, "critical": 5}


def pick(mix: dict[str, int]) -> str:
    return random.choices(list(mix), weights=list(mix.values()))[0]


def jitter(lat, lng, spread):
    return round(lat + random.uniform(-spread, spread), 6), round(lng + random.uniform(-spread, spread), 6)


def make_request(user: User, created, status="pending") -> PickupRequest:
    business = user.account_type == "business"
    wt = pick(BIZ_MIX if business else HOUSE_MIX)
    urg = pick(URG_MIX)
    base = {"organic": 6, "recyclable": 4, "general": 5, "e_waste": 3, "hazardous": 1.5}[wt]
    est = round(base * random.uniform(0.5, 1.8) * (4 if business else 1), 1)
    r = PickupRequest(
        user=user, waste_type=wt, urgency=urg, est_kg=est, lat=user.lat, lng=user.lng,
        address=user.address, status=status, created_at=created, sla_deadline=sla_deadline(wt, urg, created),
    )
    r.priority_score = priority_score(r)
    return r


def seed(reset: bool):
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    random.seed(42)
    db = SessionLocal()
    if db.query(User).count():
        print("Database already has data. Use --reset to wipe and re-seed.")
        return

    pw = {r: hash_password(f"{r}123") for r in ("admin", "driver", "citizen", "recycler")}

    db.add(User(name="Municipal Admin", email="admin@smartroute.in", role="admin", password_hash=pw["admin"],
                phone="9000000001"))

    drivers = []
    for i, nm in enumerate(["Ravi Shankar", "Muthu Kumar", "Senthil Nathan", "Babu Raj"], start=1):
        d = User(name=nm, email=f"driver{i}@smartroute.in", role="collector", password_hash=pw["driver"],
                 phone=f"90000001{i:02d}")
        drivers.append(d)
        db.add(d)

    dlat, dlng = DEFAULT_DEPOT
    fleet = [
        ("TN23 AB 1101", "Compactor 1", 2000, ["organic", "general"]),
        ("TN23 AB 1102", "Compactor 2", 2000, ["organic", "general", "recyclable"]),
        ("TN23 AB 2201", "Recycling Truck", 1500, ["recyclable", "e_waste", "general"]),
        ("TN23 AB 3301", "Hazmat Van", 500, ["hazardous", "e_waste"]),
    ]
    for (reg, name, cap, types), d in zip(fleet, drivers):
        db.add(Vehicle(reg_no=reg, name=name, capacity_kg=cap, allowed_types=",".join(types),
                       depot_lat=dlat, depot_lng=dlng, driver=d, cur_lat=dlat, cur_lng=dlng))

    recyclers = []
    for i, (nm, org, ward) in enumerate([("Selvam", "Vellore Scrap Traders", WARDS[3]),
                                         ("Fathima", "GreenCycle Recyclers", WARDS[0])], start=1):
        lat, lng = jitter(ward[1], ward[2], ward[3])
        email = "recycler@smartroute.in" if i == 1 else f"recycler{i}@smartroute.in"
        r = User(name=nm, email=email, role="recycler", organization=org, password_hash=pw["recycler"],
                 phone=f"90000002{i:02d}", ward=ward[0], lat=lat, lng=lng, address=f"{ward[0]}, Vellore")
        recyclers.append(r)
        db.add(r)

    citizens = []
    for i in range(40):
        ward = WARDS[i % len(WARDS)]
        lat, lng = jitter(ward[1], ward[2], ward[3])
        business = i % 4 == 3
        name = BUSINESSES[(i // 4) % len(BUSINESSES)] if business else f"{random.choice(FIRST)} {random.choice(LAST)}"
        email = "citizen@smartroute.in" if i == 0 else f"user{i}@smartroute.in"
        c = User(name=name, email=email, role="citizen", account_type="business" if business else "household",
                 organization=name if business else None, password_hash=pw["citizen"], phone=f"98{i:08d}",
                 ward=ward[0], lat=lat, lng=lng, address=f"{random.randint(1, 120)}, {ward[0]}, Vellore")
        citizens.append(c)
        db.add(c)
    db.flush()

    # ---- 14 days of collected history (feeds analytics + forecasting later)
    now = utcnow()
    for day in range(14, 0, -1):
        day_start = (now - timedelta(days=day)).replace(hour=6, minute=0, second=0, microsecond=0)
        weekend = day_start.weekday() >= 5
        for c in random.sample(citizens, k=random.randint(14, 20) + (6 if weekend else 0)):
            created = day_start + timedelta(minutes=random.randint(0, 600))
            r = make_request(c, created, status="collected")
            db.add(r)
            r.actual_kg = round(max(0.5, r.est_kg * random.uniform(0.7, 1.3)), 1)
            r.collected_at = created + timedelta(hours=random.uniform(1, WASTE_TYPES[r.waste_type]["base_sla_hours"]))
            db.flush()
            award_credits(db, r)
            lot = create_lot_if_recyclable(db, r)
            if lot:
                lot.created_at = r.collected_at
                if day > 3:
                    lot.status, lot.recycler = "picked", random.choice(recyclers)
                    lot.claimed_at = r.collected_at + timedelta(hours=5)
                    lot.picked_at = r.collected_at + timedelta(hours=20)

    # ---- today's open requests (what the planner will route)
    for c in random.sample(citizens, k=30):
        created = now - timedelta(minutes=random.randint(5, 240))
        db.add(make_request(c, created))

    db.commit()
    print("Seeded:", db.query(User).count(), "users,", db.query(Vehicle).count(), "vehicles,",
          db.query(PickupRequest).count(), "requests,", db.query(RecyclableLot).count(), "recyclable lots")
    print("Logins ->  admin@smartroute.in / admin123 | driver1@smartroute.in / driver123 |"
          " citizen@smartroute.in / citizen123 | recycler@smartroute.in / recycler123")
    db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="drop all tables first")
    seed(ap.parse_args().reset)
