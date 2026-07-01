"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import VideoProcessor from '../components/VideoProcessor';
import AlertSystem from '../components/AlertSystem';
import LocationSelector from '../components/LocationSelector';
import { BackendResponse, DetectionBox, LocationData } from '../types';
import {
  Shield,
  Waves,
  Users,
  Play,
  Square,
  ChevronDown,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  Activity,
  Upload,
  Camera,
  FileVideo,
  X,
  Smartphone,
  History,
  CheckCircle2,
  XCircle,
  Gauge,
  SlidersHorizontal,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// ─── Incident type ────────────────────────────────────────────────────────────
interface Incident {
  id: number;
  time: string;
  maxRisk: number;
  personsDetected: number;
  duration: string; // "~Xs"
  feedback?: 'confirmed' | 'false_alarm'; // user verdict
}

// ─── Risk log entry ───────────────────────────────────────────────────────────
interface RiskEntry {
  time: string;
  risk: number;
  persons: number;
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const riskColor = (r: number) =>
  r >= 70 ? 'text-red-400' : r >= 40 ? 'text-orange-400' : 'text-green-400';

const riskColorLight = (r: number) =>
  r >= 70 ? 'text-red-600' : r >= 40 ? 'text-orange-600' : 'text-green-600';

const riskBg = (r: number) =>
  r >= 70 ? 'bg-red-500/20 border-red-500/40' : r >= 40 ? 'bg-orange-500/20 border-orange-500/40' : 'bg-green-500/20 border-green-500/40';

export default function Home() {
  // ── playback state ──────────────────────────────────────────────────────────
  const [isActive, setIsActive] = useState(false);
  const [videoSource, setVideoSource] = useState<'camera' | 'upload' | 'remote'>('camera');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── analytics state ─────────────────────────────────────────────────────────
  const [totalPersons, setTotalPersons] = useState(0);
  const [currentMaxRisk, setCurrentMaxRisk] = useState(0);
  const [isIncidentActive, setIsIncidentActive] = useState(false);
  const [incidentLog, setIncidentLog] = useState<Incident[]>([]);
  const [riskLog, setRiskLog] = useState<RiskEntry[]>([]);
  const incidentCounterRef = useRef(0);
  const incidentStartRef = useRef<number | null>(null);
  const peakIncidentRiskRef = useRef<number>(0);
  const peakPersonsRef = useRef<number>(0);
  const lastIncidentStateRef = useRef(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showRiskLog, setShowRiskLog] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [detections, setDetections] = useState<DetectionBox[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(50); // % (matches backend default 0.50)
  const [showThresholdSlider, setShowThresholdSlider] = useState(false);
  const currentSessionIdRef = useRef<number | null>(null);

  // ── location state ──────────────────────────────────────────────────────────
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [pendingVideoSource, setPendingVideoSource] = useState<'camera' | 'upload' | 'remote' | null>(null);
  const [poolLocation, setPoolLocation] = useState<LocationData | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const protocol = window.location.protocol; // 'https:' or 'http:'
    fetch(`${protocol}//localhost:8000/local-ip`)
      .then(r => r.json())
      .then(data => {
        setRemoteUrl(`${protocol}//${data.ip}:3000/camera`);
      })
      .catch(() => {
        setRemoteUrl(`${window.location.origin}/camera`);
      });
    // Fetch the current backend config and sync slider
    fetch(`${window.location.protocol}//localhost:8000/config`)
      .then(r => r.json())
      .then(cfg => {
        if (cfg.alert_threshold) setAlertThreshold(Math.round(cfg.alert_threshold * 100));
      })
      .catch(() => { });
  }, []);

  // ── data handler ────────────────────────────────────────────────────────────
  const handleDataReceived = useCallback((data: BackendResponse) => {
    setTotalPersons(data.total_persons);
    setDetections(data.detections);
    if (data.latency_ms !== undefined) setLatencyMs(data.latency_ms);

    if (data.session_id !== undefined) {
      currentSessionIdRef.current = data.session_id;
    }

    let maxRisk = 0;
    data.detections.forEach((d) => { if (d.drowning_risk > maxRisk) maxRisk = d.drowning_risk; });
    setCurrentMaxRisk(maxRisk);

    // Risk log (keep last 60 entries)
    setRiskLog((prev) => {
      const entry: RiskEntry = {
        time: new Date().toLocaleTimeString(),
        risk: Math.round(maxRisk),
        persons: data.total_persons,
      };
      return [entry, ...prev].slice(0, 60);
    });

    // Incident tracking
    const nowActive = data.incident_active;
    if (nowActive) {
      if (!lastIncidentStateRef.current) {
        incidentStartRef.current = Date.now();
        peakIncidentRiskRef.current = maxRisk;
        peakPersonsRef.current = data.total_persons;
        console.log("[Incident Start] Max Risk:", maxRisk);
      } else {
        peakIncidentRiskRef.current = Math.max(peakIncidentRiskRef.current, maxRisk);
        peakPersonsRef.current = Math.max(peakPersonsRef.current, data.total_persons);
        console.log("[Incident Active] Current Max Risk:", maxRisk, "Peak:", peakIncidentRiskRef.current);
      }
    }
    if (!nowActive && lastIncidentStateRef.current && incidentStartRef.current !== null) {
      const durSec = Math.round((Date.now() - incidentStartRef.current) / 1000);
      incidentCounterRef.current += 1;

      const loggedPeakRisk = Math.round(peakIncidentRiskRef.current);
      const loggedPeakPersons = peakPersonsRef.current;
      console.log("[Incident End] Logged Peak Risk:", loggedPeakRisk, "Persons:", loggedPeakPersons);

      setIncidentLog((prev) => [
        {
          id: incidentCounterRef.current,
          time: new Date().toLocaleTimeString(),
          maxRisk: loggedPeakRisk,
          personsDetected: loggedPeakPersons,
          duration: `~${durSec}s`,
        },
        ...prev,
      ]);
      incidentStartRef.current = null;
      peakIncidentRiskRef.current = 0;
      peakPersonsRef.current = 0;
    }
    lastIncidentStateRef.current = nowActive;
    setIsIncidentActive(nowActive);
  }, []);

  // ── file upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setUploadedFileName(file.name);
    setVideoSource('upload');
  };

  const clearUpload = () => {
    setUploadedVideoUrl(null);
    setUploadedFileName(null);
    setVideoSource('camera');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderRiskGraph = () => {
    if (!isMounted || riskLog.length === 0) return (
      <div className="p-6 bg-slate-50 border-b border-slate-100 h-48 flex items-center justify-center">
        <p className="text-slate-400 animate-pulse text-sm">Initializing graph...</p>
      </div>
    );

    // We want chronologically from left to right, so we reverse
    const data = [...riskLog].reverse();

    return (
      <div className="p-6 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            Live Risk Trend (Last 60s)
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] text-slate-400 font-bold uppercase">Safe</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-[10px] text-slate-400 font-bold uppercase">Caution</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] text-slate-400 font-bold uppercase">Danger</span>
            </div>
          </div>
        </div>

        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                minTickGap={30}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  padding: '8px 12px',
                  fontSize: '12px'
                }}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#64748b' }}
                itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                formatter={(value: any) => [`${value}%`, 'Risk Level']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="risk"
                stroke="#3b82f6"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorRisk)"
                animationDuration={1000}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.risk < 40) return null;
                  const color = payload.risk >= 70 ? '#ef4444' : '#f97316';
                  return (
                    <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={3} fill={color} stroke="white" strokeWidth={1.5} />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <section className="relative w-full h-screen overflow-hidden bg-black text-white">

        {/* Background Image when Idle */}
        {!isActive && (
          <div
            className="absolute inset-0 bg-cover bg-center z-10 opacity-100"
            style={{ backgroundImage: "url('/background.png')" }}
          />
        )}

        {/* Live feed */}
        {isActive && (
          <VideoProcessor
            onDataReceived={handleDataReceived}
            isActive={isActive}
            videoSource={videoSource}
            uploadedVideoUrl={uploadedVideoUrl ?? undefined}
          />
        )}

        {/* ── Top-left: branding ── */}
        <div className="absolute top-5 left-6 z-30 flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-[0_0_18px_rgba(0,0,0,0.6)]">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-base font-bold leading-tight tracking-tight text-black`}>SwimSecure</h1>
            <p className={`text-[12px] tracking-widest text-black`}>Real-Time Drowning Detection</p>
          </div>
        </div>

        {/* ── Top-right: latency + person count + history link ── */}
        <div className="absolute top-5 right-6 z-30 flex items-center gap-2">
          {isActive && latencyMs !== null && (
            <div className="flex items-center gap-1.5 bg-neutral-900/70 backdrop-blur-md border border-neutral-700/60 px-3 py-2 rounded-xl">
              <Gauge className="w-3.5 h-3.5 text-blue-400" />
              <span className={`text-xs font-bold font-mono ${latencyMs > 500 ? 'text-red-400' : latencyMs > 200 ? 'text-yellow-400' : 'text-green-400'
                }`}>Dashboard Latency: {latencyMs}ms</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-neutral-900/70 backdrop-blur-md border border-neutral-700/60 px-4 py-2 rounded-xl">
            <span className="text-xs text-neutral-300">Swimmers Detected: </span>
            <span className="text-sm font-bold text-white">{totalPersons}</span>
          </div>
          <Link
            href="/history"
            className="flex items-center gap-1.5 bg-neutral-900/70 backdrop-blur-md border border-neutral-700/60 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-200 hover:bg-[white] hover:text-black transition-all"
          >
            <History className="w-3.5 h-3.5" /> History
          </Link>
        </div>

        {/* ── Top-center: Stop + Threshold slider toggle ── */}
        {isActive && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
            <button
              id="stop-btn"
              onClick={() => {
                setIsActive(false);
                setTotalPersons(0);
                setCurrentMaxRisk(0);
                setIsIncidentActive(false);
                lastIncidentStateRef.current = false;
              }}
              className="flex items-center gap-2.5 px-7 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl border bg-red-600 border-red-500 text-white hover:bg-red-500 active:scale-95"
            >
              <Square className="w-4 h-4 fill-current" /> Stop
            </button>
            <button
              onClick={() => setShowThresholdSlider(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl border bg-neutral-900/70 border-neutral-700/60 text-neutral-200 hover:bg-white hover:text-black active:scale-95"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Threshold slider popover */}
        {isActive && showThresholdSlider && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 rounded-2xl px-6 py-4 w-72 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-300">Alert Threshold</p>
              <span className="text-sm font-bold font-mono text-white">{alertThreshold}%</span>
            </div>
            <input
              type="range" min={10} max={90} step={5}
              value={alertThreshold}
              onChange={(e) => {
                const val = Number(e.target.value);
                setAlertThreshold(val);
              }}
              onMouseUp={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                fetch(`${window.location.protocol}//localhost:8000/config`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ alert_threshold: val / 100 }),
                }).catch(() => { });
              }}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
              <span>Sensitive (10%)</span><span>Strict (90%)</span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-2 text-center">Drowning alert fires when risk exceeds this value</p>
          </div>
        )}

        {/* ── Idle overlay ── */}
        {!isActive && (
          <div className="absolute inset-0 z-25 flex items-center justify-center bg-slate-900/20 backdrop-blur-md">
            <div className="text-center space-y-5 flex flex-col items-center">
              <div className="flex gap-4">
                <button
                  id="start-btn"
                  onClick={() => { setPendingVideoSource('camera'); setShowLocationSelector(true); }}
                  className="flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-base transition-all duration-300 shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-[black] bg-[black] text-slate-200 hover:bg-white hover:border-white hover:text-black hover:scale-105 active:scale-95"
                >
                  <Play className="w-6 h-6 fill-current" /> Local Camera
                </button>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-base transition-all duration-300 shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-[black] bg-[black] text-slate-200 hover:bg-white hover:border-white hover:text-black hover:scale-105 active:scale-95"
                >
                  <Smartphone className="w-6 h-6" /> Remote Camera
                </button>
              </div>
              <div>
                <p className="text-neutral-900 text-lg font-medium">Select a camera source to begin live detection</p>
                <p className="text-neutral-700 text-md mt-1">For offline analysis of recorded videos, scroll down to the Video File Analysis section.</p>
              </div>

              {/* ── System Overview Strip ── */}
              <div className="w-full max-w-3xl px-4 mt-5">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em] mb-2 text-center">
                  System Overview
                </h3>

                <div className="bg-white/80  rounded-xl border border-slate-200/60  px-4 py-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-300/50">

                    <div className="flex items-center gap-3 py-2 md:py-1 md:pr-4">
                      <Camera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-slate-700 leading-tight">
                          Inputs
                        </p>
                        <p className="text-[13px] text-slate-500 leading-tight md:whitespace-nowrap">
                          Local · Remote · Upload
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-2 md:py-1 md:px-4">
                      <Activity className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-slate-700 leading-tight">
                          Model
                        </p>
                        <p className="text-[13px] text-slate-500 leading-tight md:whitespace-nowrap">
                          YOLOv11 + LSTM
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-2 md:py-1 md:pl-4">
                      <AlertTriangle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-slate-700 leading-tight">
                          Output
                        </p>
                        <p className="text-[13px] text-slate-500 leading-tight md:whitespace-nowrap">
                          Risk · Alert · History
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        {showQRModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="bg-white text-slate-900 p-8 rounded-3xl max-w-sm w-full flex flex-col items-center shadow-2xl relative">
              <button
                onClick={() => setShowQRModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <Smartphone className="w-10 h-10 text-blue-600 mb-4" />
              <h3 className="text-xl font-bold mb-2">Connect Remote Camera</h3>
              <p className="text-center text-sm text-slate-500 mb-6 leading-relaxed">
                Scan this QR code with your phone to use its camera as the live stream for this dashboard.
              </p>
              <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm mb-6">
                <QRCodeSVG value={remoteUrl} size={200} />
              </div>
              <button
                onClick={() => {
                  setShowQRModal(false);
                  setPendingVideoSource('remote');
                  setShowLocationSelector(true);
                }}
                className="w-full bg-black hover:bg-[#97c1e6] hover:text-black text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95"
              >
                Wait for Connection
              </button>
              <p className="text-xs text-slate-400 mt-4 font-mono">{remoteUrl}</p>
            </div>
          </div>
        )}

        {/* ── Bottom: Risk log panel ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30">
          {/* Toggle bar */}
          <div className="flex justify-center pb-2">
            <button
              onClick={() => setShowRiskLog((v) => !v)}
              className="flex items-center gap-1.5 bg-neutral-900/60 backdrop-blur-md border border-neutral-700/50 px-4 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white transition-colors"
            >
              {showRiskLog ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showRiskLog ? 'Hide Log' : 'Show Log'}
            </button>
          </div>

          {/* Scrollable log */}
          {showRiskLog && (
            <div className="bg-black/50 backdrop-blur-xl border-t border-neutral-800/60 px-6 py-3 max-h-40 overflow-y-auto">
              <p className="text-[12px] uppercase tracking-widest text-neutral-200 mb-2">Real-Time Risk Log</p>
              {riskLog.length === 0 && (
                <p className="text-neutral-300 text-xs">No data yet. Start analysis to see live risk readings.</p>
              )}
              <div className="space-y-1">
                {riskLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-neutral-300 w-20">{entry.time}</span>
                    <span className={`font-bold w-16 ${riskColor(entry.risk)}`}>{entry.risk}% risk</span>
                    <span className="text-neutral-400">{entry.persons} person{entry.persons !== 1 ? 's' : ''} detected</span>
                    {entry.risk >= 70 && <span className="text-red-400 font-bold animate-pulse">⚠ ALERT</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 text-neutral-600 flex flex-col items-center gap-1 animate-bounce pointer-events-none">
          <span className="text-xs">Scroll for details</span>
          <ChevronDown className="w-4 h-4" />
        </div>
      </section>

      {/* Alert overlay */}
      <AlertSystem
        isIncidentActive={isIncidentActive}
        isActive={isActive}
        poolLocation={poolLocation}
        affectedSwimmers={peakPersonsRef.current}
      />

      <LocationSelector
        isOpen={showLocationSelector}
        onSelect={(loc) => {
          setPoolLocation(loc);
          setShowLocationSelector(false);
          if (pendingVideoSource) {
            setVideoSource(pendingVideoSource);
            setIsActive(true);
            setPendingVideoSource(null);
          }
        }}
        onCancel={() => {
          setShowLocationSelector(false);
          setPendingVideoSource(null);
        }}
      />

      <section className="max-w-5xl mx-auto px-6 py-16 space-y-14">

        {/* ── Recent Risk Log Table & Graph ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Recent Risk Readings</h2>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {renderRiskGraph()}
            <div className="grid grid-cols-3 text-xs font-bold uppercase tracking-widest text-slate-500 px-6 py-3 border-b border-slate-100 bg-slate-50">
              <span>Time</span><span>Risk Level</span><span>Persons</span>
            </div>
            {riskLog.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No readings yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {riskLog.slice(0, 30).map((entry, i) => (
                  <div key={i} className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50 transition-colors">
                    <span className="text-slate-500 font-mono text-xs">{entry.time}</span>
                    <span className={`font-bold ${riskColorLight(entry.risk)}`}>{entry.risk}%</span>
                    <span className="text-slate-700 font-medium">{entry.persons}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Session Summary ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Session Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 ">
            {[
              { label: 'Incidents Detected', value: incidentLog.length, color: 'border-blue-200 bg-blue-50' },
              { label: 'Peak Risk', value: `${Math.round(currentMaxRisk)}%`, color: 'border-blue-200 bg-blue-50' },
              { label: 'Last Incident', value: incidentLog[0]?.time ?? '—', color: 'border-blue-200 bg-blue-50' },
            ].map((s, i) => (
              <div key={i} className={`p-5 rounded-2xl border ${s.color} flex flex-col gap-3`}>
                <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Incident History Timeline ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Incident History</h2>
          {incidentLog.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>No incidents detected this session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidentLog.map((inc) => (
                <div
                  key={inc.id}
                  className={`flex items-center gap-5 bg-white shadow-sm rounded-2xl px-6 py-4 border ${inc.feedback === 'confirmed' ? 'border-red-300 bg-red-50/30' :
                    inc.feedback === 'false_alarm' ? 'border-slate-300 bg-slate-50 opacity-60' :
                      'border-red-200'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${inc.feedback === 'false_alarm' ? 'bg-slate-100' : 'bg-red-100'
                    }`}>
                    <AlertTriangle className={`w-4 h-4 ${inc.feedback === 'false_alarm' ? 'text-slate-400' : 'text-red-500'
                      }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${inc.feedback === 'false_alarm' ? 'text-slate-400 line-through' : 'text-red-600'
                      }`}>Incident #{inc.id}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inc.personsDetected} person{inc.personsDetected !== 1 ? 's' : ''} · Duration {inc.duration} · Peak risk {inc.maxRisk}%
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <p className="text-xs font-medium text-slate-500">{inc.time}</p>
                    {inc.feedback ? (
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${inc.feedback === 'confirmed'
                        ? 'bg-red-100 text-red-600 border border-red-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                        {inc.feedback === 'confirmed' ? '✓ CONFIRMED' : '✗ FALSE ALARM'}
                      </span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setIncidentLog(prev => prev.map(i => i.id === inc.id ? { ...i, feedback: 'confirmed' } : i));
                            fetch(`${window.location.protocol}//localhost:8000/feedback`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                session_id: currentSessionIdRef.current ?? 0,
                                incident_id: inc.id,
                                verdict: 'confirmed',
                                max_risk_at_time: inc.maxRisk,
                              }),
                            }).catch(() => { });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Confirm
                        </button>
                        <button
                          onClick={() => {
                            setIncidentLog(prev => prev.map(i => i.id === inc.id ? { ...i, feedback: 'false_alarm' } : i));
                            fetch(`${window.location.protocol}//localhost:8000/feedback`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                session_id: currentSessionIdRef.current ?? 0,
                                incident_id: inc.id,
                                verdict: 'false_alarm',
                                max_risk_at_time: inc.maxRisk,
                              }),
                            }).catch(() => { });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          <XCircle className="w-3 h-3" /> False Alarm
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Video Upload Analysis ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Video File Analysis</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Upload a pre-recorded pool video to run drowning detection analysis on it. The system will process the video frame-by-frame and display results below.
            </p>

            {/* Upload area */}
            {!uploadedVideoUrl ? (
              <label
                htmlFor="video-upload"
                className="block border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 rounded-2xl p-10 text-center cursor-pointer transition-colors group"
              >
                <Upload className="w-10 h-10 text-slate-400 group-hover:text-blue-500 mx-auto mb-3 transition-colors" />
                <p className="text-slate-600 font-medium text-sm transition-colors">
                  Drop a video file here or <span className="text-blue-600 underline">click to browse</span>
                </p>
                <p className="text-slate-400 text-xs mt-1">MP4, MOV, AVI · Max recommended 200 MB</p>
                <input
                  id="video-upload"
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-4">
                {/* File badge */}
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <FileVideo className="w-5 h-5 text-blue-500 shrink-0" />
                  <p className="text-sm font-medium text-blue-900 truncate flex-1">{uploadedFileName}</p>
                  <button onClick={clearUpload} className="text-slate-400 hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Mini video player */}
                <video
                  src={uploadedVideoUrl}
                  controls
                  className="w-full rounded-xl max-h-64 bg-black"
                />

                {/* Activate analysis button */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setPendingVideoSource('upload'); setShowLocationSelector(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md"
                  >
                    <Camera className="w-4 h-4" /> Analyze in Full Screen
                  </button>
                  <button
                    onClick={clearUpload}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
                  >
                    <X className="w-4 h-4" /> Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </section>
    </div>
  );
}
