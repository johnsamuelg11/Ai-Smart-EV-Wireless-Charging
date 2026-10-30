from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
import joblib
import pandas as pd
import os

app = FastAPI(
    title="AI Smart EV Wireless Charging & Smart Parking API",
    version="1.0.0"
)

# Enable CORS so your frontend (index.html / app.js) can communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Load the Trained Random Forest Model
MODEL_PATH = "ev_priority_model.pkl"
rf_model = None

if os.path.exists(MODEL_PATH):
    rf_model = joblib.load(MODEL_PATH)
    print(f"[INFO] Successfully loaded ML model: {MODEL_PATH}")
else:
    print(f"[WARNING] {MODEL_PATH} not found! Ensure it is in the same folder as main.py.")

# 2. Simulated Database & Active Slot State
VEHICLE_RFID_DB = {
    "A3 7B 21 9C": {"ev_id": "EV-01", "model": "Prototype Car 1 (3.7V Li-ion)"},
    "B4 19 55 2A": {"ev_id": "EV-02", "model": "Prototype Car 2 (3.7V Li-ion)"},
    "C8 32 77 1F": {"ev_id": "EV-03", "model": "Prototype Car 3 (3.7V Li-ion)"}
}

SLOTS_STATE: Dict[int, dict] = {
    1: {"slot_id": 1, "type": "WIRELESS_CHARGING", "occupied": False, "data": None},
    2: {"slot_id": 2, "type": "WIRELESS_CHARGING", "occupied": False, "data": None},
    3: {"slot_id": 3, "type": "SMART_PARKING_ONLY", "occupied": False, "data": None}
}

# 3. Request Schemas
class PriorityRequest(BaseModel):
    slot_id: int
    ev_id: str = "EV-01"
    rfid_uid: Optional[str] = "A3 7B 21 9C"
    current_soc: float = 25.0
    required_soc: Optional[float] = 80.0
    waiting_time_mins: float = 0.0
    departure_minutes: float = 60.0
    available_energy: float = 85.0

def get_priority_tier(score: float) -> str:
    if score >= 80:
        return "VERY HIGH"
    elif score >= 60:
        return "HIGH"
    elif score >= 30:
        return "MEDIUM"
    return "LOW"

# 4. API Endpoints
@app.get("/")
def health_check():
    return {
        "status": "online",
        "model_loaded": rf_model is not None,
        "architecture": "Slots 1 & 2: Wireless Charging | Slot 3: Smart Parking Only"
    }

@app.post("/api/predict_priority")
def predict_priority(req: PriorityRequest):
    if req.slot_id not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid slot_id. Must be 1, 2, or 3.")

    # Slot 3 is strictly Smart Parking Only (No TX Coil)
    if req.slot_id == 3:
        session_info = {
            "slot_id": 3,
            "ev_id": req.ev_id,
            "rfid_uid": req.rfid_uid,
            "mode": "SMART_PARKING_ONLY",
            "priority_score": 0.0,
            "priority_level": "N/A (PARKING ONLY)",
            "coil_relay": "DISABLED",
            "power_watts": 0.0,
            "departure_minutes": req.departure_minutes
        }
        SLOTS_STATE[3] = {"slot_id": 3, "type": "SMART_PARKING_ONLY", "occupied": True, "data": session_info}
        return session_info

    # Slots 1 & 2: Run Random Forest Priority Prediction
    if rf_model is None:
        raise HTTPException(status_code=500, detail="ML Model ev_priority_model.pkl is not loaded.")

    req_soc = req.required_soc if req.required_soc is not None else 80.0
    charging_demand = max(0.0, req_soc - req.current_soc)

    features = pd.DataFrame([{
        "SOC": req.current_soc,
        "Waiting_Time": req.waiting_time_mins,
        "Required_SOC": req_soc,
        "Departure_Minutes": req.departure_minutes,
        "Charging_Demand": charging_demand,
        "Available_Energy": req.available_energy
    }])

    predicted_score = float(rf_model.predict(features)[0])
    predicted_score = round(predicted_score, 2)
    level = get_priority_tier(predicted_score)

    session_info = {
        "slot_id": req.slot_id,
        "ev_id": req.ev_id,
        "rfid_uid": req.rfid_uid,
        "mode": "WIRELESS_CHARGING",
        "current_soc": req.current_soc,
        "required_soc": req_soc,
        "charging_demand": round(charging_demand, 2),
        "departure_minutes": req.departure_minutes,
        "priority_score": predicted_score,
        "priority_level": level,
        "coil_relay": "ON",
        "power_watts": 4.5
    }

    SLOTS_STATE[req.slot_id] = {
        "slot_id": req.slot_id,
        "type": "WIRELESS_CHARGING",
        "occupied": True,
        "data": session_info
    }

    return session_info

@app.get("/api/slots")
def get_all_slots():
    return SLOTS_STATE

@app.post("/api/emergency_stop")
def emergency_stop():
    for slot_id in [1, 2]:
        if SLOTS_STATE[slot_id]["data"]:
            SLOTS_STATE[slot_id]["data"]["coil_relay"] = "OFF"
            SLOTS_STATE[slot_id]["data"]["power_watts"] = 0.0
    return {"status": "EMERGENCY_STOP_ACTIVE", "message": "All wireless charging TX coils de-energized."}