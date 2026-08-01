"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Waves, ArrowLeft, Activity, Users, AlertTriangle, Clock, ChevronRight, RefreshCw } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────────────────
interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  source: string;
  peak_risk: number;
  total_incidents: number;
}

interface EventRow {
  id: number;
  timestamp: number;
  recorded_at: string;
  total_persons: number;
  max_risk: number;
  incident_active: boolean;
}

interface FeedbackRow {
  id: number;
  session_id: number;
  incident_id: number;
  verdict: string;
  max_risk_at_time: number;
  submitted_at: string;
  notes: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const riskLabel = (r: number) =>
  r >= 70 ? "High" : r >= 40 ? "Medium" : "Low";

const riskColor = (r: number) =>
  r >= 70 ? "#ef4444" : r >= 40 ? "#f97316" : "#22c55e";

const riskBadge = (r: number) => {
  const base = "text-xs font-bold px-2 py-0.5 rounded-full";
  if (r >= 70) return `${base} bg-red-100 text-red-700`;
  if (r >= 40) return `${base} bg-orange-100 text-orange-700`;
  return `${base} bg-green-100 text-green-700`;
};

const formatDuration = (start: string, end: string | null) => {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "https://localhost:8000";

// ── Component ────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // New states for filtering
  const [filter, setFilter] = useState<'all' | 'high_risk' | 'confirmed' | 'false_alarm'>('all');
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackRow[]>([]);

  useEffect(() => setIsMounted(true), []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/history/sessions?limit=50`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async (sessionId: number) => {
    setEventsLoading(true);
    setEvents([]);
    try {
      const res = await fetch(
        `${API_BASE}/history/sessions/${sessionId}/events?limit=500`
      );
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchFeedbacks = useCallback(async (sessionId: number) => {
    setFeedbacksLoading(true);
    setFeedbacks([]);
    try {
      const res = await fetch(`${API_BASE}/feedback?session_id=${sessionId}`);
      const data = await res.json();
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch {
      setFeedbacks([]);
    } finally {
      setFeedbacksLoading(false);
    }
  }, []);

  const fetchAllFeedbacks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/feedback`);
      const data = await res.json();
      setAllFeedbacks(Array.isArray(data) ? data : []);
    } catch {
      setAllFeedbacks([]);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchAllFeedbacks();
  }, [fetchSessions, fetchAllFeedbacks]);

  // Derived state for filtering sessions
  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'high_risk') return s.peak_risk >= 70 || s.total_incidents > 0;
    
    const sessionFeedbacks = allFeedbacks.filter(fb => fb.session_id === s.id);
    if (filter === 'confirmed') return sessionFeedbacks.some(fb => fb.verdict === 'confirmed');
    if (filter === 'false_alarm') return sessionFeedbacks.some(fb => fb.verdict === 'false_alarm');
    
    return true;
  });

  const handleSelectSession = (s: SessionRow) => {
    setSelectedSession(s);
    fetchEvents(s.id);
    fetchFeedbacks(s.id);
  };

  // Build chart data
  const chartData = events.map((e) => ({
    time: new Date(e.timestamp * 1000).toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    risk: Math.round(e.max_risk),
    persons: e.total_persons,
  }));

  // Summary stats across all sessions
  const totalIncidents = sessions.reduce((s, x) => s + x.total_incidents, 0);
  const avgPeak =
    sessions.length > 0
      ? Math.round(sessions.reduce((s, x) => s + x.peak_risk, 0) / sessions.length)
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-500 hover:text-[#6f8faf] transition-colors text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
            <span className="text-slate-200">|</span>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Waves className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-900 leading-none">
                  SwimSecure
                </p>
                <p className="text-[10px] tracking-widest text-slate-500 uppercase">
                  Session and Incident History
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={fetchSessions}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#6f8faf] hover:text-[#4a6f8f] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Sessions", value: total, color: "text-black-500" },
            { label: "Total Incidents", value: totalIncidents, color: "text-black-500" },
            { label: "Avg Peak Risk", value: `${avgPeak}%`, color: "text-black-500" },
            { label: "Events Loaded", value: events.length, color: "text-black-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 justify-center text-center">
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-xl font-extrabold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-sm font-bold text-slate-700 mr-1">Filter:</span>
          {['all', 'high_risk', 'confirmed', 'false_alarm'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as 'all' | 'high_risk' | 'confirmed' | 'false_alarm')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f 
                  ? 'bg-slate-800 text-white shadow-sm' 
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 shadow-sm'
              }`}
            >
              {f === 'all' && 'All'}
              {f === 'high_risk' && 'High Risk'}
              {f === 'confirmed' && 'Confirmed'}
              {f === 'false_alarm' && 'False Alarm'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Session List ── */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Sessions</h2>
              <span className="text-xs text-slate-400">{filteredSessions.length} matching</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                Loading…
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                <Clock className="w-8 h-8 opacity-40" />
                <p className="text-sm font-medium">No records found for this filter.</p>
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="text-xs text-[#6f8faf] hover:underline mt-1 font-semibold">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
                {filteredSessions.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => handleSelectSession(s)}
                      className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 ${selectedSession?.id === s.id ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-700">
                            #{s.id}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                            {s.source}
                          </span>
                          <span className={riskBadge(s.peak_risk)}>
                            {riskLabel(s.peak_risk)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {formatDate(s.started_at)}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatDuration(s.started_at, s.ended_at)}
                          </span>
                          {s.total_incidents > 0 && (
                            <span className="text-xs text-red-500 font-semibold">
                              {s.total_incidents} incident{s.total_incidents !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <p className="text-sm font-bold" style={{ color: riskColor(s.peak_risk) }}>
                          {Math.round(s.peak_risk)}%
                        </p>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Session Detail Panel ── */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {!selectedSession ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3 text-slate-400">
                <Activity className="w-12 h-12 opacity-30" />
                <p className="text-sm font-semibold">Select a session to view details</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        Session #{selectedSession.id}
                        <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                          {selectedSession.source}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDate(selectedSession.started_at)} ·{" "}
                        {formatDuration(selectedSession.started_at, selectedSession.ended_at)}
                      </p>
                    </div>
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Peak Risk</p>
                        <p className="text-lg font-extrabold" style={{ color: riskColor(selectedSession.peak_risk) }}>
                          {Math.round(selectedSession.peak_risk)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Incidents</p>
                        <p className="text-lg font-extrabold text-red-500">
                          {selectedSession.total_incidents}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div className="flex-1 px-6 py-4">
                  <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-widest">
                    Risk Over Time
                  </p>
                  {eventsLoading ? (
                    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                      Loading events…
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                      No event data for this session
                    </div>
                  ) : isMounted ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6f8faf" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6f8faf" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="time"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          minTickGap={40}
                        />
                        <YAxis
                          domain={[0, 100]}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "10px",
                            border: "none",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                            fontSize: "12px",
                          }}
                          formatter={(v: any) => [`${v}%`, "Risk"]}
                          labelFormatter={(l) => `Time: ${l}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="risk"
                          stroke="#6f8faf"
                          strokeWidth={2.5}
                          fill="url(#riskGrad)"
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (payload.risk < 40) return null;
                            const c = payload.risk >= 70 ? "#ef4444" : "#f97316";
                            return (
                              <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={3} fill={c} stroke="white" strokeWidth={1.5} />
                            );
                          }}
                          activeDot={{ r: 5, strokeWidth: 0, fill: "#6f8faf" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>

                {/* Event table */}
                {!eventsLoading && events.length > 0 && (
                  <div className="px-6 pb-4">
                    <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-widest">
                      Recent Events
                    </p>
                    <div className="overflow-auto max-h-48 rounded-xl border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Time</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Persons</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Max Risk</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Incident</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {events.slice(-50).reverse().map((e) => (
                            <tr key={e.id} className={e.incident_active ? "bg-red-50" : ""}>
                              <td className="px-3 py-1.5 text-slate-500">
                                {new Date(e.timestamp * 1000).toLocaleTimeString()}
                              </td>
                              <td className="px-3 py-1.5 font-semibold">{e.total_persons}</td>
                              <td className="px-3 py-1.5 font-bold" style={{ color: riskColor(e.max_risk) }}>
                                {Math.round(e.max_risk)}%
                              </td>
                              <td className="px-3 py-1.5">
                                {e.incident_active ? (
                                  <span className="text-red-600 font-bold">⚠ Yes</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Feedbacks list */}
                {!feedbacksLoading && feedbacks.length > 0 && (
                  <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                    <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-widest">
                      Audited Incidents (False Alarm / Confirmed Log)
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {feedbacks.map((fb) => (
                        <div
                          key={fb.id}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs ${fb.verdict === "confirmed"
                              ? "bg-red-50/50 border-red-200"
                              : "bg-slate-50 border-slate-200 opacity-80"
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${fb.verdict === "confirmed" ? "text-red-600" : "text-slate-500"}`}>
                              Incident #{fb.incident_id}
                            </span>
                            <span className="text-slate-400 font-mono">
                              ({new Date(fb.submitted_at).toLocaleTimeString()})
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">Risk: {Math.round(fb.max_risk_at_time)}%</span>
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${fb.verdict === "confirmed"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                            >
                              {fb.verdict === "confirmed" ? "Confirmed" : "False Alarm"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
