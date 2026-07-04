/**
 * EmpireStoreModule — Empire OS App Store
 *
 * Curated catalog of AI tools, models, and utilities.
 * Browse by category, get install instructions, one-click install via Installer.
 *
 * Routes:
 *   GET /store/           → Store UI
 *   GET /store/catalog    → Full catalog JSON
 *   GET /store/item/:id   → Single item JSON
 */

import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

export interface StoreItem {
  id: string
  name: string
  icon: string
  category: 'ai-models' | 'video' | 'image' | 'voice' | 'ocr' | 'automation' | 'developer' | 'research' | 'plugins'
  description: string
  method: 'ollama' | 'pip' | 'npm' | 'winget' | 'url' | 'script'
  installCmd?: string  // exact command to run (without the method prefix)
  free: boolean
  local: boolean
  ramGB?: number       // RAM needed (local tools)
  recommended?: boolean
  url?: string
  tags?: string[]
}

const CATALOG: StoreItem[] = [
  // ── AI Models (Ollama) ──────────────────────────────────────────────────
  {
    id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', icon: '🤖', category: 'ai-models',
    description: 'Alibaba\'s top 7B model. Excellent at coding, reasoning, and instruction following. Best all-rounder for 8GB RAM.',
    method: 'ollama', installCmd: 'qwen2.5:7b', free: true, local: true, ramGB: 4.7, recommended: true,
    tags: ['chat', 'code', 'reasoning', 'top-pick'],
  },
  {
    id: 'gemma3:4b', name: 'Gemma 3 4B', icon: '💎', category: 'ai-models',
    description: 'Google\'s efficient 4B model. Excellent quality for its size, fast responses.',
    method: 'ollama', installCmd: 'gemma3:4b', free: true, local: true, ramGB: 3.0, recommended: true,
    tags: ['chat', 'fast'],
  },
  {
    id: 'llama3.2:3b', name: 'Llama 3.2 3B', icon: '🦙', category: 'ai-models',
    description: 'Meta\'s smallest but capable Llama. Fast, great for quick tasks.',
    method: 'ollama', installCmd: 'llama3.2:3b', free: true, local: true, ramGB: 2.0,
    tags: ['chat', 'fast', 'small'],
  },
  {
    id: 'phi4-mini:3.8b', name: 'Phi-4 Mini', icon: '🔬', category: 'ai-models',
    description: 'Microsoft\'s small reasoning model. Punches above its weight on math and logic.',
    method: 'ollama', installCmd: 'phi4-mini:3.8b', free: true, local: true, ramGB: 2.6,
    tags: ['reasoning', 'math'],
  },
  {
    id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', icon: '💻', category: 'ai-models',
    description: 'Best-in-class 7B coder. Top of HumanEval leaderboard for its size. Write, fix, and explain code.',
    method: 'ollama', installCmd: 'qwen2.5-coder:7b', free: true, local: true, ramGB: 4.7, recommended: true,
    tags: ['code', 'top-pick'],
  },
  {
    id: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder V2 16B', icon: '🧑‍💻', category: 'ai-models',
    description: 'Outstanding coder with architecture understanding. Needs 8GB+ RAM (tight on 8GB).',
    method: 'ollama', installCmd: 'deepseek-coder-v2:16b', free: true, local: true, ramGB: 9.1,
    tags: ['code'],
  },
  {
    id: 'nomic-embed-text', name: 'Nomic Embed Text', icon: '📐', category: 'ai-models',
    description: 'Best local embedding model. Perfect for RAG, semantic search, and similarity tasks.',
    method: 'ollama', installCmd: 'nomic-embed-text', free: true, local: true, ramGB: 0.3, recommended: true,
    tags: ['embeddings', 'rag'],
  },
  {
    id: 'moondream:1.8b', name: 'Moondream 1.8B', icon: '👁️', category: 'ai-models',
    description: 'Tiny vision model. Describe images, answer questions about pictures. Ultra-fast.',
    method: 'ollama', installCmd: 'moondream:1.8b', free: true, local: true, ramGB: 1.1,
    tags: ['vision', 'fast', 'small'],
  },
  {
    id: 'llava-llama3:8b', name: 'LLaVA Llama3 8B', icon: '🖼️', category: 'ai-models',
    description: 'Strong vision-language model based on Llama 3. Analyse images in detail.',
    method: 'ollama', installCmd: 'llava-llama3:8b', free: true, local: true, ramGB: 5.5,
    tags: ['vision'],
  },
  {
    id: 'minicpm-v:8b', name: 'MiniCPM-V 8B', icon: '📷', category: 'ai-models',
    description: 'High-quality multimodal model. Excellent for document understanding and image analysis.',
    method: 'ollama', installCmd: 'minicpm-v:8b', free: true, local: true, ramGB: 5.5,
    tags: ['vision', 'documents'],
  },

  // ── Video ───────────────────────────────────────────────────────────────
  {
    id: 'comfyui', name: 'ComfyUI', icon: '🎬', category: 'video',
    description: 'Node-based UI for Stable Diffusion and video generation. Supports LTX-Video, Wan, CogVideoX. Most powerful local video tool.',
    method: 'url', url: 'https://github.com/comfyanonymous/ComfyUI', free: true, local: true, recommended: true,
    tags: ['video-gen', 'image-gen', 'stable-diffusion'],
  },
  {
    id: 'ffmpeg', name: 'FFmpeg', icon: '🎞️', category: 'video',
    description: 'The Swiss Army knife of video processing. Already used by your render pipeline.',
    method: 'winget', installCmd: 'Gyan.FFmpeg', free: true, local: true, recommended: true,
    tags: ['video-edit', 'render'],
  },
  {
    id: 'yt-dlp', name: 'yt-dlp', icon: '⬇️', category: 'video',
    description: 'Download videos from YouTube and 1000+ sites. Supports 4K, subtitles, playlists.',
    method: 'winget', installCmd: 'yt-dlp.yt-dlp', free: true, local: true,
    tags: ['download'],
  },
  {
    id: 'handbrake', name: 'HandBrake', icon: '🔄', category: 'video',
    description: 'Open source video transcoder. Convert, compress, and batch encode video files.',
    method: 'winget', installCmd: 'HandBrake.HandBrake', free: true, local: true,
    tags: ['transcode', 'compress'],
  },
  {
    id: 'kdenlive', name: 'Kdenlive', icon: '🎥', category: 'video',
    description: 'Professional open-source video editor. Multi-track, effects, keyframes.',
    method: 'winget', installCmd: 'KDE.Kdenlive', free: true, local: true,
    tags: ['edit'],
  },

  // ── Image ───────────────────────────────────────────────────────────────
  {
    id: 'automatic1111', name: 'Stable Diffusion WebUI', icon: '🎨', category: 'image',
    description: 'The original SD web interface. Supports SDXL, Flux, ControlNet, hundreds of extensions.',
    method: 'url', url: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui', free: true, local: true, recommended: true, ramGB: 4,
    tags: ['image-gen', 'stable-diffusion'],
  },
  {
    id: 'upscayl', name: 'Upscayl', icon: '⬆️', category: 'image',
    description: 'Free AI image upscaler. 4x upscale with multiple models. Great for thumbnail quality.',
    method: 'url', url: 'https://upscayl.org', free: true, local: true, recommended: true,
    tags: ['upscale'],
  },
  {
    id: 'gimp', name: 'GIMP', icon: '🖌️', category: 'image',
    description: 'Free Photoshop alternative. Full-featured image editor.',
    method: 'winget', installCmd: 'GIMP.GIMP', free: true, local: true,
    tags: ['edit'],
  },
  {
    id: 'imagemagick', name: 'ImageMagick', icon: '🪄', category: 'image',
    description: 'CLI image manipulation. Batch resize, convert, watermark. Used by the pipeline.',
    method: 'winget', installCmd: 'ImageMagick.ImageMagick', free: true, local: true,
    tags: ['cli', 'batch'],
  },

  // ── Voice / Audio ────────────────────────────────────────────────────────
  {
    id: 'whisper-cpp', name: 'Whisper.cpp', icon: '🎤', category: 'voice',
    description: 'Fastest local speech-to-text. C++ port of OpenAI Whisper. Runs entirely offline.',
    method: 'url', url: 'https://github.com/ggerganov/whisper.cpp', free: true, local: true, recommended: true,
    tags: ['stt', 'transcription'],
  },
  {
    id: 'piper-tts', name: 'Piper TTS', icon: '🔊', category: 'voice',
    description: 'Fast local text-to-speech. Natural voices, runs offline, very low RAM.',
    method: 'pip', installCmd: 'piper-tts', free: true, local: true, recommended: true, ramGB: 0.5,
    tags: ['tts', 'voice'],
  },
  {
    id: 'kokoro-tts', name: 'Kokoro TTS', icon: '🎙️', category: 'voice',
    description: 'High-quality 82M param TTS. Sounds more natural than Piper.',
    method: 'pip', installCmd: 'kokoro', free: true, local: true, ramGB: 0.5,
    tags: ['tts', 'high-quality'],
  },
  {
    id: 'openai-whisper', name: 'OpenAI Whisper (Python)', icon: '🎧', category: 'voice',
    description: 'Original OpenAI Whisper Python package. Easy to use, supports large-v3.',
    method: 'pip', installCmd: 'openai-whisper', free: true, local: true, ramGB: 3,
    tags: ['stt'],
  },
  {
    id: 'audacity', name: 'Audacity', icon: '🎵', category: 'voice',
    description: 'Free audio editor. Record, edit, export audio. Great for voiceover cleanup.',
    method: 'winget', installCmd: 'Audacity.Audacity', free: true, local: true,
    tags: ['audio-edit'],
  },

  // ── OCR ─────────────────────────────────────────────────────────────────
  {
    id: 'paddleocr', name: 'PaddleOCR', icon: '📄', category: 'ocr',
    description: 'Best open-source OCR. 80+ languages, tables, layout analysis. Used for document extraction.',
    method: 'pip', installCmd: 'paddleocr paddlepaddle', free: true, local: true, recommended: true,
    tags: ['ocr', 'documents'],
  },
  {
    id: 'tesseract', name: 'Tesseract OCR', icon: '📖', category: 'ocr',
    description: 'Google\'s OCR engine. Simpler than PaddleOCR, good for basic text extraction.',
    method: 'winget', installCmd: 'UB-Mannheim.TesseractOCR', free: true, local: true,
    tags: ['ocr'],
  },

  // ── Automation ───────────────────────────────────────────────────────────
  {
    id: 'playwright', name: 'Playwright', icon: '🎭', category: 'automation',
    description: 'Browser automation for Chrome, Firefox, Safari. Web scraping, testing, form filling.',
    method: 'npm', installCmd: 'playwright', free: true, local: true,
    tags: ['browser', 'scraping', 'automation'],
  },
  {
    id: 'goose', name: 'Goose (Block)', icon: '🦆', category: 'automation',
    description: 'AI dev agent. Run tasks, edit files, execute shell commands autonomously. Already integrated.',
    method: 'url', url: 'https://github.com/block/goose', free: true, local: true, recommended: true,
    tags: ['agent', 'coding', 'automation'],
  },
  {
    id: 'n8n', name: 'n8n', icon: '🔗', category: 'automation',
    description: 'Self-hosted workflow automation. 400+ integrations. Alternative to Zapier/Make.',
    method: 'npm', installCmd: 'n8n', free: true, local: true,
    tags: ['workflow', 'automation'],
  },

  // ── Developer Tools ──────────────────────────────────────────────────────
  {
    id: 'lm-studio', name: 'LM Studio', icon: '🖥️', category: 'developer',
    description: 'GUI for running local LLMs. Download models from HuggingFace, OpenAI-compatible server.',
    method: 'url', url: 'https://lmstudio.ai', free: true, local: true,
    tags: ['llm', 'gui'],
  },
  {
    id: 'open-webui', name: 'Open WebUI', icon: '🌐', category: 'developer',
    description: 'ChatGPT-like UI for Ollama. RAG, documents, web search, plugins.',
    method: 'pip', installCmd: 'open-webui', free: true, local: true, recommended: true,
    tags: ['ui', 'ollama', 'rag'],
  },
  {
    id: 'ollama', name: 'Ollama', icon: '🦙', category: 'developer',
    description: 'Run LLMs locally. The backbone of Empire OS local AI. Already installed.',
    method: 'url', url: 'https://ollama.ai', free: true, local: true, recommended: true,
    tags: ['llm', 'required'],
  },
  {
    id: 'python', name: 'Python 3.11', icon: '🐍', category: 'developer',
    description: 'Required for most AI tools: Whisper, ComfyUI, PaddleOCR, Piper.',
    method: 'winget', installCmd: 'Python.Python.3.11', free: true, local: true, recommended: true,
    tags: ['runtime', 'required'],
  },
  {
    id: 'nodejs', name: 'Node.js LTS', icon: '💚', category: 'developer',
    description: 'JavaScript runtime. Required for Empire OS server, n8n, Playwright.',
    method: 'winget', installCmd: 'OpenJS.NodeJS.LTS', free: true, local: true, recommended: true,
    tags: ['runtime', 'required'],
  },
  {
    id: 'git', name: 'Git', icon: '📦', category: 'developer',
    description: 'Version control. Required for cloning ComfyUI, StoryForge, and other projects.',
    method: 'winget', installCmd: 'Git.Git', free: true, local: true, recommended: true,
    tags: ['vcs', 'required'],
  },
  {
    id: 'vscode', name: 'VS Code', icon: '📝', category: 'developer',
    description: 'Best code editor. Python, TypeScript, everything.',
    method: 'winget', installCmd: 'Microsoft.VisualStudioCode', free: true, local: true,
    tags: ['editor'],
  },
  {
    id: 'windows-terminal', name: 'Windows Terminal', icon: '⬛', category: 'developer',
    description: 'Modern terminal. Tabs, GPU-accelerated, splits.',
    method: 'winget', installCmd: 'Microsoft.WindowsTerminal', free: true, local: true,
    tags: ['terminal'],
  },

  // ── Research ─────────────────────────────────────────────────────────────
  {
    id: 'anytree', name: 'Zotero', icon: '📚', category: 'research',
    description: 'Reference manager for research papers. Integrates with browsers.',
    method: 'winget', installCmd: 'Zotero.Zotero', free: true, local: true,
    tags: ['papers', 'references'],
  },
  {
    id: 'markdownify', name: 'markdownify (pip)', icon: '📝', category: 'research',
    description: 'Convert HTML, PDFs to markdown. Useful for feeding content to local LLMs.',
    method: 'pip', installCmd: 'markdownify', free: true, local: true,
    tags: ['conversion', 'scraping'],
  },
]

