"""Place search for the apps' location picker (type-ahead dropdown + address under the map pin).

100% free OpenStreetMap data, made consistent:

1. **Local index.** On start-up the server downloads every named place around the city once
   (colleges, shops, hospitals, temples, bus stands, streets, areas) from the Overpass API and keeps
   it in memory. Typing "vit uni" or "cmc" matches word prefixes instantly, nearest first.
2. **Photon**, then **Nominatim**, fill in anything the local index doesn't have (other towns, house
   addresses). Nominatim is called at most once per second, as its usage policy asks.
3. Results are cached, failing services are skipped for a few minutes, and duplicates are merged.
   An empty list means nothing was found, not that a service hiccupped.
"""
import json
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Query

from .. import config
from ..geo import haversine_km, nearest_ward

router = APIRouter(prefix="/geo", tags=["geo"])
UA = {"User-Agent": "SmartRouteWaste/1.0 (VIT IDP student project; waste pickup app for Vellore)"}
TTL = 6 * 3600
_cache: dict[str, tuple[float, object]] = {}
_search_cache: dict[str, tuple[float, dict]] = {}
_down: dict[str, float] = {}  # service -> skip until (epoch)


def reset_state() -> None:
    """For tests."""
    _cache.clear()
    _search_cache.clear()
    _down.clear()


def _get(url: str, data: bytes | None = None, timeout: float = 8) -> object:
    key = url + (data.decode() if data else "")
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.loads(r.read())
    if len(_cache) > 3000:
        _cache.clear()
    _cache[key] = (time.time(), out)
    return out


def _up(name: str) -> bool:
    return time.time() >= _down.get(name, 0)


def _mark_down(name: str, minutes: float) -> None:
    _down[name] = time.time() + minutes * 60


_nomi_lock = threading.Lock()
_nomi_last = [0.0]


def _nominatim(path: str, params: dict) -> object:
    """Nominatim allows 1 request per second: cached answers are free, new ones wait their turn."""
    url = f"https://nominatim.openstreetmap.org/{path}?" + urllib.parse.urlencode(params)
    hit = _cache.get(url)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    with _nomi_lock:
        wait = 1.05 - (time.time() - _nomi_last[0])
        if wait > 0:
            time.sleep(wait)
        _nomi_last[0] = time.time()
        return _get(url)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _area(lat: float, lng: float) -> str:
    w = nearest_ward(lat, lng)
    return f"{w}, {config.CITY_NAME}" if w else config.CITY_NAME


# ------------------------------------------------------------------ local index (Overpass)
KINDS = {
    "university": "University", "college": "College", "school": "School", "kindergarten": "School",
    "hospital": "Hospital", "clinic": "Clinic", "doctors": "Clinic", "pharmacy": "Pharmacy", "dentist": "Clinic",
    "bus_station": "Bus stand", "station": "Railway station", "halt": "Railway station", "bus_stop": "Bus stop",
    "place_of_worship": "Temple / place of worship", "restaurant": "Restaurant", "fast_food": "Restaurant",
    "cafe": "Cafe", "bank": "Bank", "atm": "ATM", "fuel": "Petrol bunk", "hotel": "Hotel", "guest_house": "Hotel",
    "marketplace": "Market", "supermarket": "Supermarket", "mall": "Mall", "police": "Police station",
    "townhall": "Government office", "post_office": "Post office", "cinema": "Cinema", "park": "Park",
    "stadium": "Stadium", "library": "Library", "attraction": "Attraction", "museum": "Museum",
    "hostel": "Hostel", "dormitory": "Hostel", "apartments": "Apartments", "community_centre": "Community hall",
    "marriage_hall": "Marriage hall", "toilets": "Toilets", "parking": "Parking", "fire_station": "Fire station",
}
AREA_PLACES = {"suburb", "neighbourhood", "quarter", "village", "hamlet", "town", "city", "locality", "isolated_dwelling"}
INDEX: list[dict] = []
INDEX_STATE = {"status": "empty", "count": 0, "updated": 0.0, "error": None}
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
_index_lock = threading.Lock()


