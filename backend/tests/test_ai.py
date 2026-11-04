"""AI photo classifier: tested with a stand-in model (the real ONNX file is trained in Colab)."""
import base64
import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.ai import classifier
from app.main import app
from app.seed import seed

META = {"labels": ["battery", "biological", "cardboard", "plastic", "trash"],
        "type_of": {"battery": "hazardous", "biological": "organic", "cardboard": "recyclable",
                    "plastic": "recyclable", "trash": "general"},
        "size": 224, "resize": 256, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}


def jpeg(w=640, h=480) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 160, 90)).save(buf, "JPEG")
    return buf.getvalue()


def test_preprocess_shape_and_normalisation():
    x = classifier.preprocess(jpeg(800, 300), META)
    assert x.shape == (1, 3, 224, 224) and x.dtype == np.float32
    assert abs(float(x[0, 1].mean()) - (160 / 255 - 0.456) / 0.224) < 0.05


def test_status_without_model_is_graceful():
    st = classifier.status()
    if not classifier.MODEL_FILE.exists():
        assert st["available"] is False and "Model not installed" in st["reason"]


def test_classify_and_mismatch_flag(monkeypatch):
    # stand-in model: 60% cardboard + 20% plastic -> recyclable 0.8
    monkeypatch.setattr(classifier, "_load", lambda: True)
    monkeypatch.setattr(classifier, "_meta", META)
    monkeypatch.setattr(classifier, "predict_probs", lambda raw: np.array([0.05, 0.1, 0.6, 0.2, 0.05]))
    res = classifier.classify(jpeg())
    assert res["waste_type"] == "recyclable" and res["confidence"] == 0.8 and res["item"] == "cardboard"

    seed(reset=True)
    c = TestClient(app)
    tok = c.post("/auth/login", json={"email": "citizen@smartroute.in", "password": "citizen123"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    data = base64.b64encode(jpeg()).decode()
    assert c.post("/ai/classify", headers=h, json={"data": data}).json()["waste_type"] == "recyclable"
    # citizen says "organic" but the photo is cardboard -> flagged
    r = c.post("/requests", headers=h, json={"waste_type": "organic", "urgency": "low", "est_kg": 3,
                                              "lat": 12.95, "lng": 79.137}).json()
    r = c.post(f"/requests/{r['id']}/photo64", headers=h, json={"data": data}).json()
    assert r["ai_type"] == "recyclable" and r["ai_mismatch"] is True
    # matching type -> not flagged
    r2 = c.post("/requests", headers=h, json={"waste_type": "recyclable", "urgency": "low", "est_kg": 3,
                                               "lat": 12.95, "lng": 79.137}).json()
    r2 = c.post(f"/requests/{r2['id']}/photo64", headers=h, json={"data": data}).json()
    assert r2["ai_mismatch"] is False


def test_add_missing_columns_upgrades_old_table(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, inspect, text

    import app.database as database

    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as conn:  # an "old" table without the AI columns
        conn.execute(text("CREATE TABLE pickup_requests (id INTEGER PRIMARY KEY, waste_type VARCHAR(20))"))
    monkeypatch.setattr(database, "engine", eng)
    added = database.add_missing_columns()
    cols = {c["name"] for c in inspect(eng).get_columns("pickup_requests")}
    assert {"ai_type", "ai_confidence", "ai_item"} <= cols and "pickup_requests.ai_type" in added
