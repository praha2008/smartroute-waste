"""Stage 1 - DBSCAN "communities" + density-triggered dispatch.

Idea: instead of sending a truck to every single request immediately, we group active
requests that are close to each other (DBSCAN with the Haversine metric). A dense
group is worth a truck trip now. An isolated request ("noise") is handled by rules:

  1. urgent (hazardous, high/critical urgency, or its SLA deadline is near) -> dispatch alone
  2. close to an existing community (<= attach_km from its centroid)       -> join that community
  3. otherwise                                                             -> defer: wait until
     neighbours appear or its deadline gets near (it will then be rule 1)

This cuts kilometres per pickup without ever risking an SLA breach.
"""
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import DBSCAN

from ..geo import EARTH_RADIUS_KM, haversine_km
from .model import Job


@dataclass
class ClusterParams:
    eps_km: float = 0.6            # neighbourhood radius
    min_samples: int = 3           # requests needed to form a community
    attach_km: float = 1.2         # noise this close to a community joins it
    urgent_within_min: float = 360  # deadline within 6 h -> dispatch now even if isolated
    defer_enabled: bool = True


def is_urgent(job: Job, p: ClusterParams) -> bool:
    return (
        job.waste_type == "hazardous"
        or job.urgency in ("high", "critical")
        or job.deadline_min <= p.urgent_within_min
    )


def cluster_jobs(jobs: list[Job], p: ClusterParams) -> dict[int, list[int]]:
    """Assign job.cluster in place. Returns {cluster_id: [job ids]} (noise = -1 not included)."""
    if not jobs:
        return {}
    if len(jobs) < p.min_samples:
        for j in jobs:
            j.cluster = -1
        return {}
    coords = np.radians([[j.lat, j.lng] for j in jobs])
    labels = DBSCAN(
        eps=p.eps_km / EARTH_RADIUS_KM, min_samples=p.min_samples, metric="haversine", algorithm="ball_tree"
    ).fit_predict(coords)
    clusters: dict[int, list[int]] = {}
    for j, lab in zip(jobs, labels):
        j.cluster = int(lab)
        if lab >= 0:
            clusters.setdefault(int(lab), []).append(j.id)
    return clusters


def select_for_dispatch(jobs: list[Job], p: ClusterParams) -> tuple[list[Job], list[Job], dict[int, list[int]]]:
    """Run DBSCAN and decide which jobs go out now.
    Returns (dispatch, deferred, clusters)."""
    clusters = cluster_jobs(jobs, p)
    by_id = {j.id: j for j in jobs}
    centroids = {
        c: (float(np.mean([by_id[i].lat for i in ids])), float(np.mean([by_id[i].lng for i in ids])))
        for c, ids in clusters.items()
    }
    dispatch, deferred = [], []
    for j in jobs:
        if j.cluster is not None and j.cluster >= 0:
            dispatch.append(j)
            continue
        # noise point
        if centroids:
            c, (clat, clng) = min(centroids.items(), key=lambda kv: haversine_km(j.lat, j.lng, *kv[1]))
            if haversine_km(j.lat, j.lng, clat, clng) <= p.attach_km:
                j.cluster = c
                clusters[c].append(j.id)
                dispatch.append(j)
                continue
        if is_urgent(j, p) or not p.defer_enabled:
            dispatch.append(j)  # isolated but must go now
        else:
            deferred.append(j)
    return dispatch, deferred, clusters
