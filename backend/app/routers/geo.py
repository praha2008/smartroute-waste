"""Place search for the apps' location picker (type-ahead dropdown + address under the map pin).

With GOOGLE_MAPS_API_KEY set: Google Places Autocomplete (New) + Place Details + Geocoding — the same
search Google Maps uses. Without it: Photon (photon.komoot.io, OpenStreetMap data, free, made for search-as-you-type) through the
server, so the apps never call third-party services directly. Results are biased towards the user's
position (or Vellore) and cached. Falls back to Nominatim for reverse geocoding.
"""
import json
import time
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Query

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


def _google(method: str, url: str, body: dict | None = None, field_mask: str | None = None) -> dict:
    """Call a Google Maps Platform endpoint with the server key (cached like _get)."""
    key = f"{method} {url} {json.dumps(body, sort_keys=True) if body else ''} {field_mask or ''}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]  # type: ignore[return-value]
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY}
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=6) as r:
        data = json.loads(r.read())
    if len(_cache) > 2000:
        _cache.clear()
    _cache[key] = (time.time(), data)
    return data


def _split(address: str) -> tuple[str, str]:
    parts = [x.strip() for x in address.split(",") if x.strip()]
    # drop "Tamil Nadu 632014" / "India" from the subtitle
    parts = [x for x in parts if x != "India"]
    if not parts:
        return "Selected location", ""
    n = 2 if len(parts) > 2 and (len(parts[0]) <= 6 or "+" in parts[0]) else 1  # "12, Gandhi Rd" / plus codes
    return ", ".join(parts[:n]), ", ".join(parts[n:n + 3])


def _google_search(q: str, lat: float, lng: float, limit: int, session: str | None, lang: str) -> list[dict]:
    body = {"input": q, "includedRegionCodes": ["in"], "languageCode": lang,
            "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 30000.0}}}
    if session:
        body["sessionToken"] = session
    data = _google("POST", "https://places.googleapis.com/v1/places:autocomplete", body)
    out = []
    for s in data.get("suggestions", [])[:limit]:
        pp = s.get("placePrediction")
        if not pp:
            continue
        fmt = pp.get("structuredFormat", {})
        title = fmt.get("mainText", {}).get("text") or pp.get("text", {}).get("text", "")
        sub = fmt.get("secondaryText", {}).get("text", "").replace(", India", "")
        out.append({"title": title, "subtitle": sub, "place_id": pp.get("placeId")})
    return out


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


@router.get("/provider")
def provider():
    return {"provider": "google" if config.GOOGLE_MAPS_API_KEY else "osm"}


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=120), lat: float | None = None, lng: float | None = None,
           limit: int = Query(6, ge=1, le=10), session: str | None = Query(None, max_length=64), lang: str = "en"):
    clat, clng = (lat, lng) if lat is not None and lng is not None else config.CITY_CENTER
    if config.GOOGLE_MAPS_API_KEY:
        try:
            return {"results": _google_search(q, clat, clng, limit, session, "ta" if lang == "ta" else "en"), "provider": "google"}
        except Exception:
            pass  # fall through to the free search
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


@router.get("/place")
def place(id: str = Query(..., min_length=3, max_length=300), session: str | None = Query(None, max_length=64), lang: str = "en"):
    """Coordinates of a Google search suggestion (Google returns them only after the user picks one)."""
    if not config.GOOGLE_MAPS_API_KEY:
        raise HTTPException(400, "Google search is not configured")
    q = {"languageCode": "ta" if lang == "ta" else "en"}
    if session:
        q["sessionToken"] = session
    try:
        d = _google("GET", f"https://places.googleapis.com/v1/places/{urllib.parse.quote(id)}?" + urllib.parse.urlencode(q),
                    field_mask="location,displayName,formattedAddress")
    except Exception:
        raise HTTPException(502, "Could not load that place. Please try again.")
    title = d.get("displayName", {}).get("text") or _split(d.get("formattedAddress", ""))[0]
    sub = _split(d.get("formattedAddress", ""))[1]
    loc = d.get("location", {})
    return {"title": title, "subtitle": sub, "lat": loc.get("latitude"), "lng": loc.get("longitude"),
            "address": d.get("formattedAddress", title).replace(", India", "")}


@router.get("/reverse")
def reverse(lat: float, lng: float, lang: str = "en"):
    if config.GOOGLE_MAPS_API_KEY:
        try:
            d = _google("GET", "https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode(
                {"latlng": f"{lat:.6f},{lng:.6f}", "key": config.GOOGLE_MAPS_API_KEY, "language": "ta" if lang == "ta" else "en"}))
            results = [r for r in d.get("results", []) if "plus_code" not in r.get("types", [])] or d.get("results", [])
            if results:
                addr = results[0]["formatted_address"].replace(", India", "")
                title, sub = _split(addr)
                return {"title": title, "subtitle": sub, "address": addr}
        except Exception:
            pass
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
