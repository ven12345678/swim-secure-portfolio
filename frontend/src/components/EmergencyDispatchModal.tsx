"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { AlertTriangle, MapPin, Camera as CameraIcon, ShieldAlert, CheckCircle2, Clock, X, PhoneCall, Minimize2, Maximize2, GripHorizontal } from "lucide-react";
import { LocationData } from "../types";

interface Message {
  id: number;
  sender: "system" | "dispatch";
  text: string | React.ReactNode;
  delayMs: number;
}

interface EmergencyDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolLocation?: LocationData | null;
  affectedSwimmers?: number;
}

export default function EmergencyDispatchModal({ isOpen, onClose, poolLocation, affectedSwimmers = 1 }: EmergencyDispatchModalProps) {
  const sequenceRef = useRef<Message[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasSpoken = useRef(false);

  // Drag and minimize state
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const sequence = useMemo(() => {
    const currentTime = new Date().toLocaleTimeString();
    const currentDate = new Date().toLocaleDateString();

    const address = poolLocation?.address || "Unknown Location";
    const lat = poolLocation?.lat.toFixed(6) || "0.000000";
    const lng = poolLocation?.lng.toFixed(6) || "0.000000";
    const swimmers = affectedSwimmers || 1;

    return [
      { id: 1, sender: "system", text: "Initiating automated SOS protocol...", delayMs: 1000 },
      {
        id: 2,
        sender: "system",
        text: (
          <div className="flex flex-col gap-3 font-mono text-xs">
            <p className="text-red-400 font-bold uppercase tracking-wider">Automated Dispatch Report</p>
            <p className="text-blue-100">Drowning emergency reported by pool operator at {address}. Emergency assistance is required at the pool area.</p>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/50 text-blue-200">
              <p className="text-slate-400 mb-1">=== INCIDENT DETAILS ===</p>
              <p><span className="text-slate-400">Time:</span> {currentTime}, {currentDate}</p>
              <p><span className="text-slate-400">Location:</span> Swimming Pool, {address}</p>
              <p><span className="text-slate-400">Coordinates:</span> {lat}, {lng}</p>
              <p><span className="text-slate-400">Affected swimmers:</span> {swimmers}</p>
              <p><span className="text-slate-400">Condition:</span> Swimmer unresponsive</p>
            </div>

            <p className="text-blue-100">Please send medical emergency assistance to the pool area. Site security will meet responders at main lobby and guide them to the exact location.</p>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700/50 text-blue-200">
              <p className="text-slate-400 mb-1">=== ON-SITE CONTACT ===</p>
              <p>Security Control Room</p>
              <p>+60 376526600</p>
            </div>
          </div>
        ),
        delayMs: 2000,
      },
      { id: 3, sender: "dispatch", text: "999 Emergency Dispatch. Incident report received and logged.", delayMs: 3000 },
      { id: 4, sender: "dispatch", text: `First responders dispatched to ${address}. ETA 4 Minutes.`, delayMs: 2000 },
      { id: 5, sender: "dispatch", text: "Please keep the line open. Paramedics are en route.", delayMs: 2000 },
    ] as Message[];
  }, [poolLocation, affectedSwimmers]);

  useEffect(() => {
    if (!isOpen) {
      // Clean up when modal closes
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      hasSpoken.current = false;
      setCallStatus("connecting");
      return;
    }

    // Snapshot the sequence at open-time (reads the current useMemo value once)
    sequenceRef.current = sequence;

    setMessages([]);
    setCallStatus("connecting");
    hasSpoken.current = false;
    const timeoutIds: NodeJS.Timeout[] = [];
    let cumulativeDelay = 0;

    // Cancel any queued speech before starting a fresh utterance
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    // AI Voice Synthesis – fires once, 800 ms after opening
    const speechTimeoutId = setTimeout(() => {
      if (!hasSpoken.current) {
        hasSpoken.current = true;
        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(
            "9 9 9 emergency we have received a drowning incident. Emergency services are being dispatched immediately. Please stay clear of the area."
          );
          utterance.voice =
            window.speechSynthesis.getVoices().find(
              (v) => v.name.includes("Female") || v.lang.includes("en-US")
            ) || null;
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
        setCallStatus("connected");
      }
    }, 800);
    timeoutIds.push(speechTimeoutId);

    // Process chat sequence using the snapshot captured above
    sequenceRef.current.forEach((msg) => {
      cumulativeDelay += msg.delayMs;

      // Show typing indicator before each message
      const typingTimeout = setTimeout(() => {
        setIsTyping(true);
      }, cumulativeDelay - 800);
      timeoutIds.push(typingTimeout);

      // Append message
      const msgTimeout = setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, msg]);
      }, cumulativeDelay);
      timeoutIds.push(msgTimeout);
    });

    return () => {
      timeoutIds.forEach(clearTimeout);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [isOpen]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (!isMinimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isMinimized]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        className="fixed z-[100] bottom-6 right-6 bg-slate-900 border border-slate-700 text-white p-3 rounded-full shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors animate-in slide-in-from-bottom-4"
        onClick={() => setIsMinimized(false)}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${callStatus === 'connected' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
          <PhoneCall className="w-4 h-4" />
        </div>
        <span className="text-sm font-bold tracking-widest uppercase pr-2">Dispatch Active</span>
        <Maximize2 className="w-4 h-4 text-slate-400" />
      </div>
    );
  }

  return (
    <div
      className="fixed z-[100] flex flex-col bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden w-full max-w-lg h-[600px]"
      style={{
        left: position.x,
        top: position.y,
        touchAction: 'none' // Prevent default touch actions while dragging
      }}
    >
      {/* Background pulsing glow inside modal */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[100px] animate-pulse" />
      </div>

      {/* Header (Draggable) */}
      <div
        className="relative z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between cursor-move"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-3 pointer-events-none">
          <GripHorizontal className="w-5 h-5 text-slate-600" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${callStatus === 'connected' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
            <PhoneCall className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-widest uppercase text-xs flex items-center gap-2">
              Emergency Dispatch <ShieldAlert className="w-3 h-3 text-red-500" />
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${callStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-[10px] text-slate-400 font-mono">
                {callStatus === "connecting" ? "Connecting..." : "Live Line Active"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-center pb-3 border-b border-slate-800/50 mb-3">
          <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
            Encrypted Channel Opened · {new Date().toLocaleTimeString()}
          </span>
        </div>

        {messages.map((msg) => (
          <div key={msg.id} className={`flex w-full ${msg.sender === "system" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 ${msg.sender === "system"
              ? "bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-tr-sm"
              : "bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm"
              }`}>
              <div className="flex items-center gap-2 mb-1.5 opacity-70">
                {msg.sender === "system" ? (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400">SwimSecure System</span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-1">
                    <ShieldAlert className="w-2.5 h-2.5" />999 Dispatch
                  </span>
                )}
                <span className="text-[9px] ml-auto"><Clock className="w-2.5 h-2.5 inline mr-1" />{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="text-sm font-medium leading-relaxed">
                {msg.text}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 rounded-tl-sm w-16 flex justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-slate-900 border-t border-slate-800 p-3">
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>End-to-end encrypted dispatch line</span>
          <button
            onClick={() => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
              onClose();
            }}
            className="text-red-400 hover:text-red-300 font-bold uppercase tracking-widest hover:underline"
          >
            End Call
          </button>
        </div>
      </div>
    </div>
  );
}
