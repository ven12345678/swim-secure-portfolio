"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { DetectionBox, BackendResponse } from '../types';

interface VideoProcessorProps {
  onDataReceived: (data: BackendResponse) => void;
  isActive: boolean;
  videoSource: 'camera' | 'upload' | 'remote';
  uploadedVideoUrl?: string;
}

export default function VideoProcessor({ onDataReceived, isActive, videoSource, uploadedVideoUrl }: VideoProcessorProps) {
  const webcamRef = useRef<Webcam>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);

  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Initialize WebSocket
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const role = videoSource === 'remote' ? 'viewer' : 'local';
      const ws = new WebSocket(
        `wss://swim-secure-backend.onrender.com/ws/stream?role=${role}`
      );

      ws.onopen = () => {
        if (!isMounted) { ws.close(); return; }
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isActiveRef.current || !isMounted) return;
        const data = JSON.parse(event.data);
        onDataReceived(data);
        drawBoxes(data.detections);
        if (data.frame) {
          setRemoteFrame(data.frame);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return; // Prevent reconnect loop if component unmounted
        setIsConnected(false);
        // Try to reconnect after 2s
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSource]); // Re-connect if source changes to/from remote

  // Frame processing loop
  useEffect(() => {
    if (!isActive || !isConnected || videoSource === 'remote') return;

    const sendFrame = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      let base64Image: string | null = null;

      if (videoSource === 'camera' && webcamRef.current) {
        base64Image = webcamRef.current.getScreenshot();
      } else if (videoSource === 'upload' && videoRef.current) {
        const video = videoRef.current;
        if (video.videoWidth === 0 || video.paused || video.ended) return;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = video.videoWidth;
        tmpCanvas.height = video.videoHeight;
        const ctx = tmpCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          base64Image = tmpCanvas.toDataURL('image/jpeg', 0.8);
        }
      }

      if (base64Image) {
        wsRef.current!.send(base64Image);
      }
    };

    const intervalId = setInterval(sendFrame, 300);
    return () => clearInterval(intervalId);
  }, [isActive, isConnected, videoSource]);

  // Sync canvas size to video when upload video loads
  useEffect(() => {
    if (videoSource === 'upload' && uploadedVideoUrl && videoRef.current) {
      videoRef.current.load();
    }
  }, [uploadedVideoUrl, videoSource]);

  const drawBoxes = useCallback((detections: DetectionBox[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det) => {
      const [cx, cy, w, h] = det.box;
      if (!cx || !cy || !w || !h) return;

      const x = cx - w / 2;
      const y = cy - h / 2;

      const color = det.is_drowning ? '#ef4444' : '#22c55e';
      const glow = det.is_drowning ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)';

      // Glow effect
      ctx.shadowColor = glow;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;

      // Label pill
      const label = `Person ${det.id}  ${det.drowning_risk}%`;
      ctx.font = 'bold 13px Inter, sans-serif';
      const textW = ctx.measureText(label).width + 16;

      ctx.fillStyle = det.is_drowning ? 'rgba(239,68,68,0.85)' : 'rgba(34,197,94,0.85)';
      const pillY = y > 24 ? y - 26 : y + 4;
      ctx.beginPath();
      ctx.roundRect(x, pillY, textW, 22, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 8, pillY + 15);
    });
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Camera feed */}
      {videoSource === 'camera' && (
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          videoConstraints={{ facingMode: 'user' }}
          onUserMediaError={() => console.warn('Camera access denied')}
        />
      )}

      {/* Remote Camera Frame */}
      {videoSource === 'remote' && remoteFrame && (
        <img
          src={remoteFrame}
          alt="Remote Stream"
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            if (canvasRef.current && (canvasRef.current.width !== img.naturalWidth)) {
              canvasRef.current.width = img.naturalWidth;
              canvasRef.current.height = img.naturalHeight;
            }
          }}
        />
      )}

      {/* Uploaded video */}
      {videoSource === 'upload' && uploadedVideoUrl && (
        <video
          ref={videoRef}
          src={uploadedVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onLoadedMetadata={(e) => {
            const v = e.target as HTMLVideoElement;
            if (canvasRef.current) {
              canvasRef.current.width = v.videoWidth;
              canvasRef.current.height = v.videoHeight;
            }
          }}
        />
      )}

      {/* Bounding box canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-20 pointer-events-none"
        width={1280}
        height={720}
      />

      {/* Connection dot (bottom-right, small) */}
      <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className={`text-xs font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
