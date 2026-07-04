# AI MODEL RESPONSIBILITIES & COGNITIVE MAP
## Universal Routing & Workload Allocation Matrix

To maximize efficiency, maintain high context-windows, and avoid excessive cloud costs, the AI Empire splits workloads between **Cloud Cognitive Models** and **Local High-Performance Weights**.

---

## 1. COGNITIVE HEURISTICS SUMMARY

| Model Family | Primary Host | Best Suited For | Key Weakness | Max Context Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Claude (Anthropic)** | Cloud API | Complex Architecture, Python Scripts, Hardcore Debugging, Code Refactoring | High Cost | 200,000 Tokens |
| **Gemini (Google)** | Cloud SDK | In-Depth Academic Research, Planning, Multi-Act Screenplays, HTML/React UI | Needs Structured Instructions | 1,000,000+ Tokens |
| **ChatGPT (OpenAI)** | Cloud API | Workflow Optimization, Prompt Engineering, Structured JSON Outputs | Expensive API Scaling | 128,000 Tokens |
| **Goose** | Local Agent CLI | Tool Orchestration, File System Navigation, System Commands | Needs Strict Safe-Gates | Dependent on underlying LLM |
| **DeepSeek (Coder/V3)** | Local Ollama | Fast Script Writing, Logic Checking, Code Assembly, Structural Refactoring | High Local VRAM Load | 32,000 Tokens (Ollama) |
| **Qwen (Alibaba)** | Local Ollama | Text Drafting, Direct Translation, Descriptive Scene Outlines | Heavy Style Verbosity | 32,000 Tokens (Ollama) |
| **Llama (Meta)** | Local Ollama | Conversational Assistant, Multi-Agent Debates, Summarization | Average Technical Precision | 8,192 Tokens (Ollama) |
| **Mistral / Gemma** | Local Ollama | Fast Categorization, Light JSON Extraction, Key-Value Tag Lists | Limited Reasoning Depth | 4,096 Tokens (Ollama) |

---

## 2. DETAIL PLAN: DECENTRALIZED MODEL SPECS

### 2.1 Claude Council (Advisory Panel)
- **Role**: Peer-reviewing documentary screenplays and content structures before publishing.
- **Debate Framework**: Three distinct personas evaluate drafts in a round-robin debate structure:
  - *Monetization Analyst*: Injects CTA hooks, mid-roll ad scripts, affiliate link mentions, and lead magnet placements.
  - *Growth Hacker*: Fine-tunes high-contrast visual cues, emotional hooks, fast pacing cues, and clickbait phrases.
  - *Risk Auditor*: Scans for copyrighted words, standard medical/financial compliance, and platform TOS triggers.

### 2.2 Gemini Research & Synthesis Engine
- **Role**: Handles heavy content ingestion.
- **Strengths**: Ingests thousands of pages of raw materials (academic papers, patent registrations, long transcripts) and produces clean, factual summaries.
- **Usage Pattern**: Use `gemini-3.5-flash` for high-throughput summarizing and `gemini-3.5-pro` for deep analytical evaluations.

### 2.3 Local Ollama Inference Cluster
- **Role**: Free local compute. Used for iterative, high-volume text drafting.
- **Implementation Strategy**:
  - `deepseek-coder` is queried at `localhost:11434` for compiling specialized shell execution wrappers or helper functions.
  - `qwen2.5` handles multi-act video screenplays, creating highly cinematic scene directions and voiceover dialogue.
  - `llama3.1` simulates the multi-agent debate matrices on the local machine when cloud APIs are offline.

---

## 3. INTELLIGENT AI ROUTER PROTOCOL (`/api/empire/ai-router`)

The system uses an autonomous Router to choose the correct model:

```
[Incoming Request] 
       ↓
[Measure Input Tokens]
       ↓
Is Context > 32K or Payload has complex file trees?
       ├─► Yes ──► Route to Cloud: Gemini 3.5 (API key based)
       └─► No  ──► Route to Local: Ollama (DeepSeek / Qwen / Llama)
```

### 3.1 Error Handling & Fallbacks
If a local model query fails (e.g., Ollama is offline or the GPU runs out of VRAM), the Router must catch the exception and fall back to the `gemini-3.5-flash` API. It must broadcast a `system.warning.model_fallback` event to the central event bus.
