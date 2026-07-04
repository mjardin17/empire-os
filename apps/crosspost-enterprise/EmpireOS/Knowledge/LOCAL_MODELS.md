# LOCAL WORKSTATION & MODELS SPECIFICATIONS
## Bare-Metal & Local Inference Configuration

The Empire workstation operates on local bare-metal hardware. It pairs high-speed local GPU/CPU compute with local services to process large media files and text volumes for free.

---

## 1. THE LOCAL HARDWARE & INFRASTRUCTURE LAYER

Our workstation is equipped with:
- **Local Ollama Server**: Serves fast open-source large language models with native GPU acceleration (CUDA / Metal / ROCm).
- **Python Runtime**: Coordinates data wrangling, file parsing, and orchestration helper scripts.
- **FFmpeg Engine**: Combines audio timelines, processes video files, handles aspect-ratio conversions, and burns in SRT files.
- **Goose Agent CLI**: Performs local tool executions, monitors directory structures, and executes background script files.
- **Git & GitHub Integration**: Syncs code bases, registers releases, and archives final assets.

---

## 2. LOCAL MODEL TOPOLOGY & ALLOCATION

All local models are hosted and served via Ollama on port `11434`.

### 2.1 Active Local Weights

1. **DeepSeek-Coder (8B / 33B)**
   - *Calling Target*: `localhost:11434/api/generate` with `{"model": "deepseek-coder"}`
   - *Hardware Acceleration*: GPU-bound (VRAM). Highly prioritized.
   - *Task Scope*: Shell command composition, automated code auditing, syntax repair.

2. **Qwen-2.5-Instruct (14B / 32B)**
   - *Calling Target*: `localhost:11434/api/generate` with `{"model": "qwen2.5"}`
   - *Hardware Acceleration*: GPU-bound (VRAM).
   - *Task Scope*: Narrative copywriting, script writing, multilingual translations.

3. **Llama-3.1-Instruct (8B)**
   - *Calling Target*: `localhost:11434/api/generate` with `{"model": "llama3.1"}`
   - *Hardware Acceleration*: Hybrid (VRAM/RAM).
   - *Task Scope*: Multi-agent debates, summarizing logs, and drafting emails.

---

## 3. HOW LOCAL MODELS ARE CALLED

Local models are queried via standard REST APIs. Below is a compliant curl / fetch specification:

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5",
  "prompt": "Summarize this log line: [SYSTEM.OK] Server booted.",
  "stream": false
}'
```

### 3.1 Node/TypeScript Implementation

```typescript
async function queryLocalModel(prompt: string, model: string = "qwen2.5"): Promise<string> {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false })
    });
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("Local inference failed, falling back to Cloud", error);
    return fallbackToCloud(prompt);
  }
}
```

---

## 4. HARDWARE RUNTIME: GPU VS CPU INFERENCE

- **GPU (Graphics Processing Unit)**: The primary engine. Utilizing massive parallel cores to run model calculations. Speed: ~40-70 tokens per second.
- **CPU (Central Processing Unit)**: Used as a fallback when local VRAM is full. Speed is significantly slower (~2-5 tokens per second).
- **VRAM Optimizations**: To prevent CPU fallback, always offload unused models. Run: `ollama unload <model_name>` or target specific low-quantization weights (e.g., Q4_K_M).

---

## 5. WHY LOCAL INFERENCE IS FREE

Local inference does not use external cloud servers.
- **Zero API Bills**: Traditional cloud models charge per token. Ollama runs entirely on your own electricity and hardware.
- **Offline Reliability**: You can compile videos, write scripts, and parse lead spreadsheets even when disconnected from the internet.
- **Total Privacy**: Sensitive company assets and proprietary documentary transcripts never leave your local physical hard drive.
