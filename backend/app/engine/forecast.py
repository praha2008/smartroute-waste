"""Micro-level demand forecasting: requests per ward (and per waste type) for tomorrow and
the next 7 days, plus "who is likely to request tomorrow" for regular generators.

Data      The real request history in the database when it covers >= 28 days; otherwise a
          clearly-labelled SIMULATED 120-day Vellore history (weekly pattern, growth in app
          adoption, festival spikes, random noise) so the method can be shown on a new system.
Model     Seasonally adjusted moving average: the last 7 days with day-of-week and festival effects
          removed, times tomorrow's day-of-week x festival factor. Factors are learned from the
          city total, which keeps them stable even though each ward only has a few requests a day.
Compared  naive (= yesterday), seasonal naive (= same weekday last week), 7-day moving average and
          a gradient-boosting ML model (trained on all wards: weekday, ward, trend, festival, lags).
          At ward level counts are small and noisy, so the simpler seasonal model wins - shown honestly.
Backtest  last 14 days, one-day-ahead (the planner needs tomorrow), scored by MAE and WAPE.
Use       tomorrow's kg per waste type -> how many trucks to send, and whether the hazmat van is needed.
"""
import math
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PickupRequest, User, utcnow
from .evaluate import BASE_KG, MIX, WARDS

IST = timedelta(hours=5, minutes=30)
TYPES = ["organic", "recyclable", "general", "e_waste", "hazardous"]
# festival days (approximate dates) when households and markets throw away much more
FESTIVALS = {
    date(2026, 8, 15): "Independence Day", date(2026, 9, 14): "Vinayaka Chaturthi",
    date(2026, 10, 19): "Ayudha Pooja", date(2026, 10, 20): "Vijayadashami",
    date(2026, 11, 8): "Deepavali", date(2026, 12, 25): "Christmas", date(2027, 1, 1): "New Year",
    date(2027, 1, 14): "Pongal", date(2027, 1, 15): "Mattu Pongal",
}
PROFILE_RATE = {"market": 6.0, "students": 5.0, "residential": 3.5, "mixed": 4.0, "industrial": 3.0}
DOW_FACTOR = [1.10, 0.95, 0.95, 1.00, 1.00, 1.08, 1.25]  # Mon..Sun
STOPS_PER_TRUCK_DAY = 45
COMPACTOR_KG = 2000
_cache: dict = {}


def today_ist() -> date:
    return (utcnow() + IST).date()


def is_festival(d: date) -> int:
    return int(d in FESTIVALS)


def after_festival(d: date) -> int:
    return int((d - timedelta(days=1)) in FESTIVALS)


# ------------------------------------------------------------------------------------------ data
def simulated_history(days: int = 120, seed: int = 11) -> dict:
    """{ward: {date: {type: (count, kg)}}} ending yesterday."""
    rnd = np.random.default_rng(seed)
    end = today_ist() - timedelta(days=1)
    hist: dict = defaultdict(dict)
    for i in range(days):
        d = end - timedelta(days=days - 1 - i)
        adoption = 0.65 + 0.35 * i / days
        for ward, (_, _, _, profile) in WARDS.items():
            lam = PROFILE_RATE[profile] * adoption * DOW_FACTOR[d.weekday()]
            if is_festival(d):
                lam *= 1.7 if profile == "market" else 1.5
            elif after_festival(d):
                lam *= 1.35
            n = int(rnd.poisson(lam))
            mix = MIX[profile]
            types = rnd.choice(TYPES, size=n, p=np.array([mix[t] for t in TYPES]) / sum(mix.values())) if n else []
            day: dict = {}
            for t in TYPES:
                c = int(sum(1 for x in types if x == t))
                if c:
                    day[t] = (c, round(float(sum(BASE_KG[t] * rnd.uniform(0.5, 1.9) for _ in range(c))), 1))
            hist[ward][d] = day
    return hist


def database_history(db: Session) -> tuple[dict, list[tuple]]:
    """Returns (history like simulated_history, raw rows (user_id, name, ward, date, type, kg))."""
    rows = db.execute(
        select(PickupRequest.user_id, User.name, User.ward, PickupRequest.created_at, PickupRequest.waste_type,
               PickupRequest.actual_kg, PickupRequest.est_kg)
        .join(User, User.id == PickupRequest.user_id)
        .where(PickupRequest.status != "cancelled")
    ).all()
    hist: dict = defaultdict(lambda: defaultdict(dict))
    raw = []
    for uid, name, ward, created, wt, actual, est in rows:
        if not ward or ward not in WARDS:
            continue
        d = (created + IST).date()
        kg = actual if actual else est
        c, k = hist[ward][d].get(wt, (0, 0.0))
        hist[ward][d][wt] = (c + 1, k + kg)
        raw.append((uid, name, ward, d, wt, kg))
    return hist, raw


