# AI-Powered Smart EV Wireless Charging & Smart Parking Portal

An end-to-end, full-stack IoT and Machine Learning solution designed for dynamic electric vehicle (EV) priority charging and intelligent bay allocation. This system optimizes power distribution across charging stations using a real-time Random Forest regression engine, edge microcontrollers via MQTT, and a secure role-gated web dashboard.

## 🌟 Key Features

* **Dynamic AI Priority Allocation:** Replaces traditional first-come, first-served charging with an intelligent priority scoring algorithm ($0\text{–}100$) based on battery state-of-charge (SOC), departure urgency, waiting time, and grid power limits.

* **Specialized 3-Slot Infrastructure:**

  * **Slot 1 & Slot 2:** Equipped with wireless power transmitter pads and live telemetry tracking.

  * **Slot 3:** Dedicated strictly to *Smart Parking Only* (automatically disables wireless charging coils and locks power draw at $0\text{.0 W}$).

* **Dual-Role Access Portal:**

  * **User Panel:** Secure email/password login, vehicle profiling, RFID tag linking, slot reservation with custom target SOC and duration sliders, and active session telemetry.

  * **Admin Overview:** Real-time multi-bay telemetry, hardware health monitoring, and a global **Emergency Stop All** command override.

* **Edge-Ready Hardware Architecture:** Designed to bridge microcontrollers (ESP32) and RFID sensors (RC522) with cloud/local services over MQTT and REST APIs.

## 🏗️ System Architecture

```
+-----------------------------------------------------------------+
|                   FRONTEND WEB PORTAL (HTML/JS)                 |
|   - Role-Based Auth (User / Admin)                              |
|   - Slot Booking & Target SOC Sliders                           |
|   - Live Telemetry & AI Priority Gauges                         |
+--------------------------------+--------------------------------+
                                 | REST API / JSON
                                 v
+-----------------------------------------------------------------+
|                    PYTHON FASTAPI BACKEND                       |
|   - ML Inference Engine (Random Forest Regressor)               |
|   - Slot Allocation & Power Management Logic                    |
|   - Emergency Stop Control Layer                                |
+--------------------------------+--------------------------------+
                                 | MQTT Protocol / Serial Bridge
                                 v
+-----------------------------------------------------------------+
|                 ESP32 EDGE HARDWARE & SENSORS                   |
|   - RFID Tag Scanner (RC522)                                    |
|   - Bay Occupancy Sensors                                       |
|   - Relay Power Switches (Coil Control for Slots 1 & 2)         |
+-----------------------------------------------------------------+

```

## 🛠️ Technology Stack

* **Frontend:** HTML5, CSS3 (Custom warm-cream professional palette), Vanilla JavaScript (ES6+), Material Icons.

* **Backend:** Python, FastAPI, Uvicorn, Pydantic.

* **Machine Learning:** Scikit-learn, Random Forest Regressor, Pandas, NumPy, Joblib (`ev_priority_model.pkl`).

* **IoT & Edge:** ESP32 Microcontroller, MQTT Protocol (Paho-MQTT), RC522 RFID Reader.

## 📊 Machine Learning Model Performance

The priority decision engine is powered by a **Random Forest Regressor** (`n_estimators=200`, `max_depth=12`) trained on a 10,000-sample synthetic dataset.

| Evaluation Metric | Score | Interpretation | 
| ----- | ----- | ----- | 
| **MAE (Mean Absolute Error)** | `1.5330` | Priority predictions are within $\pm 1.53$ points on a $0\text{--}100$ scale. | 
| **RMSE (Root Mean Squared Error)** | `1.9297` | Low error variance matching simulated sensor noise bounds. | 
| $\text{R}^2$ **Accuracy Score** | `0.9670` | The model explains $96.7\%$ of the variance in charging priority. | 

**Top Contributing Features:**

1. `Charging_Demand` ($\Delta \text{SOC}$) — $39.47\%$

2. `Departure_Minutes` (Time Urgency) — $30.81\%$

3. `Waiting_Time` (Queue Starvation Prevention) — $16.65\%$

## 🚀 Setup & Installation Instructions

### 1. Clone the Repository

```
git clone https://github.com/johnsamuelg11/Ai-Smart-EV-Wireless-Charging.git
cd Ai-Smart-EV-Wireless-Charging

```

### 2. Run the FastAPI Backend Server

Ensure Python 3.12+ is installed on your system.

```
# Install required backend dependencies
pip install -r requirements.txt

# Start the FastAPI development server
uvicorn main:app --reload --port 8000

```

*Once running, you can access the interactive API documentation at:* `http://127.0.0.1:8000/docs`

### 3. Launch the Frontend Web Portal

Open a separate terminal window in your project root directory and start a local HTTP server:

```
python -m http.server 8000

```

*Open your browser and navigate to:* `http://localhost:8000`

## 🔌 Core API Endpoints

| Method | Endpoint | Description | 
| ----- | ----- | ----- | 
| `GET` | `/` | Health check endpoint returning system and model status. | 
| `POST` | `/api/predict_priority` | Evaluates vehicle telemetry via Random Forest and returns an AI priority score and coil relay state. | 
| `GET` | `/api/slots` | Fetches real-time occupancy and operational status for all 3 bays. | 
| `POST` | `/api/emergency_stop` | Immediately de-energizes all active wireless charging transmitter pads. | 

## 👥 Credentials for Testing

* **Admin Portal Login:**

  * **Email:** `johnsamuel.g11@gmail.com`

  * **Security Key:** `11112005`

* **User Portal:** Use the **Register New User** button on the User Login screen to set up a test driver profile instantly.

## 📜 License

This project is developed as an academic and professional prototype for AI-driven smart charging infrastructures.