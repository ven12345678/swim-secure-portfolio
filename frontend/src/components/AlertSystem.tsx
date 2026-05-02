"use client";

import React, { useEffect, useRef, useState } from 'react';
import { PhoneCall, AlertOctagon, X } from 'lucide-react';

interface AlertSystemProps {
  isIncidentActive: boolean;
}

export default function AlertSystem({ isIncidentActive }: AlertSystemProps) {
  const [sirenActive, setSirenActive] = useState(false);
  const [showEmergencyBtn, setShowEmergencyBtn] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sirenLoopRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const playSiren = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.5);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 1.0);
      gain.gain.value = 0.08;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      audioCtxRef.current = ctx;
      oscRef.current = osc;

      // Loop siren
      sirenLoopRef.current = setTimeout(() => { try { osc.stop(); } catch {} playSiren(); }, 1000);
    } catch { /* ignore */ }
  };

  const stopSiren = () => {
    if (sirenLoopRef.current) {
      clearTimeout(sirenLoopRef.current);
      sirenLoopRef.current = null;
    }
    try { oscRef.current?.stop(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
  };

  useEffect(() => {
    if (sirenActive) return; // If already ringing, stay ringing until user dismisses

    if (isIncidentActive && !dismissed) {
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          setSirenActive(true);
          setShowEmergencyBtn(true);
          playSiren();
        }, 3000);
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIncidentActive, dismissed, sirenActive]);

  const handleStopAlert = () => {
    setSirenActive(false);
    stopSiren();
  };

  const handleDismiss = () => {
    setDismissed(true);
    setSirenActive(false);
    setShowEmergencyBtn(false);
    stopSiren();
    
    // Allow new alarms to trigger after a 15-second cooldown
    setTimeout(() => {
      setDismissed(false);
    }, 15000);
  };

  const handleCallEmergency = () => {
    alert('🚨 Initiating emergency services contact... (Simulated)');
  };

  if (!sirenActive && !showEmergencyBtn) return null;

  return (
    <div className="fixed inset-x-0 bottom-32 z-50 flex flex-col items-center gap-3 pointer-events-none">
        <div className="pointer-events-auto relative flex items-center gap-4 bg-red-600/90 backdrop-blur-xl border border-red-400/60 shadow-[0_0_60px_rgba(220,38,38,0.6)] px-8 py-4 rounded-2xl animate-pulse">
          <AlertOctagon className="w-7 h-7 text-white" />
          <span className="text-white font-bold tracking-widest uppercase text-lg">⚠ Drowning Detected</span>
        </div>

      {showEmergencyBtn && (
        <div className="pointer-events-auto flex items-center gap-4 mt-2">
          {/* Call Emergency Group */}
          <div className="flex bg-white rounded-full shadow-2xl border border-red-200 overflow-hidden hover:scale-105 transition-transform">
            <button
              onClick={handleCallEmergency}
              className="hover:bg-red-50 text-red-600 font-bold px-8 py-4 flex items-center gap-3 transition-colors active:bg-red-100"
            >
              <PhoneCall className="w-5 h-5" />
              CALL EMERGENCY SERVICES
            </button>
            <div className="w-px bg-red-100 my-2" />
            <button
              onClick={handleDismiss}
              className="hover:bg-red-50 text-red-400 hover:text-red-600 px-5 py-4 flex items-center transition-colors"
              title="Dismiss Emergency"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {sirenActive && (
            <button
              onClick={handleStopAlert}
              className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-8 py-4 rounded-full shadow-2xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95 border border-neutral-600"
            >
              <X className="w-5 h-5" />
              STOP ALERT
            </button>
          )}
        </div>
      )}
    </div>
  );
}