# ------------------------------------------------------------------------------------------ model
def _series(hist: dict, start: date, end: date) -> dict[str, np.ndarray]:
    n = (end - start).days + 1
    return {w: np.array([sum(c for c, _ in hist.get(w, {}).get(start + timedelta(days=i), {}).values())
                         for i in range(n)], dtype=float) for w in WARDS}


def _features(ward_idx: int, d: date, t: int, y: np.ndarray, i: int) -> list[float]:
    """Features for predicting index i of series y (uses only values before i)."""
    dow = [0.0] * 7
    dow[d.weekday()] = 1.0
    wv = [0.0] * len(WARDS)
    wv[ward_idx] = 1.0
    lag1 = y[i - 1]
    lag7 = y[i - 7]
    roll7 = float(np.mean(y[i - 7:i]))
    return dow + wv + [t / 100.0, is_festival(d), after_festival(d), lag1, lag7, roll7]


def _dataset(series: dict, start: date, first: int, last: int):
    X, Y = [], []
    for wi, w in enumerate(WARDS):
        y = series[w]
        for i in range(max(first, 7), last + 1):
            X.append(_features(wi, start + timedelta(days=i), i, y, i))
            Y.append(y[i])
    return np.array(X), np.array(Y)


class Seasonal:
    """Day-of-week and festival multipliers learned from the city total (robust for small ward counts)."""

    def __init__(self, series: dict, start: date, upto: int):
        city = np.sum([series[w][:upto] for w in WARDS], axis=0)
        ratios: dict[int, list[float]] = defaultdict(list)
        fest, post = [], []
        for i in range(3, upto - 3):
            base = float(np.mean(city[i - 3:i + 4]))
            if base <= 0:
                continue
            d = start + timedelta(days=i)
            r = city[i] / base
            if is_festival(d):
                fest.append(r)
            elif after_festival(d):
                post.append(r)
            else:
                ratios[d.weekday()].append(r)
        # shrink towards "no effect" when there are few observations (k = pseudo-weeks of prior)
        k = 6.0
        dow = np.array([1 + (np.mean(ratios[d]) - 1) * len(ratios[d]) / (len(ratios[d]) + k) if ratios[d] else 1.0
                        for d in range(7)])
        self.dow = dow / dow.mean()
        # festival effect: prior +50% (day) / +30% (day after), blended with what history shows
        self.fest = float((1.5 * 2 + sum(fest)) / (2 + len(fest)))
        self.post = float((1.3 * 2 + sum(post)) / (2 + len(post)))
        self.learned_festival = bool(fest)

    def factor(self, d: date) -> float:
        f = self.dow[d.weekday()]
        if is_festival(d):
            f *= self.fest
        elif after_festival(d):
            f *= self.post
        return float(f)

    def predict_ma(self, y: np.ndarray, i: int, start: date) -> float:
        """Plain 7-day average, but still lifted on festival days (prior/learned factor)."""
        d = start + timedelta(days=i)
        lift = self.fest if is_festival(d) else self.post if after_festival(d) else 1.0
        return float(np.mean(y[i - 7:i]) * lift)

    def predict(self, y: np.ndarray, i: int, start: date) -> float:
        """Deseasonalised mean of the last 7 days x tomorrow's seasonal factor."""
        level = np.mean([y[i - k] / self.factor(start + timedelta(days=i - k)) for k in range(1, 8)])
        return float(level * self.factor(start + timedelta(days=i)))


def _gbr() -> GradientBoostingRegressor:
    return GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=0)


def _wape(err: list[float], actual: list[float]) -> float:
    return round(100 * float(np.sum(np.abs(err))) / max(1e-9, float(np.sum(actual))), 1)


