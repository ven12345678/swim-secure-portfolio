import asyncio
import base64
import socket
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from inference import run_yolo_detection, get_lstm_drowning_risk
from tracker import PersonTracker
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global tracker (in a real app, instantiate per session/camera)
tracker = PersonTracker(max_history=30) # Keep last 30 frames for LSTM

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
        # Create a copy of the list to avoid modifying it while iterating
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
                # Viewers just listen, keep connection alive
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect_viewer(websocket)
            print("Viewer disconnected")
        except Exception as e:
            manager.disconnect_viewer(websocket)
            print(f"Error in viewer websocket: {e}")
    else:
        # role == "local" or "streamer"
        await websocket.accept()
        print(f"Streamer/Local connected (role: {role})")
        try:
            while True:
                # Receive frame as base64 from frontend
                data = await websocket.receive_text()
                base64_image = data
                
                # 1. Spatial Detection (YOLOv11 via Roboflow)
                detections = await asyncio.to_thread(run_yolo_detection, base64_image)
                
                # 2. Track persons across frames
                tracked_objects = tracker.update(detections)
                
                # 3. Temporal Prediction (Mock LSTM)
                results = []
                for obj in tracked_objects:
                    person_id = obj["id"]
                    track_history = tracker.tracks[person_id]
                    risk_score = get_lstm_drowning_risk(track_history)
                    
                    results.append({
                        "id": person_id,
                        "box": obj["box"],
                        "class": obj["class"],
                        "confidence": obj["confidence"],
                        "drowning_risk": risk_score,
                        "is_drowning": risk_score > 70
                    })
                
                # 4. Send aggregated results back
                response = {
                    "timestamp": time.time(),
                    "detections": results,
                    "total_persons": len(results),
                    "incident_active": any(r["is_drowning"] for r in results)
                }
                
                # If this is a remote camera streamer, broadcast to viewers
                if role == "streamer":
                    # Include frame for viewers
                    broadcast_payload = response.copy()
                    broadcast_payload["frame"] = base64_image
                    await manager.broadcast(broadcast_payload)
                
                # Always send back to the sender
                await websocket.send_json(response)
                
        except WebSocketDisconnect:
            print(f"Streamer disconnected (role: {role})")
        except Exception as e:
            print(f"Error in streamer websocket: {e}")
            try:
                await websocket.close()
            except:
                pass

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
