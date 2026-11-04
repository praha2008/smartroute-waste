"""Distance / travel-time matrices for the routing engine.

Default: Haversine great-circle distance x urban road factor (works offline, instant).
Optional: real road distances from an OSRM server, enabled by setting the env var
OSRM_URL (e.g. http://localhost:5000 or https://router.project-osrm.org). If OSRM fails
for any reason we silently fall back to Haversine so planning never breaks.
"""
import json
import os
import urllib.request

import numpy as np

from ..geo import AVG_SPEED_KMPH, EARTH_RADIUS_KM, ROAD_FACTOR

OSRM_URL = os.getenv("OSRM_URL", "").rstrip("/")


def haversine_matrix_km(points: list[tuple[float, float]]) -> np.ndarray:
    """Vectorised pairwise great-circle distances (km)."""
    p = np.radians(np.asarray(points, dtype=float))
    lat, lng = p[:, 0][:, None], p[:, 1][:, None]
    dlat = lat - lat.T
    dlng = lng - lng.T
    a = np.sin(dlat / 2) ** 2 + np.cos(lat) * np.cos(lat.T) * np.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _osrm_matrix(points: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray] | None:
    if not OSRM_URL or len(points) > 100:
        return None
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in points)
    url = f"{OSRM_URL}/table/v1/driving/{coords}?annotations=distance,duration"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        if data.get("code") != "Ok":
            return None
        km = np.asarray(data["distances"], dtype=float) / 1000.0
        minutes = np.asarray(data["durations"], dtype=float) / 60.0
        if np.isnan(km).any():
            return None
        return km, minutes
    except Exception:
        return None


def build_matrices(points: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray, str]:
    """Return (distance_km, travel_minutes, source) for all point pairs."""
    osrm = _osrm_matrix(points)
    if osrm is not None:
        return osrm[0], osrm[1], "osrm"
    km = haversine_matrix_km(points) * ROAD_FACTOR
    minutes = km / AVG_SPEED_KMPH * 60.0
    return km, minutes, "haversine"
