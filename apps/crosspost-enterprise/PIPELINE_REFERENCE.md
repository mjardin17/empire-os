# COMPREHENSIVE PIPELINE REFERENCE
## Autonomous Content Factory Stage-Gates & Asset Flows

This document details the multi-stage pipelines that produce final production assets (Video, Books, and Merchandise) within the Empire workspace.

---

## 1. THE AUTONOMOUS DOCUMENTARY VIDEO PIPELINE

The Video Creator is structured as an **independent stage-gate pipeline**. If a stage fails, only that stage is retried. Previous assets are safely preserved.

```
 [Seed Idea / Topic]
        │
        ▼ (Stage 1)
 [Deep Niche Research] ──────► Produces research.md
        │
        ▼ (Stage 2)
 [Documentary Outline] ──────► Produces outline.md
        │
        ▼ (Stage 3)
 [Narration Screenplay] ─────► Produces script.md (with Visual Directions)
        │
        ▼ (Stage 4)
 [Higgsfield Prompt Synthesis] ► Produces scene_prompts.json
        │
        ├──────────────────────────────┐
        ▼ (Stage 5)                    ▼ (Stage 6)
 [Voiceover Synthesis]          [Generative Video Composites]
  Produces narration.wav         Produces clips_manifest.json
        │                              │
        └──────────────┬───────────────┘
                       ▼ (Stage 7)
               [FFmpeg Timeline Assembly] ──► Combines Audio & Video
                       │
                       ▼ (Stage 8)
               [SRT Subtitle Burn-In] ──────► Produces subtitles.srt
                       │
                       ▼ (Stage 9)
               [Cover Image Render] ────────► Produces thumbnail.png
                       │
                       ▼ (Stage 10)
               [SEO Optimization Node] ─────► Produces metadata.json, description.txt, tags.txt
                       │
                       ▼ (Stage 11)
               [Ready for CrossPost] ───────► Hands to automated distribution
```

---

## 2. DETAILED STAGE-BY-STAGE SPECIFICATIONS

### Stage 1: Deep Niche Research
- **Purpose**: Crawl historical facts, tech specifications, and obscure references.
- **Responsible AI**: Gemini (Cloud) or Qwen (Ollama).
- **Inputs**: Text Topic/Seed Idea.
- **Outputs**: `research.md`.
- **Target Folder**: `/assets/projects/`

### Stage 2: Documentary Outline
- **Purpose**: Frame the gathered research into a structured 4-act documentary script structure.
- **Responsible AI**: Gemini (Cloud) or Llama (Ollama).
- **Inputs**: `research.md`.
- **Outputs**: `outline.md` (JSON structure: Title, Act 1 Focus, Act 2 Focus, etc.).
- **Target Folder**: `/assets/projects/`

### Stage 3: Narration Screenplay
- **Purpose**: Draft highly engaging narrator voiceover lines intertwined with exact visual cues.
- **Responsible AI**: Qwen (Ollama) or Gemini (Cloud).
- **Inputs**: `outline.md`.
- **Outputs**: `script.md`.
- **Target Folder**: `/assets/projects/`

### Stage 4: Higgsfield Prompt Synthesis
- **Purpose**: Extract the visual scene descriptions from the script and synthesize them into highly cinematic image/video prompt strings.
- **Responsible AI**: DeepSeek (Ollama) or Gemini (Cloud).
- **Inputs**: `script.md`.
- **Outputs**: `scene_prompts.json`.
- **Target Folder**: `/assets/projects/`

### Stage 5: Voiceover Synthesis (Narration)
- **Purpose**: Synthesize the narrative script text into a high-quality 48kHz WAV speech file with proper rhythm.
- **Responsible AI**: Local Narration TTS Engine (Voice pipeline).
- **Inputs**: `script.md` (filtered narrator dialogue).
- **Outputs**: `narration.wav`.
- **Target Folder**: `/assets/projects/`

### Stage 6: Generative Video Composites (Video)
- **Purpose**: Call Higgsfield physical video rendering models to synthesize cinematic clips matching the scene prompts.
- **Responsible AI**: Higgsfield Generator Node.
- **Inputs**: `scene_prompts.json`.
- **Outputs**: `clips_manifest.json` and raw clip video files.
- **Target Folder**: `/assets/projects/clips/`

### Stage 7: FFmpeg Media Compositor (Assembly)
- **Purpose**: Concatenate and compile the generated video clips, overlay the synthesized narration.wav, and apply transitional effects.
- **Responsible Tool**: FFmpeg (Shell Execution).
- **Inputs**: `clips_manifest.json`, `narration.wav`.
- **Outputs**: `final_video.mp4`.
- **Target Folder**: `/assets/projects/`

### Stage 8: SRT Subtitle Burn-In
- **Purpose**: Produce time-aligned captions matching the synthesized narrator audio track.
- **Responsible Tool**: Whisper (Local) or SRT Align Script.
- **Inputs**: `narration.wav`, `script.md`.
- **Outputs**: `subtitles.srt`.
- **Target Folder**: `/assets/projects/`

### Stage 9: Cover Image Render (Thumbnail)
- **Purpose**: Synthesize an extremely eye-catching, high-contrast poster to act as the episode thumbnail.
- **Responsible AI**: Imagen 3 (Gemini Suite) or Stable Diffusion.
- **Inputs**: Topic, script, and title recommendations.
- **Outputs**: `thumbnail.png`.
- **Target Folder**: `/assets/projects/`

### Stage 10: SEO Optimization Node (SEO)
- **Purpose**: Formulate YouTube titles, a structured multi-paragraph description box with chapter timestamps, and tags.
- **Responsible AI**: ChatGPT or Gemini.
- **Inputs**: `script.md`, `research.md`.
- **Outputs**: `metadata.json`, `description.txt`, `tags.txt`.
- **Target Folder**: `/assets/projects/`

### Stage 11: CrossPost Publishing (Ready for CrossPost)
- **Purpose**: Hand the completed asset packet directly to CrossPost for scheduling, translation, and multi-channel posting.
- **Responsible Engine**: CrossPost Syndicate Router.
- **Inputs**: All 9 output files from the project folder.
- **Outputs**: Successful upload status logs, video URLs.
- **Target Channels**: YouTube, Pinterest, Facebook, Instagram, TikTok, X (Twitter).

---

## 3. ADVANCED STAGE RECOVERY PROTOCOL

If any stage fails (e.g., a Higgsfield clip timeout or FFmpeg syntax crash), the system will:
1. Log the failure reason into `logs/pipeline_failures.log`.
2. Transition the active step status to `failed`.
3. Stop the pipeline progression **without** deleting any already-generated assets (`research.md`, `script.md`, `narration.wav`, etc.).
4. Allow the developer to click "Retry Step" in the Empire UI, which re-launches **only** the failing step.
