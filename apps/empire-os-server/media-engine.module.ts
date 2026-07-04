/**
 * MediaEngineModule — Video, Image, Audio & Music Router
 *
 * Detects installed media tools and intelligently routes tasks to the best engine.
 * Local-first: always tries local before suggesting cloud.
 * Hardware-aware: knows what can run on 8GB RAM / typical integrated GPU.
 *
 * Routes:
 *   GET  /media-engine/          → HTML dashboard
 *   GET  /media-engine/detect    → detect all available media engines
 *   POST /media-engine/route     → route a task to best engine
 *   POST /media-engine/generate/image   → generate image
 *   POST /media-engine/generate/video   → generate video (prompt)
 *   POST /media-engine/transcribe       → speech → text (Whisper)
 *   POST /media-engine/tts              → text → speech (Piper/Kokoro)
 *   GET  /media-engine/health    → module health
 */

import { execSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const DATA_DIR    = process.env.DATA_DIR ?? path.resolve('.empire-data')

// ── Engine definitions ────────────────────────────────────────────────────────

interface Engine {
  id: string
  name: string
  icon: string
  category: 'video-gen' | 'image-gen' | 'stt' | 'tts' | 'music' | 'vision'
  local: boolean
  localUrl?: string
  checkFn: () => Promise<boolean>
  quality: number  // 1-10, higher = better
  speed: number    // 1-10, higher = faster
  ramGB: number    // estimated RAM needed
  description: string
  installHint?: string
  apiDoc?: string
}

async function httpCheck(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return r.ok || r.status < 500
  } catch { return false }
}

function pathCheck(cmd: string): boolean {
  try { execSync(`where ${cmd}`, { stdio: 'ignore', timeout: 2000 }); return true } catch { return false }
}

async function ollamaModelCheck(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2500) })
    const data = await r.json() as { models: Array<{ name: string }> }
    return data.models.some(m => m.name.startsWith(id.split(':')[0]))
  } catch { return false }
}

