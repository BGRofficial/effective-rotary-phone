"""Thread-safe in-memory job store.

The store models the lifecycle of a reconstruction request from intake through
mesh export. A future upgrade swaps the in-memory dict for Redis/Celery without
touching callers — only `JobStore` itself needs to change.
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass
class Job:
    job_id: str
    status: JobStatus = JobStatus.QUEUED
    stage: str = "queued"
    progress: float = 0.0
    mesh_url: str | None = None
    triangle_count: int | None = None
    error: str | None = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc),
    )


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job_id = uuid.uuid4().hex[:12]
        job = Job(job_id=job_id)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(self, job_id: str, **changes: object) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in changes.items():
                setattr(job, key, value)

    def cleanup_older_than(self, hours: int) -> list[str]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        with self._lock:
            stale = [jid for jid, job in self._jobs.items() if job.created_at < cutoff]
            for jid in stale:
                del self._jobs[jid]
        return stale


job_store = JobStore()
