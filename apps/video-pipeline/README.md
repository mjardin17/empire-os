# Video Bot Pipeline — Empire OS Integration

This directory contains the Empire OS integration layer for the Video Bot Pipeline.
The actual pipeline source lives at `C:\Users\jjard\claude\video-bot-pipeline\`.

## What was built

| File | Location | Purpose |
|------|----------|---------|
| `empire_server.py` | `video-bot-pipeline/` root | Python FastAPI bridge (port 8002) — empire hooks + render API |
| `empire-module/video-pipeline.module.ts` | here | TypeScript EmpireModule adapter |
| `empire-module/package.json` | here | `@empire-os/video-pipeline-module` |

## Starting the bridge

```bash
cd C:\Users\jjard\claude\video-bot-pipeline
pip install fastapi uvicorn --break-system-packages
python empire_server.py
# Server starts at http://localhost:8002
```

## Empire hooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/empire/health` | GET | Health + active render count |
| `/empire/status` | GET | Full module descriptor + episode stats |
| `/empire/event` | POST | Receive Empire OS events (script.created → queues render) |

## Render API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/episodes` | GET | All episodes with render status |
| `/api/render` | POST | Trigger `auto_render.py --episode <id>` |
| `/api/renders` | GET | List completed MP4s in renders/ |
| `/api/council/status` | GET | Read all council state JSON files |
| `/api/render/status` | GET | Active/completed render jobs |

## Event flow

```
StoryForge → script.created →
  [Empire Event Bus] →
    VideoPipelineModule.handleEvent() →
      empire_server.py POST /empire/event →
        _run_render(episode_id) subprocess →
          auto_render.py --episode <id> →
            [render.completed] → Empire Event Bus
```

## Environment variables (add to .env, never committed)

```
EMPIRE_OS_EVENT_URL=http://localhost:5000/api/events   # Empire OS event ingress
PIPELINE_BASE_URL=http://localhost:8002                 # override in TS module
```
