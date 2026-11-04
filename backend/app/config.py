"""Central configuration. Every value can be overridden with an environment variable."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'smartroute.db'}")
# Hosted Postgres providers (Neon, Render, Supabase) give "postgres://" or "postgresql://" URLs;
# SQLAlchemy needs the driver name for psycopg 3.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

# When true, an empty database is filled with the Vellore demo data at startup (used on the cloud host)
SEED_ON_START = os.getenv("SEED_ON_START", "false").lower() in ("1", "true", "yes")
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-smartroute-waste")
TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "168"))  # 7 days
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Default city: Vellore, Tamil Nadu (VIT Vellore campus as reference)
CITY_NAME = "Vellore"
CITY_CENTER = (12.9165, 79.1325)
DEFAULT_DEPOT = (12.9249, 79.1353)  # municipal depot (demo location)

# ---------------------------------------------------------------------------
# Waste catalogue and Service-Level-Agreement (SLA) tiers
# base_sla_hours: how long a request of this type may wait before it is late
# priority: higher = must be served earlier (used by the routing engine)
# ---------------------------------------------------------------------------
WASTE_TYPES = {
    "organic":    {"label": "Organic / Wet",      "base_sla_hours": 12, "priority": 3, "color": "#2e7d32", "recyclable": False},
    "recyclable": {"label": "Dry Recyclable",     "base_sla_hours": 48, "priority": 1, "color": "#1565c0", "recyclable": True},
    "hazardous":  {"label": "Hazardous",          "base_sla_hours": 6,  "priority": 5, "color": "#c62828", "recyclable": False},
    "e_waste":    {"label": "E-Waste",            "base_sla_hours": 48, "priority": 2, "color": "#6a1b9a", "recyclable": True},
    "general":    {"label": "Mixed / General",    "base_sla_hours": 24, "priority": 2, "color": "#616161", "recyclable": False},
}

# Urgency chosen by the user scales the SLA window
URGENCY_LEVELS = {
    "low":      {"label": "Low (flexible)", "sla_factor": 2.0,  "bonus": 1},
    "medium":   {"label": "Medium",         "sla_factor": 1.0,  "bonus": 2},
    "high":     {"label": "High",           "sla_factor": 0.5,  "bonus": 3},
    "critical": {"label": "Critical",       "sla_factor": 0.25, "bonus": 4},
}

# Price paid by recyclers (INR / kg) for collected recyclable lots (demo values)
RECYCLE_PRICES = {"recyclable": 12.0, "e_waste": 35.0}

# Green-credit rules
CREDITS_BASE = 10
CREDITS_SEGREGATED = 5      # any type other than "general"
CREDITS_FLEXIBLE = 5        # chose "low" urgency -> helps the optimizer
CREDITS_ACCURATE = 5        # estimate within 25% of actual weight
