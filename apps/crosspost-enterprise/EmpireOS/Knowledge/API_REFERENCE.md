# SYSTEM API REFERENCE
## Workstation Backend & Local Host REST Endpoints

All communication between front-end dashboards, local scripts, and multi-agent systems must use these standardized API endpoints.

---

## 1. EMPIRE OS BACKEND GATEWAY

The Express server (`server.ts`) runs on port `3000` (externally mapped via container Nginx).

### 1.1 Video Pipeline Service

#### `POST /api/video-pipeline/create`
- *Description*: Initializes a new video project directory.
- *Request Body*:
  ```json
  {
    "topic": "The Secret Web: How private darknet micro-nodes coordinate global shipping logistics."
  }
  ```
- *Success Response (200 OK)*:
  ```json
  {
    "success": true,
    "project": {
      "id": "vid_abc123",
      "topic": "The Secret Web:...",
      "status": "idle",
      "currentStepIndex": 0,
      "steps": [ ... ],
      "assets": { ... }
    }
  }
  ```

#### `POST /api/video-pipeline/execute-step`
- *Description*: Executes a specific stage-gate of the video creator pipeline.
- *Request Body*:
  ```json
  {
    "projectId": "vid_abc123",
    "stepId": "research"
  }
  ```
- *Success Response (200 OK)*: Returns the updated project status object with generated asset payloads included.

---

### 1.2 Central AI Routing Service

#### `POST /api/empire/ai-router`
- *Description*: Intelligently routes prompt payloads to either local Ollama instances or Cloud Gemini based on token weight and instructions.
- *Request Body*:
  ```json
  {
    "prompt": "Evaluate this draft screenplay...",
    "systemInstruction": "You are a professional social media manager.",
    "platformId": "youtube",
    "useModel": "auto"
  }
  ```
- *Success Response (200 OK)*:
  ```json
  {
    "success": true,
    "modelUsed": "gemini-3.5-flash",
    "text": "Evaluated script:..."
  }
  ```

---

### 1.3 Event Bus & Telemetry Services

#### `GET /api/empire/event-bus`
- *Description*: Stream or pull active events broadcasted by background pipelines and active agents.
- *Success Response (200 OK)*: Array of logged system events.

#### `GET /api/empire/telemetry`
- *Description*: Pull system hardware metrics (VRAM, CPU, RAM) and active model loads.
- *Success Response (200 OK)*: Real-time hardware performance status object.

---

## 2. OLLAMA INFERENCE API

The local Ollama server runs on `http://localhost:11434`.

### 2.1 Core Routes

#### `POST /api/generate`
- *Description*: Generates a text completion based on a specified local model.
- *Request Body*:
  ```json
  {
    "model": "qwen2.5",
    "prompt": "Write a 50-word introduction to latency arbitrage.",
    "stream": false
  }
  ```
- *Success Response (200 OK)*: Complete text response object.

#### `GET /api/tags`
- *Description*: Returns all models currently downloaded and available on the workstation.
- *Success Response (200 OK)*: List of available model tags.