def backtest(series: dict, start: date, n_days: int, test_days: int = 14) -> tuple[list[dict], float]:
    """One-day-ahead backtest over the last `test_days`. Returns (accuracy table, city residual std)."""
    split = n_days - test_days
    Xtr, Ytr = _dataset(series, start, 7, split - 1)
    model = _gbr().fit(Xtr, Ytr)
    seas = Seasonal(series, start, split)
    preds = {m: [] for m in ("naive", "seasonal", "ma7", "gbr", "sama")}
    actual, city_act, city_pred = [], defaultdict(float), {m: defaultdict(float) for m in preds}
    for wi, w in enumerate(WARDS):
        y = series[w]
        for i in range(split, n_days):
            d = start + timedelta(days=i)
            p = {"naive": y[i - 1], "seasonal": y[i - 7], "ma7": float(np.mean(y[i - 7:i])),
                 "gbr": max(0.0, float(model.predict([_features(wi, d, i, y, i)])[0])),
                 "sama": seas.predict(y, i, start)}
            for m, v in p.items():
                preds[m].append(v)
                city_pred[m][i] += v
            actual.append(y[i])
            city_act[i] += y[i]
    labels = {"naive": "Naive (same as yesterday)", "seasonal": "Seasonal naive (same weekday last week)",
              "ma7": "7-day moving average", "gbr": "Gradient boosting (machine learning)",
              "sama": "Seasonally adjusted average (SmartRoute)"}
    table = []
    ca = [city_act[i] for i in sorted(city_act)]
    for m in preds:
        err = np.array(preds[m]) - np.array(actual)
        cerr = [city_pred[m][i] - city_act[i] for i in sorted(city_act)]
        table.append({"model": m, "label": labels[m], "mae": round(float(np.mean(np.abs(err))), 2),
                      "wape": _wape(list(err), actual), "city_wape": _wape(cerr, ca)})
    resid = [city_pred["sama"][i] - city_act[i] for i in sorted(city_act)]
    return table, float(np.std(resid)) if resid else 1.0


