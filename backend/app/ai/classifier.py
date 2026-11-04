"""Waste-photo classifier (MobileNetV3 fine-tuned in ml/train_waste_classifier.ipynb, exported to ONNX).

The model predicts a detailed item class (battery, cardboard, biological, ...). Probabilities are
summed per SmartRoute waste type (organic, recyclable, hazardous, e_waste, general).
If the model files or onnxruntime are missing, `status()` says why and everything else keeps working.
"""
import io
import json
import threading
from pathlib import Path

import numpy as np

MODEL_DIR = Path(__file__).resolve().parent / "model"
MODEL_FILE = MODEL_DIR / "waste_classifier.onnx"
META_FILE = MODEL_DIR / "labels.json"
MISMATCH_CONFIDENCE = 0.70  # AI must be at least this sure before flagging a wrong waste type

_lock = threading.Lock()
_session = None
_meta: dict | None = None
_error: str | None = None


def _load() -> bool:
    global _session, _meta, _error
    if _session is not None:
        return True
    with _lock:
        if _session is not None:
            return True
        if not MODEL_FILE.exists() or not META_FILE.exists():
            _error = "Model not installed yet: train it with ml/train_waste_classifier.ipynb and copy it to backend/app/ai/model/"
            return False
        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1  # small server: keep memory/CPU low
            _session = ort.InferenceSession(str(MODEL_FILE), opts, providers=["CPUExecutionProvider"])
            _meta = json.loads(META_FILE.read_text())
            _error = None
            return True
        except Exception as e:  # missing onnxruntime, corrupt file, ...
            _error = f"Could not load model: {e}"
            return False


def status() -> dict:
    ok = _load()
    out = {"available": ok, "reason": None if ok else _error}
    if ok and _meta:
        out.update({k: _meta.get(k) for k in ("architecture", "datasets", "images", "test_accuracy_item",
                                               "test_accuracy_type", "per_type", "confusion_matrix", "trained")})
        out["item_classes"] = _meta["labels"]
        out["confusion_png"] = (MODEL_DIR / "confusion_matrix.png").exists()
    return out


def preprocess(raw: bytes, meta: dict) -> np.ndarray:
    """Same as training: resize shorter side to 256, centre-crop 224, ImageNet normalisation."""
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    size, resize = int(meta.get("size", 224)), int(meta.get("resize", 256))
    w, h = img.size
    s = resize / min(w, h)
    img = img.resize((max(size, round(w * s)), max(size, round(h * s))), Image.BILINEAR)
    w, h = img.size
    left, top = (w - size) // 2, (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(meta["mean"], dtype=np.float32)) / np.array(meta["std"], dtype=np.float32)
    return x.transpose(2, 0, 1)[None].astype(np.float32)


def predict_probs(raw: bytes) -> np.ndarray:
    logits = _session.run(None, {_session.get_inputs()[0].name: preprocess(raw, _meta)})[0][0]
    e = np.exp(logits - logits.max())
    return e / e.sum()


def classify(raw: bytes) -> dict | None:
    """Returns {waste_type, confidence, item, item_confidence, types:{...}} or None if unavailable."""
    if not _load():
        return None
    probs = predict_probs(raw)
    labels, type_of = _meta["labels"], _meta["type_of"]
    by_type: dict[str, float] = {}
    for label, p in zip(labels, probs):
        by_type[type_of[label]] = by_type.get(type_of[label], 0.0) + float(p)
    best_type = max(by_type, key=by_type.get)
    i = int(np.argmax(probs))
    return {
        "waste_type": best_type,
        "confidence": round(by_type[best_type], 3),
        "item": labels[i].replace("ewaste-", "").replace("-", " "),
        "item_confidence": round(float(probs[i]), 3),
        "types": {k: round(v, 3) for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])},
    }
