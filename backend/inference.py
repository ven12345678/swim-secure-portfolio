import base64
import cv2
import numpy as np
import torch
import torch.nn as nn
from ultralytics import YOLO
from collections import deque

# ── Device ────────────────────────────────────────────────────────────────────
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Running on: {device}")

# ── LSTM Model definition (must match training) ───────────────────────────────
class DrowningLSTM(nn.Module):
    def __init__(self, input_size=11, hidden_size=128, num_layers=2, dropout=0.4):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout
        )
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(64, 1)
        )
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.classifier(out[:, -1, :]).squeeze(1)

# ── Load models ───────────────────────────────────────────────────────────────
try:
    yolo_model = YOLO('models/yolo_best.pt')
    print("✅ YOLO model loaded")
except Exception as e:
    yolo_model = None
    print(f"❌ Failed to load YOLO model: {e}")

try:
    lstm_model = DrowningLSTM(input_size=11).to(device)
    lstm_model.load_state_dict(
        torch.load('models/lstm_best_final.pt', map_location=device)
    )
    lstm_model.eval()
    print("✅ LSTM model loaded")
except Exception as e:
    lstm_model = None
    print(f"❌ Failed to load LSTM model: {e}")

# ── Settings ──────────────────────────────────────────────────────────────────
CONF_THRESHOLD  = 0.25
ALERT_THRESHOLD = 0.20
WINDOW_SIZE     = 30

# ── Per-person feature buffer ─────────────────────────────────────────────────
# Stores raw bbox features for each tracked person_id
person_buffers: dict[int, deque] = {}

def compute_window_features(raw_frames: list) -> np.ndarray:
    """Convert 30 raw bbox frames into 11-feature array."""
    filled = []
    last_valid = None
    for f in raw_frames:
        if f is not None:
            last_valid = f
            filled.append(f[:])
        elif last_valid is not None:
            filled.append(last_valid[:])
        else:
            filled.append([0.5, 0.5, 0.1, 0.2, 0.5, 0.0])

    filled      = np.array(filled, dtype=np.float32)
    xc, yc      = filled[:,0], filled[:,1]
    bw, bh      = filled[:,2], filled[:,3]
    ar, conf    = filled[:,4], filled[:,5]
    vx          = np.diff(xc, prepend=xc[0])
    vy          = np.diff(yc, prepend=yc[0])
    v_mag       = np.sqrt(vx**2 + vy**2)
    area        = bw * bh
    area_change = np.diff(area, prepend=area[0])
    ar_change   = np.diff(ar,   prepend=ar[0])

    return np.stack([
        xc, yc, bw, bh, ar, conf,
        vx, vy, v_mag, area_change, ar_change
    ], axis=1)  # (30, 11)


def run_yolo_detection(base64_image: str) -> list:
    """
    Run YOLOv11 detection on a base64 image.
    Returns list of detection dicts compatible with existing tracker.
    """
    if yolo_model is None:
        return []

    # Decode base64 to frame
    if "," in base64_image:
        base64_image = base64_image.split(",")[1]

    try:
        img_data = base64.b64decode(base64_image)
        np_arr   = np.frombuffer(img_data, np.uint8)
        frame    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return []
    except Exception as e:
        print(f"Base64 decode error: {e}")
        return []

    try:
        results = yolo_model(frame, verbose=False)[0]
        h, w    = frame.shape[:2]

        detections = []
        for box in results.boxes:
            conf = float(box.conf[0])
            if conf < CONF_THRESHOLD:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()

            # Convert to center format to match existing tracker expectation
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            bw = x2 - x1
            bh = y2 - y1

            detections.append({
                "box": [cx, cy, bw, bh],   # center format [x,y,w,h]
                "box_xyxy": [x1, y1, x2, y2],  # absolute pixels
                "box_norm": [           # normalized for LSTM
                    (cx) / w,
                    (cy) / h,
                    bw / w,
                    bh / h
                ],
                "class": "person",
                "confidence": conf
            })

        return detections

    except Exception as e:
        print(f"YOLO inference error: {e}")
        return []


def get_lstm_drowning_risk(track_history: list, person_id: int) -> float:
    if lstm_model is None:
        return 0.0

    if person_id not in person_buffers:
        person_buffers[person_id] = deque(maxlen=30)

    buf = person_buffers[person_id]

    if len(track_history) > 0:
        latest = track_history[-1]  # this is the full det dict
        
        # Use box_norm (normalized) which we set in run_yolo_detection
        box_norm = latest.get("box_norm")
        
        if box_norm and len(box_norm) >= 4:
            xc, yc, bw, bh = box_norm[0], box_norm[1], box_norm[2], box_norm[3]
            ar   = bw / (bh + 1e-5)
            conf = latest.get("confidence", 0.5)
            buf.append([xc, yc, bw, bh, ar, conf])
        else:
            buf.append(None)
    else:
        buf.append(None)

    # Need at least 10 frames before predicting
    if len(buf) < 10:
        return 0.0

    # Pad shorter buffer to 30 by repeating first frame
    buf_list = list(buf)
    while len(buf_list) < WINDOW_SIZE:
        buf_list.insert(0, buf_list[0])

    try:
        features = compute_window_features(buf_list)
        x_tensor = torch.tensor(
            features[np.newaxis], dtype=torch.float32
        ).to(device)

        with torch.no_grad():
            prob = torch.sigmoid(lstm_model(x_tensor)).item()

        return round(prob * 100, 1)

    except Exception as e:
        print(f"LSTM inference error: {e}")
        return 0.0

def cleanup_person(person_id: int):
    """Call this when a person leaves the frame to free buffer memory."""
    if person_id in person_buffers:
        del person_buffers[person_id]