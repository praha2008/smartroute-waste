"""Place search for the apps' location picker (type-ahead dropdown + address under the map pin).

Uses Photon (photon.komoot.io, OpenStreetMap data, free, made for search-as-you-type) through the
server, so the apps never call third-party services directly. Results are biased towards the user's
position (or Vellore) and cached. Falls back to Nominatim for reverse geocoding.
"""
import json
import time
import urllib.parse
import urllib.request

from fastapi import APIRouter, Query

from .. import config

router = APIRouter(prefix="/geo", tags=["geo"])
UA = {"User-Agent": "SmartRouteWaste/1.0 (VIT IDP student project)"}
_cache: dict[str, tuple[float, object]] = {}
TTL = 3600


def _get(url: str) -> dict:
    hit = _cache.get(url)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]  # type: ignore[return-value]
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=6) as r:
        data = json.loads(r.read())
    if len(_cache) > 2000:
        _cache.clear()
    _cache[url] = (time.time(), data)
    return data


def _label(p: dict) -> tuple[str, str]:
    """(title, subtitle) from Photon properties."""
    title = p.get("name") or " ".join(x for x in (p.get("housenumber"), p.get("street")) if x) or p.get("city") or "Location"
    parts = [p.get("street") if p.get("name") else None, p.get("locality"), p.get("district"), p.get("city"),
             p.get("county"), p.get("state")]
    seen, sub = set(), []
    for x in parts:
        if x and x not in seen and x != title:
            seen.add(x)
            sub.append(x)
    return title, ", ".join(sub[:3])


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=120), lat: float | None = None, lng: float | None = None,
           limit: int = Query(6, ge=1, le=10)):
    clat, clng = (lat, lng) if lat is not None and lng is not None else config.CITY_CENTER
    params = {"q": q, "limit": limit, "lat": f"{clat:.5f}", "lon": f"{clng:.5f}", "lang": "en",
              # roughly Tamil Nadu + neighbours, so "Gandhi Nagar" finds the Vellore one first
              "bbox": "75.5,8.0,81.0,14.5"}
    try:
        data = _get("https://photon.komoot.io/api/?" + urllib.parse.urlencode(params))
    except Exception:
        return {"results": [], "error": "Place search is unavailable right now"}
    out = []
    for f in data.get("features", []):
        lng_, lat_ = f["geometry"]["coordinates"]
        title, sub = _label(f.get("properties", {}))
        out.append({"title": title, "subtitle": sub, "lat": lat_, "lng": lng_})
    return {"results": out}


@router.get("/reverse")
def reverse(lat: float, lng: float):
    try:
        data = _get(f"https://photon.komoot.io/reverse?lat={lat:.6f}&lon={lng:.6f}&lang=en")
        feats = data.get("features", [])
        if feats:
            title, sub = _label(feats[0].get("properties", {}))
            return {"title": title, "subtitle": sub, "address": ", ".join(x for x in (title, sub) if x)}
    except Exception:
        pass
    try:
        data = _get("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
            {"lat": f"{lat:.6f}", "lon": f"{lng:.6f}", "format": "jsonv2", "zoom": 18}))
        a = data.get("address", {})
        title = a.get("road") or a.get("neighbourhood") or a.get("suburb") or "Selected location"
        sub = ", ".join(x for x in (a.get("suburb"), a.get("city") or a.get("town") or a.get("village")) if x and x != title)
        return {"title": title, "subtitle": sub, "address": data.get("display_name", title)}
    except Exception:
        return {"title": "Selected location", "subtitle": f"{lat:.5f}, {lng:.5f}", "address": f"{lat:.5f}, {lng:.5f}"}
