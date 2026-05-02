import asyncio
import base64
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

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected via WebSocket")
    try:
        while True:
            # Receive frame as base64 from frontend
            # The payload might be just the base64 string or a JSON
            data = await websocket.receive_text()
            
            # Extract base64 image if it's sent as JSON
            # For simplicity, let's assume the frontend sends raw base64 data URI directly
            base64_image = data
            
            # 1. Spatial Detection (YOLOv11 via Roboflow)
            # Run in a separate thread so we don't block the async event loop
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
            
            await websocket.send_json(response)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket: {e}")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
