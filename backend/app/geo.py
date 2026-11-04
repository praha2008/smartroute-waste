"""Geospatial helpers."""
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088
# Road distance is longer than straight-line distance. Until OSRM road
# distances are plugged in, we use a typical urban detour factor.
ROAD_FACTOR = 1.35
AVG_SPEED_KMPH = 20.0       # urban garbage truck average
SERVICE_MIN_PER_STOP = 4.0  # time to load one pickup


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two GPS points in kilometres."""
    lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def road_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return haversine_km(lat1, lng1, lat2, lng2) * ROAD_FACTOR


def travel_minutes(km: float) -> float:
    return km / AVG_SPEED_KMPH * 60


def nearest_ward(lat: float | None, lng: float | None) -> str | None:
    """Name of the closest Vellore ward centre (within 8 km), used when the user doesn't pick one."""
    if lat is None or lng is None:
        return None
    from .seed import WARDS  # local import: seed imports models

    name, (wlat, wlng, *_rest) = min(WARDS.items(), key=lambda kv: haversine_km(lat, lng, kv[1][0], kv[1][1]))
    return name if haversine_km(lat, lng, wlat, wlng) <= 8 else None
