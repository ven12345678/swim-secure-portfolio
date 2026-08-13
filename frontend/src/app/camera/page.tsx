"use client";

import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera, Radio, Shield, Waves } from 'lucide-react';

export default function CameraStreamer() {
  const webcamRef = useRef<Webcam>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    const connect = () => {
      // Build dynamic WebSocket URL based on host
      const wsUrl =
        'wss://swim-secure-backend.onrender.com/ws/stream?role=streamer';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsStreaming(false);
        setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !isStreaming) return;

    const sendFrame = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      if (webcamRef.current) {
        const base64Image = webcamRef.current.getScreenshot();
        if (base64Image) {
          wsRef.current.send(base64Image);
        }
      }
    };

    const intervalId = setInterval(sendFrame, 300);
    return () => clearInterval(intervalId);
  }, [isConnected, isStreaming]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between z-10 bg-black/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Waves className="w-6 h-6 text-blue-500" />
          <span className="font-bold tracking-widest text-sm">SWIMSECURE</span>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-500'}`} />
          {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6 gap-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 p-4 rounded-xl text-center text-sm">
            {error}
          </div>
        )}

        <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden border-4 border-neutral-800 shadow-2xl bg-neutral-900">
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            className="absolute inset-0 w-full h-full object-cover"
            videoConstraints={{ facingMode: 'environment' }}
            onUserMediaError={(err) => setError("Camera access denied or unavailable. " + (typeof err === 'string' ? err : (err.message || '')))}
          />

          {/* Overlay Status */}
          {isStreaming && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-full shadow-lg">
              <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold tracking-widest uppercase">LIVE</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsStreaming(!isStreaming)}
          disabled={!isConnected}
          className={`w-full max-w-sm py-4 rounded-2xl font-bold text-lg tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 ${!isConnected
              ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              : isStreaming
                ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.4)]'
                : 'bg-blue-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]'
            }`}
        >
          {isStreaming ? (
            <>Stop Streaming</>
          ) : (
            <><Radio className="w-5 h-5" /> Start Broadcast</>
          )}
        </button>

        <p className="text-neutral-500 text-xs text-center max-w-xs mt-4 leading-relaxed">
          Keep this screen open. The camera feed is securely transmitted to the main dashboard for drowning detection analysis.
        </p>
      </div>
    </div>
  );
}
