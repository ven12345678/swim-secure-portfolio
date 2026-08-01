import cv2
import base64
import json
import time
import os
import sys

# Import our existing logic
# Assuming this script is run from the backend directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# NOTE: This script is deprecated and broken. It relies on a removed `client` from inference.py.
# from inference import client as roboflow_client
from tracker import PersonTracker

def encode_frame_to_base64(frame):
    """Convert OpenCV image to base64 string"""
    _, buffer = cv2.imencode('.jpg', frame)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return base64_str

def extract_sequences_from_video(video_path, label, seq_len=30, output_file="dataset.json"):
    """
    Processes a video, extracts YOLO bounding boxes, tracks them,
    and saves sequences of length seq_len to a JSON file.
    
    label: 1 for drowning, 0 for normal swimming
    """
    if not os.path.exists(video_path):
        print(f"Error: Video file {video_path} not found.")
        return

    print(f"Processing video: {video_path} with label: {label}")
    
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video FPS: {fps}, Total Frames: {total_frames}")

    tracker = PersonTracker(max_history=seq_len)
    extracted_sequences = []
    
    frame_count = 0
    
    # Process every Nth frame to simulate ~5-10 FPS if video is 30 FPS
    # This matches the real-time latency target
    frame_skip = int(fps // 5) if fps > 5 else 1 

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        
        # Skip frames to reduce API calls and simulate our dashboard's framerate
        if frame_count % frame_skip != 0:
            continue
            
        # We'll print the finding count later after the API call
        
        # 1. We don't need to convert frame to base64 anymore
        
        # 2. Call Roboflow YOLOv11
        try:
            result = roboflow_client.run_workflow(
                workspace_name="project-v8ej1",
                workflow_id="detect-count-and-visualize",
                images={"image": frame},
                use_cache=True
            )
            
            # Extract predictions
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
                
            detections = []
            for p in preds:
                # Safety check if dictionary contains keys
                if isinstance(p, dict) and 'x' in p:
                    detections.append({
                        "box": [p.get('x'), p.get('y'), p.get('width'), p.get('height')],
                        "class": p.get('class', 'person'),
                        "confidence": p.get('confidence', 0.9)
                    })
                    
            print(f"Processing frame {frame_count}/{total_frames} (Found {len(detections)} people)...")
            
        except Exception as e:
            print(f"API Error at frame {frame_count}: {e}")
            detections = []
            
        # 3. Track persons
        tracked_objects = tracker.update(detections)
        
        # 4. Check if any person has reached SEQUENCE_LENGTH frames
        for obj in tracked_objects:
            person_id = obj["id"]
            track_history = tracker.tracks[person_id]
            
            # If we have a full sequence
            if len(track_history) == seq_len:
                # Extract just the bounding box coordinates
                sequence = [frame["box"] for frame in track_history]
                
                # Save the sequence
                data_point = {
                    "sequence": sequence,
                    "label": label,
                    "source_video": video_path,
                    "person_id": person_id
                }
                extracted_sequences.append(data_point)
                
                # Clear the history so we don't extract heavily overlapping sequences
                # Or keep it to use sliding windows. For training, sliding windows are good, 
                # but to avoid massive files, we'll clear it and wait for the next 30 frames.
                tracker.tracks[person_id].clear()
                print(f"  -> Extracted full sequence for Person ID: {person_id}")

        # Sleep slightly to respect potential API rate limits
        time.sleep(0.1)

    cap.release()
    
    # 5. Save to JSON
    if len(extracted_sequences) > 0:
        # Load existing data if file exists
        if os.path.exists(output_file):
            with open(output_file, 'r') as f:
                try:
                    existing_data = json.load(f)
                except json.JSONDecodeError:
                    existing_data = []
        else:
            existing_data = []
            
        existing_data.extend(extracted_sequences)
        
        with open(output_file, 'w') as f:
            json.dump(existing_data, f, indent=2)
            
        print(f"\nSuccessfully saved {len(extracted_sequences)} new sequences to {output_file}!")
        print(f"Total dataset size is now: {len(existing_data)} sequences.")
    else:
        print("\nNo full sequences were extracted. The video might be too short or tracking failed.")

if __name__ == "__main__":
    import argparse
    import glob
    parser = argparse.ArgumentParser(description="Extract YOLO bounding box sequences for LSTM training")
    parser.add_argument("--video", type=str, help="Path to a single video file")
    parser.add_argument("--dir", type=str, help="Path to a directory containing video files")
    parser.add_argument("--label", type=int, required=True, help="1 for drowning, 0 for normal swimming")
    parser.add_argument("--seq_len", type=int, default=30, help="Number of frames per sequence (lower this if videos are short)")
    parser.add_argument("--output", type=str, default="dataset.json", help="Output JSON file path")
    
    args = parser.parse_args()
    
    if args.video:
        extract_sequences_from_video(args.video, args.label, args.seq_len, args.output)
    elif args.dir:
        video_extensions = ('*.mp4', '*.avi', '*.mov', '*.mkv')
        videos = []
        for ext in video_extensions:
            videos.extend(glob.glob(os.path.join(args.dir, ext)))
            videos.extend(glob.glob(os.path.join(args.dir, ext.upper())))
        
        print(f"Found {len(videos)} videos in {args.dir}")
        for v in videos:
            extract_sequences_from_video(v, args.label, args.seq_len, args.output)
    else:
        print("Error: Please provide either --video or --dir argument.")
