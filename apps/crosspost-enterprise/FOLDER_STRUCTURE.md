# EMPIRE WORKSPACE FOLDER STRUCTURE
## Absolute Directory Layout & File Topology

To prevent different agents from creating duplicate folders, this document serves as the official directory guide. All assets, scripts, source files, and builds must strictly adhere to this layout.

---

## 1. PROJECT DIRECTORY MAP

```
/ (Workspace Root)
│
├── .env.example                     # Reference template for environment variables (Secrets)
├── .gitignore                       # Git exclusion parameters (No build files or VRAM dumps)
├── index.html                       # Primary browser entrypoint
├── metadata.json                    # Application metadata, name, and capability listings
├── package.json                     # Node.js dependencies, scripts, and build configurations
├── tsconfig.json                    # TypeScript compiler parameters
├── vite.config.ts                   # Vite build bundler configuration
├── server.ts                        # Unified Express backend & API gateway server
│
├── EMPIRE_SYSTEM_MANUAL.md          # Permanent Master System Manual (You are here)
├── SYSTEM_MAP.json                  # Machine-readable JSON index of the ecosystem
├── AI_RESPONSIBILITIES.md           # Model capabilities and assignment maps
├── PIPELINE_REFERENCE.md            # Stage-by-stage pipeline processes
├── LOCAL_MODELS.md                  # Ollama local models and hardware manual
├── FOLDER_STRUCTURE.md              # Physical file structure documentation
├── API_REFERENCE.md                 # Backend and localhost REST endpoint mappings
├── AUTOMATION_RULES.md              # Strictly-enforced behavior policies for agents
├── PROJECT_INDEX.md                 # List of active, planned, and simulated initiatives
├── MEMORY_PROTOCOL.md               # Telemetry logging and event persistence rules
│
├── assets/                          # Production Asset Storage
│   ├── media/                       # Rendered video and audio assets (e.g., thumbnail.png)
│   ├── projects/                    # Independent project folders for compiled packages
│   └── templates/                   # Audio soundscapes, video overlays, and title designs
│
├── src/                             # Front-End Application Code
│   ├── App.tsx                      # Primary UI dashboard coordinator and hub
│   ├── main.tsx                     # React rendering entrypoint
│   ├── index.css                    # Tailwind CSS imports and custom design theme variables
│   ├── types.ts                     # TypeScript shared interfaces and model schemas
│   │
│   └── components/                  # Isolated Dashboard Station Panels
│       ├── MissionControl.tsx       # Live status indicators and system terminal
│       ├── DocumentaryFactory.tsx   # Code-to-Markdown document generator
│       ├── VideoCreator.tsx         # Autonomous Stage-Gate Video Pipeline
│       ├── AIRouter.tsx             # Interactive intelligent router test portal
│       ├── EmpireInspector.tsx      # Automated workspace auditor & rating dashboard
│       ├── OllamaCommandCenter.tsx  # Local Ollama service controller
│       ├── PerformanceDashboard.tsx # VRAM, RAM, CPU and API latency graphs
│       └── AutomationCenter.tsx     # CrossPost syndicate controls and publishing logs
```

---

## 2. DIRECTORY REUSE POLICY

1. **No Redundant Repositories**: Do not create sub-folders containing independent Git repositories inside this workspace unless explicitly commanded by the user.
2. **Standard Asset Paths**:
   - Save temporary audio clips into `assets/temp/`.
   - Save compiled videos to `/assets/projects/final_video.mp4`.
   - Save metadata and seo logs to `/assets/projects/metadata.json`.
3. **Strict Linting Compliance**: Do not write random, undocumented files inside the `src/` directory. All React code changes must reside inside `src/components/` and be referenced from `src/App.tsx`.
