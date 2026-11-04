"""End-to-end flow: citizen request -> admin plans -> collector collects -> recycler claims."""
import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_db.name}"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp()

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

seed(reset=True)
client = TestClient(app)


def login(email, pw):
    r = client.post("/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_full_flow():
    assert client.get("/meta").json()["city"] == "Vellore"

    # citizen registers and requests a recyclable pickup
    r = client.post("/auth/register", json={"name": "Test User", "email": "t@x.com", "password": "secret1",
                                             "lat": 12.9200, "lng": 79.1350, "ward": "Velapadi"})
    assert r.status_code == 200, r.text
    cit = {"Authorization": f"Bearer {r.json()['token']}"}
    r = client.post("/requests", headers=cit, json={"waste_type": "recyclable", "urgency": "critical",
                                                     "est_kg": 8, "lat": 12.9200, "lng": 79.1350})
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    r = client.post(f"/requests/{req_id}/photo", headers=cit, files={"file": ("a.jpg", b"\xff\xd8\xff\xe0fake", "image/jpeg")})
    assert r.status_code == 200 and r.json()["photo_url"].startswith("/images/"), r.text
    img = client.get(r.json()["photo_url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    import base64
    jpeg = base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 100).decode()
    r = client.post(f"/requests/{req_id}/photo64", headers=cit, json={"data": jpeg})
    assert r.status_code == 200 and r.json()["photo_url"].startswith("/images/"), r.text
    r = client.post(f"/requests/{req_id}/photo64", headers=cit, json={"data": base64.b64encode(b"not an image at all!!").decode()})
    assert r.status_code == 400

    # role guard
    assert client.get("/admin/overview", headers=cit).status_code == 403

    # admin plans routes
    adm = login("admin@smartroute.in", "admin123")
    plan = client.post("/admin/plan", headers=adm).json()
    assert plan["routes_created"] >= 1 and plan["requests_scheduled"] > 0
    assert client.get(f"/requests/{req_id}", headers=cit).json()["status"] == "scheduled"
    live = client.get("/admin/live", headers=adm).json()
    assert live["routes"] and live["vehicles"]

    # find which driver got our request
    routes = client.get("/admin/routes", headers=adm).json()
    route = next(rt for rt in routes if any(s["request"]["id"] == req_id for s in rt["stops"]))
    driver_email = next(u["email"] for u in client.get("/admin/users?role=collector", headers=adm).json()
                        if u["id"] == route["vehicle"]["driver_id"])
    drv = login(driver_email, "driver123")

    me = client.get("/collector/me", headers=drv).json()
    assert me["route"]["id"] == route["id"]
    assert client.post(f"/collector/route/{route['id']}/start", headers=drv).status_code == 200
    assert client.get(f"/requests/{req_id}", headers=cit).json()["status"] == "in_progress"
    assert client.post("/collector/location", headers=drv, json={"lat": 12.921, "lng": 79.134}).status_code == 200

    # dynamic insertion: a new hazardous request goes straight into an already-planned truck
    r = client.post("/requests", headers=cit, json={"waste_type": "hazardous", "urgency": "high",
                                                     "est_kg": 2, "lat": 12.921, "lng": 79.136})
    assert r.status_code == 201 and r.json()["route_id"] is not None, r.text
    assert r.json()["status"] in ("scheduled", "in_progress")

    detail = client.get(f"/requests/{req_id}", headers=cit).json()
    assert detail["vehicle"]["cur_lat"] == 12.921 and detail["eta"]

    stop = next(s for s in route["stops"] if s["request"]["id"] == req_id)
    r = client.post(f"/collector/stops/{stop['id']}/collect", headers=drv, json={"actual_kg": 7.5})
    assert r.status_code == 200, r.text
    assert r.json()["request"]["credits_awarded"] == 20  # base + segregated + accurate
    assert client.get("/auth/me", headers=cit).json()["green_credits"] == 20

    # skip one other stop -> goes back to pending pool
    other = next((s for s in route["stops"] if s["request"]["id"] != req_id), None)
    if other:
        r = client.post(f"/collector/stops/{other['id']}/skip", headers=drv, json={"reason": "Gate locked"})
        assert r.json()["request"]["status"] == "pending"

    # recycler sees and claims the new lot
    rec = login("recycler@smartroute.in", "recycler123")
    lots = client.get("/recycler/lots", headers=rec).json()
    lot = next(lot for lot in lots if lot["request_id"] == req_id)
    assert lot["kg"] == 7.5 and lot["total_value"] == 90.0
    assert client.post(f"/recycler/lots/{lot['id']}/claim", headers=rec).status_code == 200
    assert client.post(f"/recycler/lots/{lot['id']}/claim", headers=rec).status_code == 409
    assert client.post(f"/recycler/lots/{lot['id']}/picked", headers=rec).json()["status"] == "picked"
    assert client.get("/recycler/stats", headers=rec).json()["picked"] >= 1

    # finish route, check dashboards
    client.post(f"/collector/route/{route['id']}/complete", headers=drv)
    assert client.get("/collector/me", headers=drv).json()["today"]["stops_done"] >= 1
    ov = client.get("/admin/overview", headers=adm).json()
    assert ov["kg_collected_total"] > 0
    an = client.get("/admin/analytics", headers=adm).json()
    assert len(an["daily_requests"]) == 14
    st = client.get("/requests/stats", headers=cit).json()
    assert st["collected"] == 1 and st["co2_saved_kg"] > 0


def test_capacity_and_compatibility():
    adm = login("admin@smartroute.in", "admin123")
    for rt in client.get("/admin/routes", headers=adm).json():
        allowed = rt["vehicle"]["allowed_types"].split(",")
        assert sum(s["request"]["est_kg"] for s in rt["stops"]) <= rt["vehicle"]["capacity_kg"]
        assert all(s["request"]["waste_type"] in allowed for s in rt["stops"])