def _load_saved() -> tuple[list[dict], float] | None:
    """Index saved in the database (fresh for 7 days), so a server restart doesn't re-download it."""
    import zlib

    from ..database import SessionLocal
    from ..models import CachedBlob

    try:
        with SessionLocal() as db:
            row = db.get(CachedBlob, "places_index")
            if not row:
                return None
            ts = row.updated_at.timestamp() if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=__import__("datetime").timezone.utc).timestamp()
            if time.time() - ts > 7 * 86400:
                return None
            return json.loads(zlib.decompress(row.data)), ts
    except Exception:
        return None


def _save(entries: list[dict]) -> None:
    import zlib

    from ..database import SessionLocal
    from ..models import CachedBlob, utcnow

    try:
        with SessionLocal() as db:
            row = db.get(CachedBlob, "places_index") or CachedBlob(key="places_index", data=b"")
            row.data, row.updated_at = zlib.compress(json.dumps(entries).encode(), 6), utcnow()
            db.merge(row)
            db.commit()
    except Exception:
        pass


def _kind(tags: dict) -> tuple[str, float]:
    """(label, rank bonus) for an OSM feature."""
    for k in ("amenity", "shop", "tourism", "leisure", "railway", "building", "office", "healthcare"):
        v = tags.get(k)
        if v and v in KINDS:
            return KINDS[v], 1.0
    if tags.get("shop"):
        return "Shop", 0.9
    if tags.get("amenity") or tags.get("tourism") or tags.get("office") or tags.get("healthcare"):
        return (tags.get("amenity") or tags.get("tourism") or tags.get("office") or "Place").replace("_", " ").capitalize(), 0.8
    if tags.get("place") in AREA_PLACES:
        return "Area", 0.9
    if tags.get("highway"):
        return "Road", 0.3
    if tags.get("building"):
        return "Building", 0.6
    return "Place", 0.5


def _build_entries(elements: list[dict]) -> list[dict]:
    out, seen = [], {}
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name:en") or tags.get("name")
        if not name:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        label, bonus = _kind(tags)
        # roads come in many pieces: keep one per name within ~600 m
        key = (_norm(name), label, round(lat / 0.006), round(lng / 0.006))
        if key in seen:
            continue
        seen[key] = True
        names = {name, tags.get("name", ""), tags.get("alt_name", ""), tags.get("short_name", ""), tags.get("official_name", ""), tags.get("old_name", "")}
        # the category is searchable too: "vit uni" -> University, "cmc hosp" -> Hospital
        words = sorted({w for n in names | {label} for w in _norm(n).split()})
        street = tags.get("addr:street") or ""
        out.append({"name": name, "norm": _norm(name), "words": words, "lat": float(lat), "lng": float(lng),
                    "label": label, "bonus": bonus, "street": street})
    return out


def _index_bbox() -> tuple[float, float, float, float]:
    lat, lng = config.CITY_CENTER
    d = 0.16  # ~18 km around the city centre: Vellore, Katpadi, VIT, Sathuvachari, Bagayam...
    return lat - d, lng - d, lat + d, lng + d


def build_index(force: bool = False) -> None:
    """Download named places around the city (runs in a background thread)."""
    if not _index_lock.acquire(blocking=False):
        return
    try:
        if not force:
            saved = _load_saved()
            if saved:
                entries, ts = saved
                INDEX[:] = entries
                INDEX_STATE.update(status="ready", count=len(entries), updated=ts, error=None)
                return
        INDEX_STATE.update(status="building", error=None)
        s, w, n, e = _index_bbox()
        q = (f"[out:json][timeout:120];(node[\"name\"]({s},{w},{n},{e});way[\"name\"]({s},{w},{n},{e});"
             f"relation[\"name\"][\"place\"]({s},{w},{n},{e}););out center tags;")
        last_err = None
        for url in OVERPASS:
            try:
                data = _get(url, data=urllib.parse.urlencode({"data": q}).encode(), timeout=150)
                entries = _build_entries(data.get("elements", []))  # type: ignore[union-attr]
                if entries:
                    INDEX[:] = entries
                    INDEX_STATE.update(status="ready", count=len(entries), updated=time.time(), error=None)
                    _save(entries)
                    _cache.clear()  # don't keep the big Overpass reply in memory twice
                    return
            except Exception as ex:  # try the next mirror
                last_err = f"{url.split('/')[2]}: {ex}"
        INDEX_STATE.update(status="failed", error=last_err, updated=time.time())
    finally:
        _index_lock.release()


