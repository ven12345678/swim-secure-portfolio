from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from database import Base
from datetime import datetime
from typing import Optional

class Session(Base):
    """Represents one monitoring session (camera start → stop)."""
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="local")  # local | remote | upload
    peak_risk: Mapped[float] = mapped_column(Float, default=0.0)
    total_incidents: Mapped[int] = mapped_column(Integer, default=0)

    events: Mapped[list["Event"]] = relationship("Event", back_populates="session", cascade="all, delete-orphan")
    feedbacks: Mapped[list["Feedback"]] = relationship("Feedback", back_populates="session", cascade="all, delete-orphan")


class Event(Base):
    """A single frame's detection result within a session."""
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("sessions.id"), nullable=False)
    timestamp: Mapped[float] = mapped_column(Float, nullable=False)           # Unix timestamp
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    total_persons: Mapped[int] = mapped_column(Integer, default=0)
    max_risk: Mapped[float] = mapped_column(Float, default=0.0)
    incident_active: Mapped[bool] = mapped_column(Boolean, default=False)
    detections: Mapped[dict] = mapped_column(JSON, nullable=True)             # raw detections array

    session: Mapped["Session"] = relationship("Session", back_populates="events")


class Feedback(Base):
    """User feedback on a detected incident — confirmed drowning or false alarm."""
    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("sessions.id"), nullable=False)
    incident_id: Mapped[int] = mapped_column(Integer, nullable=False)         # local incident counter
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)          # 'confirmed' | 'false_alarm'
    max_risk_at_time: Mapped[float] = mapped_column(Float, default=0.0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    session: Mapped["Session"] = relationship("Session", back_populates="feedbacks")
