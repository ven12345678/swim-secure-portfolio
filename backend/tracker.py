import time
import collections
import math

class PersonTracker:
    def __init__(self, max_history=30, max_distance=400, max_missed=5):
        # Maps person_id to a list of bounding boxes over time
        self.tracks = collections.defaultdict(lambda: collections.deque(maxlen=max_history))
        self.next_id = 1
        self.last_positions = {} # Maps person_id to their last known (cx, cy)
        self.missed_frames = {}  # Maps person_id to number of frames missed
        self.max_distance = max_distance # Maximum pixel distance to link a person between frames
        self.max_missed = max_missed # How many frames an ID can disappear before being forgotten
        
    def update(self, detections):
        """
        Distance-based tracker with memory for missed detections.
        """
        tracked_detections = []
        current_positions = {}
        used_ids = set()
        
        for det in detections:
            box = det["box"]
            cx, cy = box[0], box[1] 
            
            best_id = None
            best_dist = float('inf')
            
            for pid, (last_cx, last_cy) in self.last_positions.items():
                if pid in used_ids:
                    continue
                    
                dist = math.hypot(cx - last_cx, cy - last_cy)
                if dist < best_dist and dist < self.max_distance:
                    best_dist = dist
                    best_id = pid
                    
            if best_id is None:
                # No close match found, assign a new ID
                best_id = self.next_id
                self.next_id += 1
                
            used_ids.add(best_id)
            self.tracks[best_id].append(det)
            current_positions[best_id] = (cx, cy)
            self.missed_frames[best_id] = 0
            
            tracked_detections.append({
                "id": best_id,
                "box": box,
                "class": det.get("class", "person"),
                "confidence": det.get("confidence", 0.9)
            })
            
        # Keep tracks alive even if they are missed for a few frames
        for pid, pos in self.last_positions.items():
            if pid not in current_positions:
                missed = self.missed_frames.get(pid, 0) + 1
                if missed <= self.max_missed:
                    current_positions[pid] = pos
                    self.missed_frames[pid] = missed
                    
        self.last_positions = current_positions
        
        return tracked_detections