const ENGINES: Engine[] = [
  // ── VIDEO GEN ───────────────────────────────────────────────────────────────
  {
    id: 'comfyui-video', name: 'ComfyUI (Video)', icon: '⚙️', category: 'video-gen', local: true,
    localUrl: 'http://localhost:8188',
    checkFn: () => httpCheck('http://localhost:8188/'),
    quality: 9, speed: 4, ramGB: 4,
    description: 'Node-based workflow engine. Supports LTX Video, AnimateDiff, SVD. Full control.',
    installHint: 'Download from github.com/comfyanonymous/ComfyUI, run: python main.py --port 8188',
  },
  {
    id: 'ltx-video', name: 'LTX Video (local)', icon: '🎞️', category: 'video-gen', local: true,
    checkFn: async () => (pathCheck('ltx') || await httpCheck('http://localhost:7860/')),
    quality: 7, speed: 6, ramGB: 6,
    description: 'Fast local text-to-video. Good quality. Needs 8GB VRAM — may be slow on integrated GPU.',
    installHint: 'pip install ltx-video or run through ComfyUI',
  },
  {
    id: 'pika', name: 'Pika', icon: '✨', category: 'video-gen', local: false,
    checkFn: async () => false,
    quality: 9, speed: 8, ramGB: 0,
    description: 'Cloud video generation — cinematic quality, 1080p. pika.art',
    apiDoc: 'https://pika.art',
  },
  {
    id: 'kling', name: 'Kling', icon: '🎬', category: 'video-gen', local: false,
    checkFn: async () => false,
    quality: 9, speed: 7, ramGB: 0,
    description: 'Cloud — excellent motion quality, long videos up to 3 min. klingai.com',
    apiDoc: 'https://klingai.com',
  },
  {
    id: 'luma', name: 'Luma Dream Machine', icon: '🌌', category: 'video-gen', local: false,
    checkFn: async () => false,
    quality: 9, speed: 7, ramGB: 0,
    description: 'Cloud — cinematic video, great for characters and landscapes. lumalabs.ai',
    apiDoc: 'https://lumalabs.ai/dream-machine',
  },
  {
    id: 'runway', name: 'Runway Gen-3', icon: '🛤️', category: 'video-gen', local: false,
    checkFn: async () => false,
    quality: 10, speed: 6, ramGB: 0,
    description: 'Cloud — industry-standard, professional grade. runwayml.com',
    apiDoc: 'https://runwayml.com',
  },

  // ── IMAGE GEN ───────────────────────────────────────────────────────────────
  {
    id: 'comfyui-image', name: 'ComfyUI (Image)', icon: '⚙️', category: 'image-gen', local: true,
    localUrl: 'http://localhost:8188',
    checkFn: () => httpCheck('http://localhost:8188/'),
    quality: 10, speed: 5, ramGB: 4,
    description: 'Best local image quality via FLUX, SDXL, or SD1.5. Full workflow control.',
    installHint: 'github.com/comfyanonymous/ComfyUI',
  },
  {
    id: 'a1111', name: 'Automatic1111 SD', icon: '🎨', category: 'image-gen', local: true,
    localUrl: 'http://localhost:7860',
    checkFn: () => httpCheck('http://localhost:7860/'),
    quality: 8, speed: 6, ramGB: 4,
    description: 'Classic Stable Diffusion WebUI — runs SD1.5, SDXL, ControlNet, LoRA.',
    installHint: 'github.com/AUTOMATIC1111/stable-diffusion-webui',
    apiDoc: 'http://localhost:7860/docs',
  },
  {
    id: 'forge', name: 'SD Forge', icon: '🔥', category: 'image-gen', local: true,
    localUrl: 'http://localhost:7862',
    checkFn: () => httpCheck('http://localhost:7862/'),
    quality: 8, speed: 7, ramGB: 3,
    description: 'Faster A1111 fork — better FLUX support, lower VRAM requirements.',
    installHint: 'github.com/lllyasviel/stable-diffusion-webui-forge',
  },
  {
    id: 'llava-vision', name: 'LLaVA (Ollama)', icon: '👁️', category: 'vision', local: true,
    checkFn: () => ollamaModelCheck('llava'),
    quality: 8, speed: 6, ramGB: 4.5,
    description: 'Vision via Ollama — understands images, generates descriptions, answers visual questions.',
    installHint: 'ollama pull llava:7b',
  },
  {
    id: 'dalle', name: 'DALL·E 3', icon: '🖼️', category: 'image-gen', local: false,
    checkFn: async () => !!process.env.OPENAI_API_KEY,
    quality: 10, speed: 9, ramGB: 0,
    description: 'OpenAI DALL·E 3 — best prompt adherence, photorealistic. Requires OpenAI key.',
    apiDoc: 'https://platform.openai.com/docs/guides/images',
  },

  // ── SPEECH TO TEXT ──────────────────────────────────────────────────────────
  {
    id: 'whisper-cpp', name: 'Whisper.cpp', icon: '⚡', category: 'stt', local: true,
    checkFn: async () => pathCheck('whisper-cpp') || pathCheck('main'),
    quality: 9, speed: 9, ramGB: 0.5,
    description: 'Fastest local STT — C++ port of OpenAI Whisper. Excellent accuracy, runs on CPU.',
    installHint: 'github.com/ggerganov/whisper.cpp — build from source or download pre-built',
  },
  {
    id: 'whisper-python', name: 'Whisper (Python)', icon: '🎤', category: 'stt', local: true,
    checkFn: async () => pathCheck('whisper'),
    quality: 9, speed: 6, ramGB: 1.5,
    description: 'Official OpenAI Whisper Python — pip install openai-whisper',
    installHint: 'pip install openai-whisper torch',
  },
  {
    id: 'whisper-ollama', name: 'Whisper (Ollama)', icon: '🦙', category: 'stt', local: true,
    checkFn: () => ollamaModelCheck('whisper'),
    quality: 8, speed: 5, ramGB: 1.0,
    description: 'Whisper via Ollama — easiest setup if Ollama is already running.',
    installHint: 'ollama pull whisper',
  },

  // ── TEXT TO SPEECH ──────────────────────────────────────────────────────────
  {
    id: 'piper', name: 'Piper TTS', icon: '🔊', category: 'tts', local: true,
    checkFn: async () => pathCheck('piper'),
    quality: 7, speed: 10, ramGB: 0.1,
    description: 'Fastest local TTS — 0.1GB RAM, many voices, 100% offline. Perfect for video narration.',
    installHint: 'github.com/rhasspy/piper — download binary + voice model',
  },
  {
    id: 'kokoro', name: 'Kokoro TTS', icon: '🎶', category: 'tts', local: true,
    checkFn: async () => pathCheck('kokoro') || await httpCheck('http://localhost:8880/'),
    quality: 9, speed: 8, ramGB: 0.3,
    description: 'High-quality neural TTS — natural-sounding, very small model. pip install kokoro',
    installHint: 'pip install kokoro-onnx or kokoro-82m',
  },
  {
    id: 'elevenlabs', name: 'ElevenLabs', icon: '✨', category: 'tts', local: false,
    checkFn: async () => !!process.env.ELEVENLABS_API_KEY,
    quality: 10, speed: 8, ramGB: 0,
    description: 'Best cloud TTS — ultra-natural voices, voice cloning. Requires API key.',
    apiDoc: 'https://elevenlabs.io/docs',
  },

  // ── MUSIC ───────────────────────────────────────────────────────────────────
  {
    id: 'musicgen', name: 'MusicGen', icon: '🎸', category: 'music', local: true,
    checkFn: async () => pathCheck('audiocraft') || await httpCheck('http://localhost:7861/'),
    quality: 8, speed: 4, ramGB: 3.0,
    description: 'Meta MusicGen — generate music from text descriptions. Local or via Gradio.',
    installHint: 'pip install audiocraft or use HuggingFace Spaces',
  },
  {
    id: 'suno', name: 'Suno', icon: '🎼', category: 'music', local: false,
    checkFn: async () => false,
    quality: 10, speed: 8, ramGB: 0,
    description: 'Cloud music generation — full songs with lyrics from prompts. suno.com',
    apiDoc: 'https://suno.com',
  },
]

