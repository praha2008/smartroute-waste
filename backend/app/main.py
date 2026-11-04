"""SmartRoute Waste API - run with:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"""
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import config
from .database import Base, engine, get_db
from .models import StoredImage
from .routers import admin, auth, collector, recycler, requests

Base.metadata.create_all(bind=engine)

if config.SEED_ON_START:
    from .seed import seed

    seed(reset=False)  # only fills an empty database

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

for r in (auth.router, requests.router, collector.router, recycler.router, admin.router):
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
    }
