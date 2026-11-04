"""SmartRoute Waste API - run with:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"""
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import config
from .database import Base, add_missing_columns, engine, get_db
from .models import StoredImage
from .routers import admin, ai, auth, collector, geo, recycler, requests

Base.metadata.create_all(bind=engine)
add_missing_columns()

if config.SEED_ON_START:
    from .seed import seed

    seed(reset=False, mode="release" if config.APP_MODE == "release" else "clean")  # only fills an empty database

from .database import SessionLocal  # noqa: E402
from .seed import ensure_admin, ensure_employee_ids  # noqa: E402

with SessionLocal() as _db:
    ensure_admin(_db)  # real admin from ADMIN_EMAIL / ADMIN_PASSWORD
    ensure_employee_ids(_db)  # drivers log in with an employee ID

geo.ensure_index()  # download the city's named places in the background (for place search)

app = FastAPI(
    title="SmartRoute Waste API",
    version="1.0.0",
    description="Dynamic, demand-driven waste collection: citizen requests -> clustering -> capacity-aware routing.",
)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"]
)
# legacy on-disk uploads (photos are now stored in the database, see /images)
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")

for r in (auth.router, requests.router, collector.router, recycler.router, admin.router, ai.router, geo.router):
    app.include_router(r)


@app.get("/", tags=["meta"])
def root():
    return {"service": "SmartRoute Waste API", "status": "ok", "docs": "/docs"}


@app.get("/images/{image_id}", tags=["meta"])
def get_image(image_id: int, db: Session = Depends(get_db)):
    img = db.get(StoredImage, image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    return Response(content=img.data, media_type=img.mime, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/meta", tags=["meta"])
def meta():
    """Catalogue used by all apps so labels/colours/SLA rules live in one place."""
    return {
        "city": config.CITY_NAME,
        "city_center": config.CITY_CENTER,
        "waste_types": config.WASTE_TYPES,
        "urgency_levels": config.URGENCY_LEVELS,
        "recycle_prices": config.RECYCLE_PRICES,
        "app_mode": config.APP_MODE,
        "sms_live": config.SMS_CONFIGURED,
        "email_live": config.EMAIL_CONFIGURED,
    }
