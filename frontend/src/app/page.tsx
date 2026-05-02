"use client";

import React, { useState, useCallback, useRef } from 'react';
import VideoProcessor from '../components/VideoProcessor';
import AlertSystem from '../components/AlertSystem';
import { BackendResponse, DetectionBox } from '../types';
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
} from 'lucide-react';

// ─── Incident type ────────────────────────────────────────────────────────────
interface Incident {
  id: number;
  time: string;
  maxRisk: number;
  personsDetected: number;
  duration: string; // "~Xs"
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
  const [videoSource, setVideoSource] = useState<'camera' | 'upload'>('camera');
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
  const lastIncidentStateRef = useRef(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showRiskLog, setShowRiskLog] = useState(true);
  const [detections, setDetections] = useState<DetectionBox[]>([]);

  // ── data handler ────────────────────────────────────────────────────────────
  const handleDataReceived = useCallback((data: BackendResponse) => {
    setTotalPersons(data.total_persons);
    setDetections(data.detections);

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
    if (nowActive && !lastIncidentStateRef.current) {
      incidentStartRef.current = Date.now();
    }
    if (!nowActive && lastIncidentStateRef.current && incidentStartRef.current !== null) {
      const durSec = Math.round((Date.now() - incidentStartRef.current) / 1000);
      incidentCounterRef.current += 1;
      setIncidentLog((prev) => [
        {
          id: incidentCounterRef.current,
          time: new Date().toLocaleTimeString(),
          maxRisk: Math.round(maxRisk),
          personsDetected: data.total_persons,
          duration: `~${durSec}s`,
        },
        ...prev,
      ]);
      incidentStartRef.current = null;
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <section className="relative w-full h-screen overflow-hidden bg-black text-white">

        {/* Live feed */}
        <VideoProcessor
          onDataReceived={handleDataReceived}
          isActive={isActive}
          videoSource={videoSource}
          uploadedVideoUrl={uploadedVideoUrl ?? undefined}
        />

        {/* ── Top-left: branding ── */}
        <div className="absolute top-5 left-6 z-30 flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-[0_0_18px_rgba(0,0,0,0.6)]">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-base font-bold leading-tight tracking-tight ${isActive ? 'text-black' : 'text-white'}`}>SwimSecure</h1>
            <p className={`text-[12px] tracking-widest ${isActive ? 'text-neutral-700' : 'text-neutral-300'}`}>Real Time Drowning Detection</p>
          </div>
        </div>

        {/* ── Top-right: person count ── */}
        <div className="absolute top-5 right-6 z-30 flex items-center gap-2 bg-neutral-900/70 backdrop-blur-md border border-neutral-700/60 px-4 py-2 rounded-full">
          <span className="text-xs text-neutral-300">Person in pool: </span>
          <span className="text-sm font-bold text-white">{totalPersons}</span>
        </div>

        {/* ── Top-center: Stop button (only shown when active) ── */}
        {isActive && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30">
            <button
              id="stop-btn"
              onClick={() => setIsActive(false)}
              className="flex items-center gap-2.5 px-7 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl border bg-red-600 border-red-500 text-white hover:bg-red-500 active:scale-95"
            >
              <Square className="w-4 h-4 fill-current" /> Stop
            </button>
          </div>
        )}

        {/* ── Idle overlay ── */}
        {!isActive && (
          <div className="absolute inset-0 z-25 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-center space-y-5 flex flex-col items-center">
              <button
                id="start-btn"
                onClick={() => setIsActive(true)}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-base transition-all shadow-[0_0_30px_rgba(0,0,0,0.5)] border bg-green-600 border-green-500 text-white hover:bg-green-500 hover:scale-105 active:scale-95"
              >
                <Play className="w-6 h-6 fill-current" /> Start
              </button>
              <div>
                <p className="text-neutral-300 text-lg font-medium">Press Start to begin live detection</p>
                <p className="text-neutral-400 text-md mt-1">Camera will activate automatically</p>
              </div>
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
      <AlertSystem isIncidentActive={isIncidentActive} />

      <section className="max-w-5xl mx-auto px-6 py-16 space-y-14">

        {/* ── Session Summary ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Session Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Incidents Detected', value: incidentLog.length, color: 'border-blue-200 bg-blue-50' },
              { label: 'Current Persons', value: totalPersons, color: 'border-blue-200 bg-blue-50' },
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
                  className="flex items-center gap-5 bg-white border border-red-200 shadow-sm rounded-2xl px-6 py-4"
                >
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-red-600">Incident #{inc.id}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inc.personsDetected} person{inc.personsDetected !== 1 ? 's' : ''} · Duration {inc.duration} · Peak risk {inc.maxRisk}%
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-500">{inc.time}</p>
                    <span className="mt-1 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
                      HIGH RISK
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Risk Log Table ── */}
        <div>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">Recent Risk Readings</h2>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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
                    onClick={() => { setVideoSource('upload'); setIsActive(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