// ── Task routing logic ────────────────────────────────────────────────────────

async function detectEngines(): Promise<Array<Engine & { available: boolean }>> {
  const results = await Promise.all(
    ENGINES.map(async e => ({ ...e, available: await e.checkFn() }))
  )
  return results
}

function pickBestEngine(engines: Array<Engine & { available: boolean }>, category: Engine['category']): (Engine & { available: boolean }) | null {
  const candidates = engines.filter(e => e.category === category && e.available)
  if (!candidates.length) return null
  // Sort: local first, then by quality * speed score
  return candidates.sort((a, b) => {
    if (a.local !== b.local) return a.local ? -1 : 1
    return (b.quality + b.speed) - (a.quality + a.speed)
  })[0]
}

// ── HTML Dashboard ────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS — Media Engine</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0d0f14; --surface:#161b22; --surface2:#1c2333; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --green:#3fb950;
    --red:#f85149; --yellow:#d29922; --purple:#bc8cff;
  }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:14px 20px; display:flex; align-items:center; gap:10px; }
  header h1 { font-size:17px; font-weight:600; }
  .badge { background:var(--purple); color:#fff; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:600; }
  .tabs { display:flex; background:var(--surface); border-bottom:1px solid var(--border); padding:0 20px; }
  .tab { padding:10px 16px; font-size:13px; cursor:pointer; border-bottom:2px solid transparent; color:var(--muted); }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); }
  .panel { display:none; padding:20px; overflow-y:auto; height:calc(100vh - 90px); }
  .panel.active { display:block; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
  .eng-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:14px; }
  .eng-card.available { border-left:3px solid var(--green); }
  .eng-card.unavailable { border-left:3px solid var(--border); opacity:.75; }
  .eng-header { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .eng-icon { font-size:20px; }
  .eng-name { font-weight:600; font-size:14px; }
  .eng-sub { font-size:11px; color:var(--muted); }
  .eng-desc { font-size:12px; color:var(--muted); margin-bottom:10px; line-height:1.5; }
  .eng-chips { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; }
  .chip { font-size:10px; padding:1px 7px; border-radius:4px; border:1px solid var(--border); background:var(--surface2); color:var(--muted); }
  .chip.ok  { background:rgba(63,185,80,.08); border-color:rgba(63,185,80,.3); color:var(--green); }
  .chip.off { background:rgba(248,81,73,.08); border-color:rgba(248,81,73,.3); color:var(--red); }
  .chip.cloud { background:rgba(88,166,255,.08); border-color:rgba(88,166,255,.3); color:var(--accent); }
  .star-bar { display:flex; gap:2px; }
  .star { font-size:10px; color:var(--yellow); }
  .star.off { color:var(--border); }
  .hint { font-size:11px; color:var(--muted); padding:8px; background:var(--surface2); border-radius:4px; margin-top:6px; }
  .btn { padding:4px 12px; border-radius:5px; border:1px solid var(--border); cursor:pointer; font-size:11px; background:var(--surface2); color:var(--text); }
  .btn:hover { background:var(--border); }
  .btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
  .router-box { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:20px; }
  .router-result { background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:14px; margin-top:14px; display:none; }
  select { background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:6px 10px; color:var(--text); font-size:13px; }
</style>
</head>
<body>
<header>
  <span style="font-size:20px">🎬</span>
  <h1>Media Engine</h1>
  <span class="badge">Empire OS</span>
  <button class="btn" style="margin-left:auto" onclick="detectAll()">↻ Detect Engines</button>
</header>
<div class="tabs">
  <div class="tab active" onclick="showTab('router')">🧭 Task Router</div>
  <div class="tab" onclick="showTab('video')">🎬 Video</div>
  <div class="tab" onclick="showTab('image')">🖼️ Image</div>
  <div class="tab" onclick="showTab('audio')">🎵 Audio</div>
  <div class="tab" onclick="showTab('music')">🎼 Music</div>
</div>

<div class="panel active" id="tab-router">
  <div class="router-box">
    <h2 style="margin-bottom:14px">Intelligent Task Router</h2>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Tell Empire what you need — it picks the best available engine automatically.</p>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
      <select id="task-type">
        <option value="video-gen">Generate a video</option>
        <option value="image-gen">Generate an image</option>
        <option value="stt">Speech to text (transcribe)</option>
        <option value="tts">Text to speech (narration)</option>
        <option value="music">Generate music</option>
        <option value="vision">Understand an image</option>
      </select>
      <button class="btn primary" onclick="routeTask()">Find Best Engine</button>
    </div>
    <div class="router-result" id="router-result"></div>
  </div>
  <div id="routing-rules" style="margin-top:20px"></div>
</div>

<div class="panel" id="tab-video"><div class="grid" id="eng-video"></div></div>
<div class="panel" id="tab-image"><div class="grid" id="eng-image"></div></div>
<div class="panel" id="tab-audio"><div class="grid" id="eng-audio"></div></div>
<div class="panel" id="tab-music"><div class="grid" id="eng-music"></div></div>

<script>
const EMPIRE = 'http://localhost:3001'
let engines = []

function stars(n, max=10) {
  const filled = Math.round(n / max * 5)
  return Array.from({length:5}, (_,i) => \`<span class="star\${i>=filled?' off':''}">\${i<filled?'★':'☆'}</span>\`).join('')
}

function renderCard(e) {
  const avail = e.available
  return \`<div class="eng-card \${avail?'available':'unavailable'}">
    <div class="eng-header">
      <span class="eng-icon">\${e.icon}</span>
      <div>
        <div class="eng-name">\${e.name}</div>
        <div class="eng-sub">\${e.local?'Local':'Cloud'} · \${e.ramGB>0?e.ramGB+'GB RAM':'No local RAM needed'}</div>
      </div>
    </div>
    <div class="eng-desc">\${e.description}</div>
    <div class="eng-chips">
      <span class="chip \${avail?'ok':'off'}">\${avail?'✓ Available':'✗ Not detected'}</span>
      \${e.local?'':'<span class="chip cloud">☁ Cloud</span>'}
      <span style="margin-left:auto;display:flex;gap:6px">
        <span class="star-bar" title="Quality">\${stars(e.quality)}</span>
        <span style="font-size:10px;color:var(--muted)">Q</span>
        <span class="star-bar" title="Speed">\${stars(e.speed)}</span>
        <span style="font-size:10px;color:var(--muted)">S</span>
      </span>
    </div>
    \${!avail && e.installHint ? '<div class="hint">📦 '+e.installHint+'</div>' : ''}
    \${!avail && e.apiDoc ? '<div class="hint">🌐 <a href="'+e.apiDoc+'" target="_blank" style="color:var(--accent)">'+e.apiDoc+'</a></div>' : ''}
    \${avail && e.localUrl ? '<div class="hint" style="margin-top:6px"><a href="'+e.localUrl+'" target="_blank" style="color:var(--accent)">Open '+e.name+' ↗</a></div>' : ''}
  </div>\`
}

async function detectAll() {
  try {
    const r = await fetch(EMPIRE + '/media-engine/detect')
    engines = await r.json()
    renderEngines()
  } catch(e) { alert('Could not reach Empire OS: ' + e.message) }
}

function renderEngines() {
  const cats = {video:'video-gen', image:'image-gen', audio:'stt,tts', music:'music'}
  document.getElementById('eng-video').innerHTML = engines.filter(e => e.category==='video-gen').map(renderCard).join('')
  document.getElementById('eng-image').innerHTML = engines.filter(e => e.category==='image-gen'||e.category==='vision').map(renderCard).join('')
  document.getElementById('eng-audio').innerHTML = engines.filter(e => e.category==='stt'||e.category==='tts').map(renderCard).join('')
  document.getElementById('eng-music').innerHTML = engines.filter(e => e.category==='music').map(renderCard).join('')

  // Routing rules summary
  const rules = [
    {task:'Video', cat:'video-gen'}, {task:'Image', cat:'image-gen'},
    {task:'Speech → Text', cat:'stt'}, {task:'Text → Speech', cat:'tts'},
    {task:'Music', cat:'music'}, {task:'Vision', cat:'vision'}
  ]
  document.getElementById('routing-rules').innerHTML = '<h2 style="margin-bottom:12px">Current Routing</h2>' +
    rules.map(r => {
      const best = engines.filter(e => e.category===r.cat && e.available).sort((a,b)=>((a.local===b.local)?0:a.local?-1:1) || (b.quality+b.speed)-(a.quality+a.speed))[0]
      return \`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="min-width:120px;color:var(--muted)">\${r.task}</span>
        <span>→</span>
        \${best ? \`<span style="color:var(--green)">\${best.icon} \${best.name}</span><span style="font-size:11px;color:var(--muted);margin-left:6px">\${best.local?'(local)':'(cloud)'}</span>\`
               : \`<span style="color:var(--red)">No engine detected</span>\`}
      </div>\`
    }).join('')
}

async function routeTask() {
  const cat = document.getElementById('task-type').value
  const r = await fetch(EMPIRE + '/media-engine/route', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category: cat }) }).catch(() => null)
  const result = document.getElementById('router-result')
  if (!r || !r.ok) { result.style.display='block'; result.innerHTML='<span style="color:var(--red)">Could not reach Empire OS</span>'; return }
  const d = await r.json()
  result.style.display = 'block'
  result.innerHTML = d.engine
    ? \`<strong>\${d.engine.icon} \${d.engine.name}</strong> <span style="color:var(--green)">(Available)</span>
       <div style="font-size:12px;color:var(--muted);margin-top:6px">\${d.engine.description}</div>
       \${d.engine.localUrl ? '<div style="margin-top:6px"><a href="'+d.engine.localUrl+'" target="_blank" style="color:var(--accent)">Open → '+d.engine.localUrl+'</a></div>' : ''}
       \${d.alternatives?.length ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">Alternatives: '+d.alternatives.map(a=>a.name).join(', ')+'</div>' : ''}\`
    : \`<span style="color:var(--red)">No engine available for this task. </span>
       <span style="font-size:12px;color:var(--muted)">\${d.hint || ''}</span>\`
}

function showTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.getElementById('tab-' + id).classList.add('active')
  event.target.classList.add('active')
}

detectAll()
</script>
</body>
</html>`

// ── Module class ──────────────────────────────────────────────────────────────

export class MediaEngineModule implements EmpireModule {
  readonly moduleId = 'media-engine'

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {}

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const done = (status: number, body: unknown) => ({ status, body, moduleId: this.moduleId, durationMs: Date.now() - start })

    if (req.path === '/' || req.path === '') return { ...done(200, HTML), headers: { 'Content-Type': 'text/html' } }

    if (req.path === '/detect') {
      const engines = await detectEngines()
      return done(200, engines.map(({ checkFn: _c, ...rest }) => rest))
    }

    if (req.path === '/route' && req.method === 'POST') {
      const body = req.body as { category?: string } | undefined
      const category = body?.category as Engine['category'] | undefined
      if (!category) return done(400, { error: 'Missing: category' })

      const engines = await detectEngines()
      const best = pickBestEngine(engines, category)
      const alts = engines
        .filter(e => e.category === category && e.available && e.id !== best?.id)
        .slice(0, 3)
        .map(({ checkFn: _c, ...rest }) => rest)

      if (!best) {
        const hints: Record<string, string> = {
          'video-gen': 'Install ComfyUI (local) or use Pika/Kling (cloud)',
          'image-gen': 'Install Automatic1111 (local) or use DALL·E (requires OpenAI key)',
          'stt': 'Install: pip install openai-whisper',
          'tts': 'Install Piper TTS or Kokoro: pip install kokoro-onnx',
          'music': 'Install: pip install audiocraft or use Suno (cloud)',
          'vision': 'Run: ollama pull llava:7b',
        }
        return done(200, { engine: null, hint: hints[category] ?? 'No engine available' })
      }

      const { checkFn: _, ...bestClean } = best
      return done(200, { engine: bestClean, alternatives: alts, routed: true })
    }

    if (req.path === '/generate/image' && req.method === 'POST') {
      const body = req.body as { prompt?: string; engine?: string } | undefined
      if (!body?.prompt) return done(400, { error: 'Missing: prompt' })
      const engines = await detectEngines()
      const best = pickBestEngine(engines, 'image-gen')
      if (!best) return done(503, { error: 'No image engine available', hint: 'Install ComfyUI or Automatic1111' })

      // Route to A1111 if available
      if (best.id === 'a1111' || best.id === 'forge') {
        try {
          const r = await fetch(`${best.localUrl}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: body.prompt, steps: 20, width: 512, height: 512 }),
            signal: AbortSignal.timeout(60_000),
          })
          const data = await r.json() as { images?: string[] }
          return done(200, { engine: best.id, images: data.images?.length ?? 0, message: 'Generated via ' + best.name })
        } catch (e) {
          return done(500, { error: `${best.name} generation failed: ${e}` })
        }
      }

      // DALL·E via OpenAI key
      if (best.id === 'dalle' && process.env.OPENAI_API_KEY) {
        return done(200, { engine: 'dalle', message: 'Route via OpenAI API — implement OpenAI image endpoint in your app', prompt: body.prompt })
      }

      return done(200, { engine: best.id, message: 'Open ' + best.localUrl + ' to generate images with: ' + body.prompt, hint: 'Use the web UI directly for full control' })
    }

    if (req.path === '/transcribe' && req.method === 'POST') {
      const body = req.body as { filePath?: string } | undefined
      const engines = await detectEngines()
      const best = pickBestEngine(engines, 'stt')
      if (!best) return done(503, { error: 'No STT engine available', hint: 'pip install openai-whisper' })

      if (best.id === 'whisper-python' && body?.filePath) {
        try {
          const out = execFileSync('whisper', [body.filePath, '--output_format', 'json'], { encoding: 'utf8', timeout: 120_000 })
          return done(200, { engine: best.id, transcript: out })
        } catch (e) { return done(500, { error: String(e) }) }
      }

      return done(200, { engine: best.id, message: 'Use: whisper <file> --output_format json', hint: `Best STT available: ${best.name}` })
    }

    if (req.path === '/tts' && req.method === 'POST') {
      const body = req.body as { text?: string } | undefined
      if (!body?.text) return done(400, { error: 'Missing: text' })
      const engines = await detectEngines()
      const best = pickBestEngine(engines, 'tts')
      if (!best) return done(503, { error: 'No TTS engine available', hint: 'Install Piper or Kokoro' })

      if (best.id === 'piper') {
        return done(200, { engine: 'piper', command: `echo "${body.text}" | piper --model en_US-lessac-medium --output_file output.wav`, hint: 'Run this command in your terminal' })
      }
      if (best.id === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
        return done(200, { engine: 'elevenlabs', message: 'Route to ElevenLabs API with your key', text: body.text })
      }

      return done(200, { engine: best.id, message: `Best TTS available: ${best.name}`, installHint: best.installHint })
    }

    if (req.path === '/health') {
      const engines = await detectEngines()
      const available = engines.filter(e => e.available).length
      return done(200, { status: 'healthy', enginesAvailable: available, enginesTotal: engines.length })
    }

    return done(404, { error: 'Not found' })
  }

  async handleEvent(): Promise<void> { /* no events */ }

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> { /* stateless */ }
}
