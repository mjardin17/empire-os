# EMPIRE MEMORY & LOGGING PROTOCOL
## Guidelines for Event Tracking and Systemic Progress Retention

To ensure that independent agents do not lose context between runs, the workspace uses a structured memory protocol that logs telemetry, system states, and pipeline completions.

---

## 1. THE EMPIRE EVENT BUS ARCHITECTURE

Empire OS uses an active pub-sub event model managed via `/api/empire/event-bus`.
Every pipeline transition, AI action, or system warning must broadcast an event.

### 1.1 Event Schema

```typescript
interface EmpireEvent {
  id: string;          // Format: evt_123456789
  timestamp: string;   // ISO 8601 string
  source: string;      // Module generating the event (e.g., "empire.video_creator")
  type: string;        // Specific event class (e.g., "video_creator.step.completed")
  payload: any;        // Supporting data parameters
}
```

### 1.2 Subscribing to Progress
The front-end `MissionControl` dashboard registers a long-polling interface to read events.
This guarantees real-time visual synchronization whenever a background script finishes compiling video segments.

---

## 2. MEMORY AND TELEMETRY LOG FILES

Systemic memory is preserved inside three files:

### 2.1 `logs/pipeline_failures.log`
- *Purpose*: Tracks and stores full stack traces of any failed pipeline steps.
- *Who Writes*: Express Backend.
- *Who Reads*: Empire Inspector, debugging agents.

### 2.2 `logs/agent_learnings.json`
- *Purpose*: Retains custom prompt improvements, model tuning offsets, and lessons learned between pipeline executions.
- *Who Writes*: Autonomous agents (e.g., Goose, Claude Council).
- *Who Reads*: Active agents initiating new projects.

---

## 3. PROJECT STATE PERSISTENCE (LOCAL STORAGE)

Active project progress is automatically mirrored into the browser's `localStorage` as `active_video_project`.
- This ensures that if the user reloads their browser, closes the tab, or loses their connection, **the active pipeline state remains intact**.
- The UI can immediately resume compiling assets at the exact point where it was interrupted.
- Once a project is fully compiled, the user can reset the pipeline, which safely archives the JSON data and prepares the dashboard for the next seed idea.