def ensure_index() -> None:
    """Start building the index if it is missing (retries a failed build every 10 minutes)."""
    if os.getenv("GEO_INDEX", "1") == "0":
        return
    st = INDEX_STATE["status"]
    if st == "ready" or st == "building":
        return
    if st == "failed" and time.time() - float(INDEX_STATE["updated"]) < 600:
        return
    threading.Thread(target=build_index, daemon=True).start()


def _local_search(q: str, lat: float, lng: float, limit: int) -> list[dict]:
    words = _norm(q).split()
    if not words or not INDEX:
        return []
    phrase = " ".join(words)
    scored = []
    for e in INDEX:
        ew = e["words"]
        if not all(any(x.startswith(w) for x in ew) for w in words):
            continue
        score = e["bonus"]
        if e["norm"] == phrase:
            score += 4
        elif e["norm"].startswith(phrase):
            score += 2.5
        elif phrase in e["norm"]:
            score += 1.2
        d = haversine_km(lat, lng, e["lat"], e["lng"])
        score -= min(d, 30) / 12  # nearer is better
        scored.append((score, d, e))
    scored.sort(key=lambda t: (-t[0], t[1]))
    out = []
    for _s, _d, e in scored[:limit]:
        place = ", ".join(x for x in (e.get("street"), _area(e["lat"], e["lng"])) if x)
        out.append({"title": e["name"], "subtitle": f"{e['label']} · {place}", "lat": e["lat"], "lng": e["lng"]})
    return out


# ------------------------------------------------------------------ Photon / Nominatim
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


def _photon_search(q: str, lat: float, lng: float, limit: int) -> list[dict]:
    params = {"q": q, "limit": max(limit, 10), "lat": f"{lat:.5f}", "lon": f"{lng:.5f}", "lang": "en",
              "bbox": "75.5,8.0,81.0,14.5"}  # Tamil Nadu + neighbours
    data = _get("https://photon.komoot.io/api/?" + urllib.parse.urlencode(params), timeout=5)
    out = []
    for f in data.get("features", []):  # type: ignore[union-attr]
        lng_, lat_ = f["geometry"]["coordinates"]
        title, sub = _label(f.get("properties", {}))
        out.append({"title": title, "subtitle": sub, "lat": lat_, "lng": lng_})
    return out


def _nominatim_search(q: str, lat: float, lng: float, limit: int) -> list[dict]:
    """OpenStreetMap's own geocoder: first within ~40 km of the user, then all of India."""
    d = 0.35
    base = {"q": q, "format": "jsonv2", "addressdetails": 1, "limit": limit, "countrycodes": "in", "accept-language": "en",
            "viewbox": f"{lng - d:.4f},{lat + d:.4f},{lng + d:.4f},{lat - d:.4f}"}
    data = _nominatim("search", {**base, "bounded": 1})
    if not isinstance(data, list) or len(data) < 2:
        wide = _nominatim("search", {**base, "bounded": 0})
        data = (data if isinstance(data, list) else []) + (wide if isinstance(wide, list) else [])
    out = []
    for r in data if isinstance(data, list) else []:
        a = r.get("address", {})
        title = r.get("name") or (r.get("display_name", "").split(",")[0]) or "Location"
        parts = [a.get("road"), a.get("suburb") or a.get("neighbourhood"), a.get("city") or a.get("town") or a.get("village"),
                 a.get("state_district"), a.get("state")]
        seen, sub = set(), []
        for x in parts:
            if x and x not in seen and x != title:
                seen.add(x)
                sub.append(x)
        out.append({"title": title, "subtitle": ", ".join(sub[:3]), "lat": float(r["lat"]), "lng": float(r["lon"])})
    return out


def _merge(*lists: list[dict]) -> list[dict]:
    out: list[dict] = []
    for lst in lists:
        for r in lst:
            if any(_norm(r["title"]) == _norm(o["title"]) and haversine_km(r["lat"], r["lng"], o["lat"], o["lng"]) < 0.4 for o in out):
                continue
            out.append(r)
    return out


