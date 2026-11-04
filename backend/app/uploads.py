"""Image uploads. Images are stored in the database table `images` and served at /images/{id}."""
import base64
import binascii
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .database import SessionLocal
from .models import StoredImage

ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}
MAX_BYTES = 8 * 1024 * 1024


def _sniff_mime(raw: bytes) -> str:
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(400, "Only JPEG, PNG or WebP images are allowed")


def _store(raw: bytes) -> str:
    if len(raw) > MAX_BYTES:
        raise HTTPException(400, "Image too large (max 8 MB)")
    mime = _sniff_mime(raw)
    # separate short session so the image row is committed independently
    with SessionLocal() as db:
        img = StoredImage(mime=mime, data=raw)
        db.add(img)
        db.commit()
        # the random part makes every URL unique, so phones never show a cached photo from before a data reset
        return f"/images/{img.id}?v={secrets.token_hex(4)}"


def save_base64_image(data: str, prefix: str = "") -> str:
    """Save a base64-encoded image sent as JSON (more reliable from mobile than multipart)."""
    if "," in data[:100]:  # strip "data:image/jpeg;base64," prefix if present
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Invalid image data")
    return _store(raw)


async def save_image(file: UploadFile, prefix: str = "") -> str:
    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    if ext not in ALLOWED:
        raise HTTPException(400, "Only image files are allowed")
    return _store(await file.read())
