import asyncio
import base64
import socket
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from inference import run_yolo_detection, get_lstm_drowning_risk
from tracker import PersonTracker
import time
from inference import cleanup_person, person_buffers
from database import init_db, AsyncSessionLocal
from models import Session as DBSession, Event as DBEvent, Feedback as DBFeedback
from sqlalchemy import select, desc, func
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_db()

# Global tracker removed. It will be instantiated per session inside the websocket route.

# ── Live configuration (mutable at runtime) ─────────────────────────────────
live_config = {
    "conf_threshold": 0.25,   # YOLO confidence threshold
    "alert_threshold": 0.50,  # Risk % at which is_drowning = True
}

class FeedbackBody(BaseModel):
    session_id: int
    incident_id: int
    verdict: str          # 'confirmed' | 'false_alarm'
    max_risk_at_time: float
    notes: Optional[str] = None

class ConfigBody(BaseModel):
    conf_threshold: Optional[float] = None
    alert_threshold: Optional[float] = None

@app.get("/local-ip")
async def get_local_ip():
    """Returns the machine's LAN IP for QR code generation."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = "localhost"
    return {"ip": ip}


@app.get("/config")
async def get_config():
    """Return the current live inference configuration."""
    return live_config

@app.post("/config")
async def update_config(body: ConfigBody):
    """Update live inference configuration (threshold slider)."""
    if body.conf_threshold is not None:
        live_config["conf_threshold"] = max(0.05, min(0.95, body.conf_threshold))
    if body.alert_threshold is not None:
        live_config["alert_threshold"] = max(0.05, min(0.95, body.alert_threshold))
    return live_config

@app.post("/feedback")
async def submit_feedback(body: FeedbackBody):
    """Store user feedback (confirmed / false alarm) for an incident."""
    async with AsyncSessionLocal() as db:
        fb = DBFeedback(
            session_id=body.session_id,
            incident_id=body.incident_id,
            verdict=body.verdict,
            max_risk_at_time=body.max_risk_at_time,
            notes=body.notes,
        )
        db.add(fb)
        await db.commit()
    return {"status": "ok", "verdict": body.verdict}

@app.get("/feedback")
async def list_feedbacks(session_id: Optional[int] = None):
    """List all stored feedback, optionally filtered by session."""
    async with AsyncSessionLocal() as db:
        q = select(DBFeedback).order_by(desc(DBFeedback.submitted_at))
        if session_id:
            q = q.where(DBFeedback.session_id == session_id)
        result = await db.execute(q)
        rows = result.scalars().all()
    return [
        {
            "id": f.id,
            "session_id": f.session_id,
            "incident_id": f.incident_id,
            "verdict": f.verdict,
            "max_risk_at_time": f.max_risk_at_time,
            "submitted_at": f.submitted_at.isoformat() if f.submitted_at else None,
            "notes": f.notes,
        }
        for f in rows
    ]


# ── History REST endpoints ──────────────────────────────────────────────────

@app.get("/history/sessions")
async def list_sessions(limit: int = 50, offset: int = 0):
    """Paginated list of monitoring sessions, newest first."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DBSession)
            .order_by(desc(DBSession.started_at))
            .limit(limit)
            .offset(offset)
        )
        sessions = result.scalars().all()
        count_result = await db.execute(select(func.count()).select_from(DBSession))
        total = count_result.scalar()

    return {
        "total": total,
        "sessions": [
            {
                "id": s.id,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "source": s.source,
                "peak_risk": s.peak_risk,
                "total_incidents": s.total_incidents,
            }
            for s in sessions
        ],
    }