function buildHTML(apiBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire Store</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#060912;--glass:rgba(255,255,255,0.03);--border:rgba(255,255,255,0.07);--text:#f1f5f9;--muted:rgba(241,245,249,0.45);--accent:#6366f1;--green:#10b981;--yellow:#f59e0b;--red:#ef4444;--cyan:#22d3ee}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;padding:24px}
h1{font-size:22px;font-weight:700;margin-bottom:4px}.sub{color:var(--muted);margin-bottom:24px;font-size:13px}
.search-row{display:flex;gap:8px;margin-bottom:16px}
.search{flex:1;background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:9px 14px;color:var(--text);font-size:13px}
.search:focus{outline:none;border-color:rgba(99,102,241,0.4)}
.search::placeholder{color:rgba(241,245,249,0.3)}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}
.chip{font-size:11px;padding:4px 12px;border-radius:16px;border:1px solid var(--border);background:var(--glass);color:var(--muted);cursor:pointer;transition:all .15s}
.chip:hover{background:rgba(255,255,255,0.06);color:var(--text)}
.chip.active{background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.3);color:#a5b4fc}
.progress{display:none;background:var(--glass);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:20px}
.progress.show{display:block}
.progress h3{font-size:13px;margin-bottom:8px}
.bar-bg{height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;margin-bottom:6px}
.bar{height:100%;background:linear-gradient(90deg,var(--accent),var(--cyan));border-radius:3px;transition:width .3s}
.pstatus{font-size:11px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:var(--glass);border:1px solid var(--border);border-radius:12px;padding:16px;transition:all .2s}
.card:hover{border-color:rgba(99,102,241,0.25);transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.3)}
.card-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}
.icon{font-size:22px;min-width:32px}
.title{font-weight:600;font-size:14px}
.cat{font-size:10px;color:var(--muted);text-transform:uppercase;margin-top:1px;letter-spacing:.5px}
.desc{font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:10px}
.tags{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px}
.tag{font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid var(--border);background:var(--glass);color:var(--muted)}
.tag.green{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.25);color:#6ee7b7}
.tag.accent{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.25);color:#a5b4fc}
.tag.yellow{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.25);color:#fcd34d}
.actions{display:flex;gap:6px;flex-wrap:wrap}
.btn{padding:5px 14px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:500;transition:all .15s;background:var(--glass);color:var(--text)}
.btn:hover{background:rgba(255,255,255,0.06)}
.btn.primary{background:rgba(99,102,241,.2);color:#a5b4fc;border-color:rgba(99,102,241,.3)}
.btn.primary:hover{background:rgba(99,102,241,.35)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.toast{position:fixed;bottom:24px;right:24px;background:var(--glass);border:1px solid var(--border);backdrop-filter:blur(20px);border-radius:10px;padding:10px 16px;font-size:13px;display:none;z-index:100}
.toast.show{display:block;animation:si .2s ease}
@keyframes si{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
</style>
</head>
<body>
<h1>🛍️ Empire Store</h1>
<p class="sub">Browse and install AI tools, models, and utilities.</p>

<div class="search-row">
  <input class="search" id="q" placeholder="Search store..." oninput="render()">
</div>

<div class="filters" id="filters">
  <span class="chip active" onclick="setFilter('all',this)">All</span>
  <span class="chip" onclick="setFilter('ai-models',this)">🤖 AI Models</span>
  <span class="chip" onclick="setFilter('video',this)">🎬 Video</span>
  <span class="chip" onclick="setFilter('image',this)">🎨 Image</span>
  <span class="chip" onclick="setFilter('voice',this)">🔊 Voice</span>
  <span class="chip" onclick="setFilter('ocr',this)">📄 OCR</span>
  <span class="chip" onclick="setFilter('automation',this)">🤖 Automation</span>
  <span class="chip" onclick="setFilter('developer',this)">💻 Developer</span>
  <span class="chip" onclick="setFilter('research',this)">📚 Research</span>
</div>

<div class="progress" id="prog">
  <h3 id="prog-title">Installing...</h3>
  <div class="bar-bg"><div class="bar" id="prog-bar" style="width:0%"></div></div>
  <div class="pstatus" id="prog-status"></div>
</div>

<div class="grid" id="grid"></div>
<div class="toast" id="toast"></div>

<script>
const API = '${apiBase}'
const OLLAMA = 'http://localhost:11434'
let catalog = [], filter='all', installed=[]

async function boot() {
  const [cat, inst] = await Promise.allSettled([
    fetch(API+'/catalog').then(r=>r.json()),
    fetch(OLLAMA+'/api/tags').then(r=>r.json())
  ])
  if (cat.status==='fulfilled') catalog = cat.value
  if (inst.status==='fulfilled') installed = (inst.value.models||[]).map(m=>m.name)
  render()
}

function setFilter(f, el) {
  filter=f
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'))
  el.classList.add('active')
  render()
}

function render() {
  const q = document.getElementById('q').value.toLowerCase()
  const items = catalog.filter(i =>
    (filter==='all' || i.category===filter) &&
    (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || (i.tags||[]).some(t=>t.includes(q)))
  )
  document.getElementById('grid').innerHTML = items.map(item => {
    const isInst = item.method==='ollama' && installed.some(m=>m.startsWith(item.installCmd?.split(':')[0]||''))
    return \`<div class="card">
      <div class="card-head">
        <div class="icon">\${item.icon}</div>
        <div><div class="title">\${item.name}</div><div class="cat">\${item.category}</div></div>
      </div>
      <div class="desc">\${item.description}</div>
      <div class="tags">
        \${item.free?'<span class="tag green">Free</span>':'<span class="tag yellow">Paid</span>'}
        \${item.local?'<span class="tag accent">Local</span>':'<span class="tag">Cloud</span>'}
        \${item.recommended?'<span class="tag green">⭐ Recommended</span>':''}
        \${item.ramGB?'<span class="tag">'+item.ramGB+'GB RAM</span>':''}
        \${isInst?'<span class="tag green">✓ Installed</span>':''}
      </div>
      <div class="actions">
        \${item.method==='url'?'<button class="btn" onclick="window.open(\''+item.url+'\',\'_blank\')">Open Site ↗</button>':''}
        \${item.method!=='url' && !isInst?'<button class="btn primary" onclick="install('+JSON.stringify(item).replace(/"/g,\\'&quot;\\')+', this)">Install</button>':''}
        \${isInst?'<button class="btn" disabled>✓ Installed</button>':''}
      </div>
    </div>\`
  }).join('') || '<div style="color:var(--muted);padding:40px;text-align:center">No items match</div>'
}

async function install(item, btn) {
  if (!confirm('Install ' + item.name + '?\\n\\nCommand: ' + item.method + ' ' + item.installCmd)) return
  btn.textContent='⋯'; btn.disabled=true
  const prog = document.getElementById('prog')
  const bar = document.getElementById('prog-bar')
  const status = document.getElementById('prog-status')
  document.getElementById('prog-title').textContent = 'Installing ' + item.name
  prog.className = 'progress show'
  bar.style.width = '10%'
  status.textContent = 'Starting...'
  try {
    if (item.method === 'ollama') {
      // Stream directly from Ollama for progress
      const r = await fetch(OLLAMA+'/api/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.installCmd,stream:true})})
      const reader=r.body.getReader(); const dec=new TextDecoder(); let buf=''
      while(true){
        const {done,value}=await reader.read(); if(done)break
        buf+=dec.decode(value,{stream:true}); const lines=buf.split('\\n'); buf=lines.pop()||''
        for(const l of lines){try{const d=JSON.parse(l);if(d.total&&d.completed){const p=Math.round(d.completed/d.total*100);bar.style.width=p+'%';status.textContent='Downloading '+p+'% ('+((d.completed/1e9).toFixed(2))+'/'+(d.total/1e9).toFixed(2)+'GB)'}else if(d.status){status.textContent=d.status}}catch{}}
      }
      toast('✓ '+item.name+' installed')
      await fetch(API.replace('/store','') + '/model-manager/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:item.installCmd})}).catch(()=>{})
    } else {
      status.textContent = 'Sending to installer...'
      const r = await fetch(API.replace('/store','') + '/installer/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,method:item.method,cmd:item.installCmd})})
      const d = await r.json()
      bar.style.width='100%'
      status.textContent = d.message || '✓ Done'
      toast('✓ '+item.name+': '+( d.message||'Install started — check terminal'))
    }
    bar.style.width='100%'
    setTimeout(()=>{prog.className='progress';bar.style.width='0%'},3000)
    btn.textContent='✓ Done'
    await boot()
  } catch(e) {
    prog.className='progress'; btn.textContent='Install'; btn.disabled=false
    toast('Error: '+e.message,'err')
  }
}

function toast(msg, type='ok') {
  const el=document.getElementById('toast')
  el.textContent=msg; el.className='toast show'+(type==='err'?' err':'')
  setTimeout(()=>el.className='toast',3500)
}

boot()
</script>
</body>
</html>`
}

export class EmpireStoreModule implements EmpireModule {
  readonly moduleId = 'store'

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {}

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    const d = (s: number, b: unknown, h?: Record<string,string>): GatewayResponse =>
      ({ status: s, body: b, moduleId: this.moduleId, durationMs: Date.now() - start, headers: h })

    const p = req.path === '/' || req.path === '' ? '/' : req.path.replace(/\/$/, '')

    // HTML UI
    if ((p === '/' || p === '') && req.method === 'GET') {
      return d(200, buildHTML('http://localhost:3001/store'), { 'Content-Type': 'text/html' })
    }

    // Full catalog
    if (p === '/catalog' && req.method === 'GET') {
      return d(200, CATALOG)
    }

    // Single item
    if (p.startsWith('/item/') && req.method === 'GET') {
      const id = p.replace('/item/', '')
      const item = CATALOG.find(i => i.id === id)
      if (!item) return d(404, { error: 'Item not found', id })
      return d(200, item)
    }

    // By category
    if (p.startsWith('/category/') && req.method === 'GET') {
      const cat = p.replace('/category/', '')
      return d(200, CATALOG.filter(i => i.category === cat))
    }

    // Health
    if (p === '/health') return d(200, { status: 'healthy', items: CATALOG.length })

    return d(404, { error: 'Not found', path: p })
  }

  async handleEvent(): Promise<void> {}

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> {}
}
