"""AI endpoints: photo -> suggested waste type."""
import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..ai import classifier
from ..models import User
from ..schemas import PhotoIn
from ..security import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
def ai_status():
    """Is the waste-photo model installed, and how accurate is it (from its test set)?"""
    return classifier.status()


@router.get("/confusion.png")
def confusion_png():
    f = classifier.MODEL_DIR / "confusion_matrix.png"
    if not f.exists():
        raise HTTPException(404, "No confusion matrix")
    return FileResponse(f, media_type="image/png")


@router.post("/classify")
def classify_photo(body: PhotoIn, _: User = Depends(get_current_user)):
    data = body.data.split(",", 1)[1] if "," in body.data[:100] else body.data
    try:
        raw = base64.b64decode(data)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Invalid image data")
    try:
        res = classifier.classify(raw)
    except Exception:
        raise HTTPException(400, "Could not read this image")
    if res is None:
        raise HTTPException(503, classifier.status()["reason"])
    return res
