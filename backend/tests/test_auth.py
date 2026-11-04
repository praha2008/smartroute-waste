"""Release-grade accounts: phone OTP sign-up, phone/email login, email reset, approvals, admin tools."""
from fastapi.testclient import TestClient

from app.main import app
from app.seed import seed

c = TestClient(app)


def tok(email_or_phone, pw):
    r = c.post("/auth/login", json={"email": email_or_phone, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_signup_with_phone_otp_and_login_by_phone():
    seed(reset=True)
    body = {"name": "Kavya R", "email": "kavya@example.com", "password": "pass123", "phone": "+91 99887 76655",
            "account_type": "household", "lat": 12.95, "lng": 79.13, "language": "ta"}
    r = c.post("/auth/register", json=body).json()
    assert r["demo"] is True and len(r["dev_code"]) == 6 and r["target"].endswith("6655")
    # cannot log in before verifying -> 409 with a fresh code
    r2 = c.post("/auth/login", json={"email": "kavya@example.com", "password": "pass123"})
    assert r2.status_code == 409 and r2.json()["detail"]["code"] == "PHONE_NOT_VERIFIED"
    code = r2.json()["detail"]["dev_code"]
    assert c.post("/auth/verify-phone", json={"phone": "9988776655", "code": "000000"}).status_code == 400
    r3 = c.post("/auth/verify-phone", json={"phone": "9988776655", "code": code})
    assert r3.status_code == 200 and r3.json()["user"]["phone_verified"] is True
    assert r3.json()["user"]["language"] == "ta"
    h = tok("99887 76655", "pass123")  # login with the phone number
    assert c.get("/auth/me", headers=h).json()["email"] == "kavya@example.com"
    # duplicate phone is refused once verified
    dup = c.post("/auth/register", json={**body, "email": "other@example.com"})
    assert dup.status_code == 400 and "mobile number" in dup.json()["detail"]


def test_forgot_password_by_email_code_and_change_password():
    r = c.post("/auth/forgot-password", json={"email": "citizen@smartroute.in"}).json()
    assert r["channel"] == "email" and r["dev_code"]
    assert c.post("/auth/reset-password", json={"email": "citizen@smartroute.in", "code": "111111",
                                                "new_password": "newpass1"}).status_code == 400
    ok = c.post("/auth/reset-password", json={"email": "citizen@smartroute.in", "code": r["dev_code"],
                                              "new_password": "newpass1"})
    assert ok.status_code == 200
    h = tok("citizen@smartroute.in", "newpass1")
    assert c.post("/auth/change-password", headers=h, json={"old_password": "wrong", "new_password": "x12345"}).status_code == 400
    assert c.post("/auth/change-password", headers=h, json={"old_password": "newpass1", "new_password": "citizen123"}).status_code == 200
    # unknown email: same answer, no code leaked
    r = c.post("/auth/forgot-password", json={"email": "nobody@nowhere.in"}).json()
    assert r["dev_code"] is None


def test_recycler_needs_approval_and_staff_must_change_password():
    adm = tok("admin@smartroute.in", "admin123")
    r = c.post("/auth/register", json={"name": "Scrap Co", "email": "scrap@example.com", "password": "pass123",
                                        "phone": "9000011111", "role": "recycler", "organization": "Scrap Co"}).json()
    rec = c.post("/auth/verify-phone", json={"phone": "9000011111", "code": r["dev_code"]}).json()
    h = {"Authorization": f"Bearer {rec['token']}"}
    assert rec["user"]["approved"] is False
    assert c.get("/recycler/lots", headers=h).status_code == 403
    assert c.post(f"/admin/users/{rec['user']['id']}/set/approve", headers=adm).json()["approved"] is True
    assert c.get("/recycler/lots", headers=h).status_code == 200
    # admin creates a recycler partner -> temporary password must be changed
    u = c.post("/admin/users", headers=adm, json={"name": "Partner", "email": "nd@x.in", "password": "temp123",
                                                   "phone": "9000022222", "role": "recycler"}).json()
    assert u["must_change_password"] is True and u["phone"] == "+919000022222"
    t = c.post(f"/admin/users/{u['id']}/reset-password", headers=adm).json()["temporary_password"]
    hd = tok("9000022222", t)
    assert c.get("/auth/me", headers=hd).json()["must_change_password"] is True
    # disable / enable
    c.post(f"/admin/users/{u['id']}/set/disable", headers=adm)
    assert c.post("/auth/login", json={"email": "nd@x.in", "password": t}).status_code == 403


def test_driver_logs_in_with_employee_id_and_pin():
    adm = tok("admin@smartroute.in", "admin123")
    # seeded demo drivers: DRV001-DRV005 / 1234
    assert c.post("/auth/driver-login", json={"employee_id": "drv001", "pin": "1234"}).json()["user"]["name"] == "Ravi Shankar"
    d = c.post("/admin/users", headers=adm, json={"name": "Kumar", "role": "collector", "employee_id": "vmc 1042", "pin": "4321"}).json()
    assert d["employee_id"] == "VMC1042" and d["pin"] == "4321" and d["must_change_password"] is False
    auto = c.post("/admin/users", headers=adm, json={"name": "Auto ID", "role": "collector"}).json()
    assert auto["employee_id"].startswith("DRV") and len(auto["pin"]) == 4
    assert c.post("/admin/users", headers=adm, json={"name": "Dup", "role": "collector", "employee_id": "VMC1042"}).status_code == 400
    r = c.post("/auth/driver-login", json={"employee_id": " vmc1042 ", "pin": "4321"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "collector"
    assert c.post("/auth/driver-login", json={"employee_id": "VMC1042", "pin": "0000"}).status_code == 401
    assert c.post("/auth/driver-login", json={"employee_id": "NOPE99", "pin": "1234"}).status_code == 401
    # admin resets the PIN
    new = c.post(f"/admin/users/{d['id']}/reset-pin", headers=adm).json()["pin"]
    assert c.post("/auth/driver-login", json={"employee_id": "VMC1042", "pin": "4321"}).status_code in (401, 200) and new
    assert c.post("/auth/driver-login", json={"employee_id": "VMC1042", "pin": new}).status_code == 200
    # lock after 5 wrong PINs
    for _ in range(5):
        c.post("/auth/driver-login", json={"employee_id": "DRV002", "pin": "9999"})
    assert c.post("/auth/driver-login", json={"employee_id": "DRV002", "pin": "1234"}).status_code == 429
    c.post(f"/admin/users/{d['id']}/set/disable", headers=adm)
    assert c.post("/auth/driver-login", json={"employee_id": "VMC1042", "pin": new}).status_code == 403


def test_old_drivers_get_employee_ids_on_startup():
    from app.database import SessionLocal
    from app.models import User
    from app.security import hash_password
    from app.seed import ensure_employee_ids

    with SessionLocal() as db:
        u = User(name="Old Driver", email="old@x.in", role="collector", password_hash=hash_password("x12345"), must_change_password=True)
        db.add(u)
        db.commit()
        ensure_employee_ids(db)
        db.refresh(u)
        assert u.employee_id.startswith("DRV") and u.must_change_password is False and u.pin_hash is None


def test_clear_operations_and_release_reset(monkeypatch):
    adm = tok("admin@smartroute.in", "admin123")
    cit = tok("citizen@smartroute.in", "citizen123")
    c.post("/requests", headers=cit, json={"waste_type": "organic", "est_kg": 2, "lat": 12.95, "lng": 79.13})
    assert c.post("/admin/clear-operations?confirm=CLEAR", headers=adm).json()["ok"]
    assert c.get("/admin/overview", headers=adm).json()["requests_total"] == 0
    assert c.get("/auth/me", headers=cit).status_code == 200  # accounts kept
    # release reset: only admin + fleet remain
    from app import config
    monkeypatch.setattr(config, "ADMIN_EMAIL", "boss@vellore.gov.in")
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "Strong#123")
    assert c.post("/admin/reset-demo?confirm=RESET&mode=release", headers=adm).status_code == 200
    boss = tok("boss@vellore.gov.in", "Strong#123")
    users = c.get("/admin/users", headers=boss).json()
    assert [u["email"] for u in users] == ["boss@vellore.gov.in"]
    assert len(c.get("/admin/vehicles", headers=boss).json()) == 4
    assert c.post("/auth/login", json={"email": "admin@smartroute.in", "password": "admin123"}).status_code == 401
    seed(reset=True)  # leave a demo database for the other tests


def test_geo_search_and_reverse(monkeypatch):
    from app.routers import geo

    fake = {"features": [{"geometry": {"coordinates": [79.1559, 12.9692]},
                          "properties": {"name": "VIT Vellore", "district": "Katpadi", "city": "Vellore", "state": "Tamil Nadu"}}]}
    monkeypatch.setattr(geo, "_get", lambda url: fake)
    r = c.get("/geo/search?q=vit").json()["results"][0]
    assert r == {"title": "VIT Vellore", "subtitle": "Katpadi, Vellore, Tamil Nadu", "lat": 12.9692, "lng": 79.1559}
    assert c.get("/geo/reverse?lat=12.9692&lng=79.1559").json()["title"] == "VIT Vellore"

    def boom(url):
        raise OSError("offline")
    monkeypatch.setattr(geo, "_get", boom)
    assert c.get("/geo/search?q=vit").json()["results"] == []
    assert c.get("/geo/reverse?lat=12.9&lng=79.1").json()["title"] == "Selected location"


def test_real_providers_are_called_correctly(monkeypatch):
    """Twilio Verify + Brevo paths with the network faked."""
    import io
    import json

    from app import config, notify

    calls = []

    class Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=0):
        calls.append((req.full_url, req.data, dict(req.header_items())))
        if "VerificationCheck" in req.full_url:
            return Resp(json.dumps({"status": "approved"}).encode())
        return Resp(b"{}")

    monkeypatch.setattr(notify.urllib.request, "urlopen", fake_urlopen)
    for k, v in {"SMS_CONFIGURED": True, "TWILIO_ACCOUNT_SID": "AC1", "TWILIO_AUTH_TOKEN": "tok", "TWILIO_VERIFY_SID": "VA1",
                 "EMAIL_CONFIGURED": True, "BREVO_API_KEY": "key", "EMAIL_FROM": "noreply@smartroute.in"}.items():
        monkeypatch.setattr(config, k, v)
    r = c.post("/auth/register", json={"name": "Real SMS", "email": "real@example.com", "password": "pass123",
                                        "phone": "9123456780"}).json()
    assert r["demo"] is False and r["dev_code"] is None
    assert calls[-1][0] == "https://verify.twilio.com/v2/Services/VA1/Verifications"
    assert b"To=%2B919123456780" in calls[-1][1] and b"Channel=sms" in calls[-1][1]
    assert calls[-1][2]["Authorization"].startswith("Basic ")
    assert c.post("/auth/verify-phone", json={"phone": "9123456780", "code": "123456"}).status_code == 200
    r = c.post("/auth/forgot-password", json={"email": "real@example.com"}).json()
    assert r["demo"] is False and r["dev_code"] is None
    url, data, headers = calls[-1]
    body = json.loads(data)
    assert url == "https://api.brevo.com/v3/smtp/email" and headers["Api-key"] == "key"
    assert body["to"][0]["email"] == "real@example.com" and "reset code" in body["subject"]


def test_ward_is_filled_from_the_map_location():
    r = c.post("/auth/register", json={"name": "Ward Test", "email": "ward@example.com", "password": "pass123",
                                       "phone": "9811122233", "lat": 12.9716, "lng": 79.1590})
    code = r.json()["dev_code"]
    user = c.post("/auth/verify-phone", json={"phone": "9811122233", "code": code}).json()["user"]
    assert user["ward"] == "Katpadi"


def test_google_places_search_details_and_reverse(monkeypatch):
    from app import config
    from app.routers import geo

    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "test-key")
    calls = []

    def fake(method, url, body=None, field_mask=None):
        calls.append((method, url, body, field_mask))
        if "autocomplete" in url:
            return {"suggestions": [{"placePrediction": {"placeId": "ChIJabc", "text": {"text": "VIT, Katpadi"},
                    "structuredFormat": {"mainText": {"text": "VIT Vellore"}, "secondaryText": {"text": "Katpadi, Vellore, Tamil Nadu, India"}}}}]}
        if "places/ChIJabc" in url:
            return {"location": {"latitude": 12.9692, "longitude": 79.1559}, "displayName": {"text": "VIT Vellore"},
                    "formattedAddress": "Katpadi, Vellore, Tamil Nadu 632014, India"}
        return {"results": [{"types": ["plus_code"], "formatted_address": "X"},
                            {"types": ["street_address"], "formatted_address": "12, Gandhi Rd, Katpadi, Vellore, Tamil Nadu 632007, India"}]}
    monkeypatch.setattr(geo, "_google", fake)
    r = c.get("/geo/search?q=vit&session=s1").json()
    assert r["provider"] == "google" and r["results"][0] == {"title": "VIT Vellore", "subtitle": "Katpadi, Vellore, Tamil Nadu", "place_id": "ChIJabc"}
    assert calls[0][2]["sessionToken"] == "s1" and calls[0][2]["includedRegionCodes"] == ["in"]
    p = c.get("/geo/place?id=ChIJabc&session=s1").json()
    assert p["lat"] == 12.9692 and p["title"] == "VIT Vellore" and "sessionToken=s1" in calls[1][1]
    rev = c.get("/geo/reverse?lat=12.97&lng=79.15").json()
    assert rev["title"] == "12, Gandhi Rd" and rev["subtitle"].startswith("Katpadi, Vellore")
    assert c.get("/geo/provider").json()["provider"] == "google"


def test_sms_falls_back_to_screen_code_when_twilio_refuses(monkeypatch):
    from fastapi import HTTPException
    from app import config, notify

    monkeypatch.setattr(config, "SMS_CONFIGURED", True)
    def refuse(path, data):
        if path == "Verifications":
            raise HTTPException(502, "Could not send SMS: The phone number is unverified. Trial accounts cannot send messages to unverified numbers")
        raise AssertionError("VerificationCheck must not be called for a fallback code")
    monkeypatch.setattr(notify, "_twilio", refuse)
    r = c.post("/auth/register", json={"name": "Trial User", "email": "trial@example.com", "password": "pass123",
                                       "phone": "9822233344", "lat": 12.92, "lng": 79.13}).json()
    assert r["demo"] is True and r["fallback"] is True and len(r["dev_code"]) == 6
    ok = c.post("/auth/verify-phone", json={"phone": "9822233344", "code": r["dev_code"]})
    assert ok.status_code == 200, ok.text


def test_search_falls_back_to_nominatim_when_photon_fails(monkeypatch):
    from app import config
    from app.routers import geo

    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "")
    def fake(url):
        if "photon" in url:
            raise OSError("403 Forbidden")
        return [{"lat": "12.9692", "lon": "79.1559", "name": "VIT Vellore", "display_name": "VIT Vellore, Katpadi",
                 "address": {"road": "Katpadi Road", "suburb": "Katpadi", "city": "Vellore", "state": "Tamil Nadu"}}]
    monkeypatch.setattr(geo, "_get", fake)
    r = c.get("/geo/search?q=vit").json()
    assert r["results"][0]["title"] == "VIT Vellore" and r["results"][0]["lat"] == 12.9692
    assert r["results"][0]["subtitle"] == "Katpadi Road, Katpadi, Vellore"
