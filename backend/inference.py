import base64
import random
import cv2
import numpy as np
from inference_sdk import InferenceHTTPClient

# Initialize Roboflow client
try:
    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key="woYKWHifrhaQWTvmiIrg"
        # api_key="T6vApHIxtSXyRpuOPgXI"
    )
except Exception as e:
    client = None
    print(f"Failed to init Roboflow client: {e}")

def run_yolo_detection(base64_image: str):
    """
    Run YOLO object detection via Roboflow API.
    Returns a list of detections.
    """
    if not client:
        return []
    
    # Extract base64 part if it contains data URI scheme
    if "," in base64_image:
        base64_image = base64_image.split(",")[1]

    # Convert base64 string to numpy array for inference_sdk
    try:
        img_data = base64.b64decode(base64_image)
        np_arr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Failed to decode image")
    except Exception as e:
        print(f"Base64 decoding error: {e}")
        return []

    try:
        result = client.run_workflow(
            workspace_name="project-v8ej1",
            workflow_id="detect-count-and-visualize-3",
    #         workspace_name="cheeses-workspace-ry9v5",
    # workflow_id="detect-count-and-visualize",
            images={"image": frame},
            use_cache=True
        )
        
        # Parse the result. The structure depends on the specific workflow.
        detections = []
        preds = []
        if isinstance(result, list) and len(result) > 0:
            res = result[0]
        else:
            res = result
            
        if isinstance(res, dict) and 'predictions' in res:
            if isinstance(res['predictions'], dict) and 'predictions' in res['predictions']:
                preds = res['predictions']['predictions']
            elif isinstance(res['predictions'], list):
                preds = res['predictions']

        # If Roboflow doesn't return anything or if it's slow, we'll mock some detections for the UI.
        # Let's extract the boxes if they exist
        for p in preds:
            detections.append({
                "box": [p.get('x'), p.get('y'), p.get('width'), p.get('height')],
                "class": p.get('class', 'person'),
                "confidence": p.get('confidence', 0.9)
            })
            
        # If no detections from API (maybe empty room), or if workflow output is different:
        # Fallback to mock detection just for demonstration of the UI if no real ones
        if len(detections) == 0:
            # Let's not mock if no person is actually there, but we need to show the UI works.
            pass
            
        return detections
    except Exception as e:
        print(f"Error calling Roboflow API: {e}")
        return []

def get_lstm_drowning_risk(track_history):
    """
    Mocks an LSTM temporal analysis API.
    Given a sequence of bounding boxes (track history) for a person,
    returns a drowning probability score (0-100%).
    """
    # If the history is short, we don't have enough data
    if len(track_history) < 5:
        return random.randint(10, 30) # Low risk
        
    # Simulate risk increasing if they are in the frame longer or moving erratically
    # For demonstration, we'll randomize a risk but bias it towards higher if history is long
    base_risk = min(100, len(track_history) * 5)
    
    # Introduce some randomness to simulate model confidence fluctuating
    noise = random.randint(-15, 15)
    risk = max(0, min(100, base_risk + noise))
    
    return risk