@app.get("/history/sessions/{session_id}/events")
async def get_session_events(session_id: int, limit: int = 500):
    """All events for a single session."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DBEvent)
            .where(DBEvent.session_id == session_id)
            .order_by(DBEvent.timestamp)
            .limit(limit)
        )
        events = result.scalars().all()

    return [
        {
            "id": e.id,
            "timestamp": e.timestamp,
            "recorded_at": e.recorded_at.isoformat() if e.recorded_at else None,
            "total_persons": e.total_persons,
            "max_risk": e.max_risk,
            "incident_active": e.incident_active,
            "detections": e.detections,
        }
        for e in events
    ]


# ── WebSocket connection manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.viewers: list[WebSocket] = []

    async def connect_viewer(self, websocket: WebSocket):
        await websocket.accept()
        self.viewers.append(websocket)

    def disconnect_viewer(self, websocket: WebSocket):
        if websocket in self.viewers:
            self.viewers.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.viewers):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect_viewer(connection)

manager = ConnectionManager()


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket, role: str = "local"):
    if role == "viewer":
        await manager.connect_viewer(websocket)
        print("Viewer connected")
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect_viewer(websocket)
        except Exception as e:
            manager.disconnect_viewer(websocket)
            print(f"Error in viewer websocket: {e}")
    else:
        await websocket.accept()
        print(f"Streamer/Local connected (role: {role})")

        # ── Create a DB session row ─────────────────────────────────────────
        db_session_id: int | None = None
        session_peak_risk: float = 0.0
        session_incidents: int = 0
        last_incident_state: bool = False

        try:
            async with AsyncSessionLocal() as db:
                source = "remote" if role == "streamer" else "local"
                new_session = DBSession(source=source)
                db.add(new_session)
                await db.commit()
                await db.refresh(new_session)
                db_session_id = new_session.id
                print(f"DB session created: {db_session_id}")
        except Exception as e:
            print(f"DB session creation failed: {e}")

        # ── Initialize Tracker & Clear Buffers ──────────────────────────────
        tracker = PersonTracker(max_history=30, max_distance=800, max_missed=10)
        person_buffers.clear()

        try:
            while True:
                data = await websocket.receive_text()
                base64_image = data
                frame_start = time.time()

                detections = await asyncio.to_thread(run_yolo_detection, base64_image)
                tracked_objects = tracker.update(detections)

                alert_threshold = live_config["alert_threshold"]
                results = []
                for obj in tracked_objects:
                    person_id = obj["id"]
                    track_history = tracker.tracks[person_id]
                    risk_score = get_lstm_drowning_risk(track_history, person_id)
                    results.append({
                        "id": person_id,
                        "box": obj["box"],
                        "class": obj["class"],
                        "confidence": obj["confidence"],
                        "drowning_risk": risk_score,
                        "is_drowning": risk_score > (alert_threshold * 100)
                    })

                active_ids = {obj["id"] for obj in tracked_objects}
                for pid in list(person_buffers.keys()):
                    if pid not in active_ids:
                        cleanup_person(pid)

                max_risk = max((r["drowning_risk"] for r in results), default=0.0)
                incident_now = any(r["is_drowning"] for r in results)
                if incident_now and not last_incident_state:
                    session_incidents += 1
                last_incident_state = incident_now
                if max_risk > session_peak_risk:
                    session_peak_risk = max_risk

                latency_ms = round((time.time() - frame_start) * 1000, 1)

                response = {
                    "session_id": db_session_id,
                    "timestamp": time.time(),
                    "detections": results,
                    "total_persons": len(results),
                    "incident_active": incident_now,
                    "latency_ms": latency_ms,
                }

                # ── Persist event to DB ─────────────────────────────────────
                if db_session_id is not None:
                    try:
                        async with AsyncSessionLocal() as db:
                            event = DBEvent(
                                session_id=db_session_id,
                                timestamp=response["timestamp"],
                                total_persons=len(results),
                                max_risk=max_risk,
                                incident_active=incident_now,
                                detections=results,
                            )
                            db.add(event)
                            await db.commit()
                    except Exception as e:
                        print(f"DB event insert failed: {e}")

                if role == "streamer":
                    broadcast_payload = response.copy()
                    broadcast_payload["frame"] = base64_image
                    await manager.broadcast(broadcast_payload)

                await websocket.send_json(response)

        except WebSocketDisconnect:
            print(f"Streamer disconnected (role: {role})")
        except Exception as e:
            print(f"Error in streamer websocket: {e}")
            try:
                await websocket.close()
            except:
                pass
        finally:
            # ── Close the DB session row ────────────────────────────────────
            if db_session_id is not None:
                try:
                    from datetime import datetime, timezone
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(DBSession).where(DBSession.id == db_session_id)
                        )
                        sess = result.scalar_one_or_none()
                        if sess:
                            sess.ended_at = datetime.now(timezone.utc)
                            sess.peak_risk = session_peak_risk
                            sess.total_incidents = session_incidents
                            await db.commit()
                        print(f"DB session {db_session_id} closed.")
                except Exception as e:
                    print(f"DB session close failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_keyfile="../certs/key.pem",
        ssl_certfile="../certs/cert.pem"
    )