def forecast(db: Session, horizon: int = 8) -> dict:
    """horizon days starting today (history ends yesterday): index n = today, n+1 = tomorrow."""
    t0 = time.time()
    hist_db, raw = database_history(db)
    days_db = {d for w in hist_db.values() for d in w}
    source = "database" if days_db and (max(days_db) - min(days_db)).days >= 27 else "simulated"
    key = (source, len(raw), today_ist())
    if key in _cache and time.time() - _cache[key][0] < 600:
        return _cache[key][1]

    hist = hist_db if source == "database" else simulated_history()
    start = min(d for w in hist.values() for d in w)
    end = today_ist() - timedelta(days=1)
    n = (end - start).days + 1
    series = _series(hist, start, end)

    accuracy, city_sigma = backtest(series, start, n)
    seas = Seasonal(series, start, n)
    wape = {a["model"]: a["wape"] for a in accuracy}
    use = "sama" if wape["sama"] <= wape["ma7"] else "ma7"  # model selection by backtest

    # ---- recursive multi-day forecast per ward
    ext = {w: np.concatenate([series[w], np.zeros(horizon)]) for w in WARDS}
    for h in range(horizon):
        i = n + h
        d = start + timedelta(days=i)
        for w in WARDS:
            p = seas.predict(ext[w], i, start) if use == "sama" else seas.predict_ma(ext[w], i, start)
            ext[w][i] = max(0.0, p)

    # ward mix of waste types + mean kg per type (last 28 days)
    recent = [end - timedelta(days=k) for k in range(28)]
    wards_out, tomorrow_by_type = [], defaultdict(lambda: [0.0, 0.0])
    for w in WARDS:
        cnt, kgs = defaultdict(float), defaultdict(float)
        for d in recent:
            for t, (c, k) in hist.get(w, {}).get(d, {}).items():
                cnt[t] += c
                kgs[t] += k
        total = sum(cnt.values()) or 1
        pred = float(ext[w][n + 1])  # tomorrow
        by_type = {}
        for t in TYPES:
            share = cnt[t] / total if cnt else MIX[WARDS[w][3]][t] / 100
            avg_kg = kgs[t] / cnt[t] if cnt[t] else BASE_KG[t]
            c_t = pred * share
            by_type[t] = {"count": round(c_t, 1), "kg": round(c_t * avg_kg, 1)}
            tomorrow_by_type[t][0] += c_t
            tomorrow_by_type[t][1] += c_t * avg_kg
        last7 = float(np.mean(series[w][-7:]))
        wards_out.append({
            "ward": w, "profile": WARDS[w][3], "lat": WARDS[w][0], "lng": WARDS[w][1],
            "tomorrow": round(pred, 1), "last7_avg": round(last7, 1),
            "change_pct": round(100 * (pred - last7) / last7, 0) if last7 else None,
            "next7_total": round(float(np.sum(ext[w][n + 1:n + 8])), 0),
            "top_type": max(by_type, key=lambda t: by_type[t]["count"]), "by_type": by_type,
        })
    wards_out.sort(key=lambda r: -r["tomorrow"])

    city_hist = [{"date": (start + timedelta(days=i)).isoformat(), "count": int(sum(series[w][i] for w in WARDS))}
                 for i in range(max(0, n - 35), n)]
    city_fc = []
    for h in range(horizon):
        i = n + h
        d = start + timedelta(days=i)
        v = float(sum(ext[w][i] for w in WARDS))
        spread = 1.28 * city_sigma * math.sqrt(h + 1)  # ~80% interval, widening with horizon
        city_fc.append({"date": d.isoformat(), "count": round(v, 1), "lo": round(max(0.0, v - spread), 1),
                        "hi": round(v + spread, 1), "festival": FESTIVALS.get(d), "is_today": h == 0})

    # ---- fleet suggestion for tomorrow
    tt = {t: {"count": round(c, 1), "kg": round(k, 1)} for t, (c, k) in tomorrow_by_type.items()}
    total_count = sum(v["count"] for v in tt.values())
    nonhaz_count = total_count - tt["hazardous"]["count"]
    nonhaz_kg = sum(v["kg"] for t, v in tt.items() if t != "hazardous")
    general_trucks = max(1, math.ceil(nonhaz_count / STOPS_PER_TRUCK_DAY), math.ceil(nonhaz_kg / (0.8 * COMPACTOR_KG)))
    hazmat = tt["hazardous"]["count"] >= 0.5
    fleet = {
        "general_trucks": general_trucks, "hazmat_van": hazmat, "total_trucks": general_trucks + int(hazmat),
        "reason": [
            f"{nonhaz_count:.0f} non-hazardous pickups expected; one truck handles about {STOPS_PER_TRUCK_DAY} stops a day "
            f"-> {math.ceil(nonhaz_count / STOPS_PER_TRUCK_DAY)} truck(s) by stops.",
            f"{nonhaz_kg:.0f} kg expected vs {int(0.8 * COMPACTOR_KG)} kg usable per compactor -> "
            f"{math.ceil(nonhaz_kg / (0.8 * COMPACTOR_KG))} truck(s) by weight.",
            f"{tt['hazardous']['count']:.1f} hazardous pickups expected -> hazmat van {'needed' if hazmat else 'not needed'}.",
        ],
    }

    # ---- individual regular generators (only possible with real history)
    regulars = []
    if source == "database":
        by_user = defaultdict(list)
        for uid, name, ward, d, wt, kg in raw:
            by_user[(uid, name, ward)].append((d, wt, kg))
        tomorrow = today_ist() + timedelta(days=1)
        for (uid, name, ward), items in by_user.items():
            ds = sorted({d for d, _, _ in items})
            if len(ds) < 4 or (end - ds[-1]).days > 21:
                continue
            gaps = np.diff([d.toordinal() for d in ds])
            mean_gap, sd = float(np.mean(gaps)), float(np.std(gaps))
            expected = ds[-1] + timedelta(days=round(mean_gap))
            if abs((expected - tomorrow).days) <= max(1, round(sd)):
                types = defaultdict(int)
                for _, wt, _ in items:
                    types[wt] += 1
                regulars.append({"user_id": uid, "name": name, "ward": ward, "every_days": round(mean_gap, 1),
                                 "last": ds[-1].isoformat(), "expected": expected.isoformat(),
                                 "usual_type": max(types, key=types.get),
                                 "avg_kg": round(float(np.mean([k for _, _, k in items])), 1)})
        regulars.sort(key=lambda r: (abs((date.fromisoformat(r["expected"]) - tomorrow).days), r["every_days"]))

    best = min(accuracy, key=lambda r: r["wape"])
    out = {
        "source": source, "history_days": n, "history_start": start.isoformat(), "history_end": end.isoformat(),
        "today": today_ist().isoformat(), "accuracy": accuracy, "best_model": best["model"], "used_model": use,
        "tomorrow": {"date": (today_ist() + timedelta(days=1)).isoformat(),
                     "count": round(total_count, 1), "kg": round(sum(v["kg"] for v in tt.values()), 1), "by_type": tt},
        "city_history": city_hist, "city_forecast": city_fc, "wards": wards_out, "fleet": fleet,
        "regulars": regulars[:12], "festivals_ahead": [f for f in city_fc if f["festival"]],
        "factors": {"day_of_week": {d: round(float(v), 2) for d, v in zip(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], seas.dow)},
                    "festival": round(seas.fest, 2), "after_festival": round(seas.post, 2),
                    "festival_learned": seas.learned_festival},
        "compute_s": round(time.time() - t0, 2),
    }
    _cache.clear()
    _cache[key] = (time.time(), out)
    return out
