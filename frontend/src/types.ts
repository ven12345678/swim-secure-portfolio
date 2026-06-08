export interface DetectionBox {
  id: number;
  box: [number, number, number, number]; // x_center, y_center, width, height
  class: string;
  confidence: number;
  drowning_risk: number;
  is_drowning: boolean;
}

export interface BackendResponse {
  session_id?: number;
  timestamp: number;
  detections: DetectionBox[];
  total_persons: number;
  incident_active: boolean;
  latency_ms?: number;
}