@router.get("/status")
def status():
    return {"index": INDEX_STATE, "photon_ok": _up("photon"), "nominatim_ok": _up("nominatim")}


@router.get("/provider")
def provider():
    return {"provider": "osm"}


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=120), lat: float | None = None, lng: float | None = None,
           limit: int = Query(6, ge=1, le=10)):
    ensure_index()
    clat, clng = (lat, lng) if lat is not None and lng is not None else config.CITY_CENTER
    key = f"{_norm(q)}|{clat:.2f}|{clng:.2f}|{limit}"
    hit = _search_cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]

    local = _local_search(q, clat, clng, limit)
    online: list[dict] = []
    errors: list[str] = []
    if len(local) < limit and _up("photon"):
        try:
            online += _photon_search(q, clat, clng, limit)
        except Exception as e:
            errors.append(f"photon: {e}")
            _mark_down("photon", 10)
    if len(local) + len(online) < 4 and _up("nominatim"):
        try:
            online += _nominatim_search(q, clat, clng, limit)
            words = q.split()
            if not local and not online and len(words) > 1:  # last word still being typed: "vit uni"
                online += _nominatim_search(" ".join(words[:-1]), clat, clng, limit)
        except Exception as e:
            errors.append(f"nominatim: {e}")
            _mark_down("nominatim", 2)
    online.sort(key=lambda r: haversine_km(clat, clng, r["lat"], r["lng"]))  # nearest first
    results = _merge(local, online)[:limit]
    body: dict = {"results": results, "provider": "osm"}
    if errors:
        body["detail"] = errors
    if results:
        _search_cache[key] = (time.time(), body)
    elif errors:
        body["error"] = "Place search is unavailable right now"
    return body


@router.get("/place")
def place(id: str = Query(..., min_length=1, max_length=300)):
    raise HTTPException(400, "Not used: every search result already has coordinates")


def _nearby_poi(lat: float, lng: float) -> dict | None:
    best = None
    for e in INDEX:
        if e["label"] in ("Road", "Area"):
            continue
        if abs(e["lat"] - lat) > 0.001 or abs(e["lng"] - lng) > 0.001:
            continue
        d = haversine_km(lat, lng, e["lat"], e["lng"])
        if d <= 0.05 and (best is None or d < best[0]):
            best = (d, e)
    return best[1] if best else None


@router.get("/reverse")
def reverse(lat: float, lng: float):
    ensure_index()
    poi = _nearby_poi(lat, lng)
    res = None
    if _up("photon"):
        try:
            data = _get(f"https://photon.komoot.io/reverse?lat={lat:.6f}&lon={lng:.6f}&lang=en", timeout=5)
            feats = data.get("features", [])  # type: ignore[union-attr]
            if feats:
                title, sub = _label(feats[0].get("properties", {}))
                res = {"title": title, "subtitle": sub, "address": ", ".join(x for x in (title, sub) if x)}
        except Exception:
            _mark_down("photon", 10)
    if res is None and _up("nominatim"):
        try:
            data = _nominatim("reverse", {"lat": f"{lat:.5f}", "lon": f"{lng:.5f}", "format": "jsonv2", "zoom": 18,
                                          "addressdetails": 1, "accept-language": "en"})
            a = data.get("address", {})  # type: ignore[union-attr]
            road = " ".join(x for x in (a.get("house_number"), a.get("road")) if x)
            title = data.get("name") or road or a.get("neighbourhood") or a.get("suburb") or "Selected location"  # type: ignore[union-attr]
            sub = ", ".join(x for x in (road if road != title else None, a.get("suburb"),
                                        a.get("city") or a.get("town") or a.get("village")) if x and x != title)
            res = {"title": title, "subtitle": sub, "address": data.get("display_name", title)}  # type: ignore[union-attr]
        except Exception:
            _mark_down("nominatim", 2)
    if poi:  # standing right at a named place: show its name, like Google Maps
        sub = res["title"] if res and res["title"] != poi["name"] else (res or {}).get("subtitle") or _area(lat, lng)
        return {"title": poi["name"], "subtitle": sub, "address": ", ".join(x for x in (poi["name"], sub) if x)}
    if res:
        return res
    return {"title": "Selected location", "subtitle": _area(lat, lng), "address": f"{lat:.5f}, {lng:.5f}"}
