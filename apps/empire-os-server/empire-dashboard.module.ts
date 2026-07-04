/**
 * EmpireDashboardModule — Premium Empire OS Dashboard
 *
 * The central UI. Glassmorphism SPA served at /empire-dashboard/.
 * Unifies all modules into one beautiful interface.
 * Floating AI assistant connects to Empire Assistant.
 * Live data from all Empire OS APIs.
 *
 * Routes:
 *   GET /empire-dashboard/  → Full SPA
 */

import type { EmpireModule, CoreServices, GatewayRequest, GatewayResponse, ModuleHealth } from '@empire-os/core'

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Empire OS</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #060912;
  --bg2: #0a0f1e;
  --glass: rgba(255,255,255,0.03);
  --glass-border: rgba(255,255,255,0.07);
  --glass-hover: rgba(255,255,255,0.06);
  --text: #f1f5f9;
  --muted: rgba(241,245,249,0.45);
  --dim: rgba(241,245,249,0.25);
  --accent: #6366f1;
  --cyan: #22d3ee;
  --purple: #a855f7;
  --green: #10b981;
  --yellow: #f59e0b;
  --red: #ef4444;
  --sidebar-w: 220px;
  --topbar-h: 60px;
}

html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; }

/* ── Animated background ────────────────────────────────────── */
.bg-scene { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.6; }
.orb-1 { width: 700px; height: 700px; background: radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%); top: -200px; left: -100px; animation: drift1 25s ease-in-out infinite; }
.orb-2 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%); bottom: -150px; right: -100px; animation: drift2 30s ease-in-out infinite; }
.orb-3 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%); top: 40%; left: 40%; animation: drift3 20s ease-in-out infinite; }
@keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(80px,60px); } }
@keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-60px,-80px); } }
@keyframes drift3 { 0%,100% { transform: translate(0,0); } 33% { transform: translate(40px,-40px); } 66% { transform: translate(-30px,50px); } }

/* ── Glass mixin ────────────────────────────────────────────── */
.glass { background: var(--glass); backdrop-filter: blur(40px) saturate(180%); -webkit-backdrop-filter: blur(40px) saturate(180%); border: 1px solid var(--glass-border); }

/* ── Layout ─────────────────────────────────────────────────── */
.layout { position: relative; z-index: 1; display: flex; height: 100vh; }

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w); flex-shrink: 0; display: flex; flex-direction: column;
  height: 100vh; padding: 0; overflow: hidden;
  background: rgba(6,9,18,0.85);
  border-right: 1px solid var(--glass-border);
  backdrop-filter: blur(40px);
}
.logo { padding: 20px 20px 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--glass-border); }
.logo-icon { font-size: 22px; }
.logo-text { font-size: 15px; font-weight: 700; letter-spacing: -0.3px; }
.logo-version { font-size: 10px; color: var(--muted); margin-top: 1px; }
.nav { flex: 1; padding: 12px 8px; overflow-y: auto; }
.nav-section { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; padding: 8px 12px 4px; font-weight: 600; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: 8px; cursor: pointer; color: var(--muted); font-size: 13px;
  transition: all 0.15s; margin-bottom: 1px; border: 1px solid transparent;
}
.nav-item:hover { background: var(--glass-hover); color: var(--text); border-color: var(--glass-border); }
.nav-item.active { background: rgba(99,102,241,0.12); color: var(--accent); border-color: rgba(99,102,241,0.2); }
.nav-item.active .nav-icon { filter: drop-shadow(0 0 6px rgba(99,102,241,0.6)); }
.nav-icon { font-size: 16px; min-width: 20px; text-align: center; }
.nav-badge { margin-left: auto; background: var(--accent); color: white; font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; }
.sidebar-footer { padding: 12px; border-top: 1px solid var(--glass-border); }
.sys-status { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); }

/* ── Main area ──────────────────────────────────────────────── */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── Topbar ─────────────────────────────────────────────────── */
.topbar {
  height: var(--topbar-h); flex-shrink: 0; display: flex; align-items: center;
  padding: 0 24px; gap: 12px;
  background: rgba(6,9,18,0.7);
  border-bottom: 1px solid var(--glass-border);
}
.page-title { font-size: 16px; font-weight: 600; flex: 1; }
.topbar-pill {
  display: flex; align-items: center; gap: 6px; background: var(--glass); border: 1px solid var(--glass-border);
  padding: 5px 12px; border-radius: 20px; font-size: 12px; color: var(--muted);
}
.topbar-pill .val { color: var(--text); font-weight: 500; }
.topbar-pill .dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-green  { background: var(--green);  box-shadow: 0 0 5px var(--green); }
.dot-yellow { background: var(--yellow); box-shadow: 0 0 5px var(--yellow); }
.dot-red    { background: var(--red);    box-shadow: 0 0 5px var(--red); }

/* ── Content ─────────────────────────────────────────────────── */
.content { flex: 1; overflow-y: auto; padding: 24px; }
.page { display: none; }
.page.active { display: block; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── Stat cards ─────────────────────────────────────────────── */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
@media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
.stat-card {
  background: var(--glass); border: 1px solid var(--glass-border); border-radius: 12px;
  padding: 18px 20px; position: relative; overflow: hidden; transition: all 0.2s;
}
.stat-card:hover { border-color: rgba(99,102,241,0.3); transform: translateY(-1px); }
.stat-card::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(99,102,241,0.05) 0%, transparent 60%);
  pointer-events: none;
}
.stat-icon { font-size: 22px; margin-bottom: 10px; }
.stat-value { font-size: 28px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
.stat-label { font-size: 12px; color: var(--muted); }
.stat-sub { font-size: 11px; color: var(--dim); margin-top: 4px; }

/* ── Section headers ─────────────────────────────────────────── */
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.section-action { font-size: 12px; color: var(--accent); cursor: pointer; }

/* ── Card grid ──────────────────────────────────────────────── */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.card {
  background: var(--glass); border: 1px solid var(--glass-border); border-radius: 12px;
  padding: 16px; transition: all 0.2s; cursor: default;
}
.card:hover { border-color: rgba(99,102,241,0.25); background: var(--glass-hover); transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.card-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.card-icon { font-size: 20px; min-width: 28px; }
.card-title { font-weight: 600; font-size: 14px; }
.card-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.card-desc { font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 10px; }
.card-actions { display: flex; gap: 6px; flex-wrap: wrap; }

/* ── Buttons ─────────────────────────────────────────────────── */
.btn {
  padding: 5px 14px; border-radius: 6px; border: 1px solid var(--glass-border);
  cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.15s;
  background: var(--glass); color: var(--text);
}
.btn:hover { background: var(--glass-hover); border-color: rgba(255,255,255,0.12); }
.btn.primary { background: rgba(99,102,241,0.2); color: #a5b4fc; border-color: rgba(99,102,241,0.3); }
.btn.primary:hover { background: rgba(99,102,241,0.35); }
.btn.success { background: rgba(16,185,129,0.15); color: #6ee7b7; border-color: rgba(16,185,129,0.3); }
.btn.danger { color: #fca5a5; border-color: rgba(239,68,68,0.3); }
.btn.danger:hover { background: rgba(239,68,68,0.1); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Chips / badges ─────────────────────────────────────────── */
.chips { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.chip { font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--glass-border); background: var(--glass); color: var(--muted); }
.chip.accent { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.25); color: #a5b4fc; }
.chip.green  { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.25); color: #6ee7b7; }
.chip.yellow { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.25); color: #fcd34d; }
.chip.red    { background: rgba(239,68,68,0.1);  border-color: rgba(239,68,68,0.25);  color: #fca5a5; }
.chip.purple { background: rgba(168,85,247,0.1); border-color: rgba(168,85,247,0.25); color: #d8b4fe; }
.chip.cyan   { background: rgba(34,211,238,0.1); border-color: rgba(34,211,238,0.25); color: #67e8f9; }

/* ── Metric bars ─────────────────────────────────────────────── */
.metric { margin-bottom: 16px; }
.metric-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.metric-label .val { font-weight: 500; }
.bar-bg { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
.bar-g { background: linear-gradient(90deg, var(--green), #34d399); }
.bar-y { background: linear-gradient(90deg, var(--yellow), #fbbf24); }
.bar-r { background: linear-gradient(90deg, var(--red), #f87171); }
.bar-a { background: linear-gradient(90deg, var(--accent), var(--purple)); }

/* ── Service grid ────────────────────────────────────────────── */
.svc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.svc { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; }
.svc.ok   { border-left: 2px solid var(--green); }
.svc.down { border-left: 2px solid var(--red);   }
.svc-name { font-size: 12px; font-weight: 500; flex: 1; }
.svc-ping { font-size: 10px; color: var(--muted); }

/* ── Quick launch ────────────────────────────────────────────── */
.quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 24px; }
.quick-item {
  background: var(--glass); border: 1px solid var(--glass-border); border-radius: 10px;
  padding: 16px 10px; text-align: center; cursor: pointer; transition: all 0.2s;
}
.quick-item:hover { border-color: rgba(99,102,241,0.3); background: var(--glass-hover); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
.quick-icon { font-size: 26px; margin-bottom: 8px; }
.quick-label { font-size: 11px; color: var(--muted); }

/* ── Tables ──────────────────────────────────────────────────── */
.table { width: 100%; border-collapse: collapse; font-size: 12px; }
.table th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--glass-border); color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); }
.table tr:hover td { background: var(--glass); }

/* ── AI Assistant Widget ─────────────────────────────────────── */
.ai-widget { position: fixed; bottom: 24px; right: 24px; z-index: 1000; }
.ai-toggle {
  width: 52px; height: 52px; border-radius: 50%; border: 1px solid rgba(99,102,241,0.4);
  background: rgba(99,102,241,0.2); backdrop-filter: blur(20px);
  cursor: pointer; font-size: 22px; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(99,102,241,0.3), 0 4px 20px rgba(0,0,0,0.4);
  transition: all 0.2s; color: white;
}
.ai-toggle:hover { background: rgba(99,102,241,0.35); transform: scale(1.05); box-shadow: 0 0 30px rgba(99,102,241,0.5); }
.ai-panel {
  position: absolute; bottom: 64px; right: 0; width: 340px; border-radius: 16px;
  display: none; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px var(--glass-border);
  animation: popUp 0.2s ease;
}
.ai-panel.open { display: flex; }
@keyframes popUp { from { opacity:0; transform:translateY(10px) scale(0.95); } to { opacity:1; transform:none; } }
.ai-panel-header { padding: 14px 16px; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; gap: 8px; background: rgba(99,102,241,0.1); }
.ai-panel-title { font-size: 13px; font-weight: 600; flex: 1; }
.ai-close { cursor: pointer; color: var(--muted); font-size: 16px; padding: 2px 6px; }
.ai-messages { flex: 1; overflow-y: auto; padding: 12px; max-height: 280px; display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; }
.msg.user { background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.2); align-self: flex-end; }
.msg.assistant { background: var(--glass); border: 1px solid var(--glass-border); align-self: flex-start; }
.msg.thinking { color: var(--muted); font-style: italic; }
.ai-input-row { padding: 10px; border-top: 1px solid var(--glass-border); display: flex; gap: 6px; }
.ai-input { flex: 1; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px; padding: 7px 10px; color: var(--text); font-size: 12px; }
.ai-input:focus { outline: none; border-color: rgba(99,102,241,0.4); }
.ai-send { padding: 7px 12px; border-radius: 8px; background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; cursor: pointer; font-size: 12px; }
.ai-send:hover { background: rgba(99,102,241,0.35); }

/* ── Search input ────────────────────────────────────────────── */
.search-row { display: flex; gap: 8px; margin-bottom: 16px; }
.search-input { flex: 1; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 8px; padding: 8px 14px; color: var(--text); font-size: 13px; }
.search-input:focus { outline: none; border-color: rgba(99,102,241,0.4); }
.search-input::placeholder { color: var(--dim); }

/* ── Install progress bar ────────────────────────────────────── */
.install-progress { display: none; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 10px; padding: 14px; margin-bottom: 16px; }
.install-progress.active { display: block; }
.install-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.install-bar-bg { background: rgba(255,255,255,0.06); border-radius: 4px; height: 6px; margin-bottom: 6px; overflow: hidden; }
.install-bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--cyan)); border-radius: 4px; transition: width 0.3s; }
.install-status { font-size: 11px; color: var(--muted); }

/* ── Toast ────────────────────────────────────────────────────── */
.toast { position: fixed; bottom: 90px; right: 24px; z-index: 2000; background: var(--glass); border: 1px solid var(--glass-border); backdrop-filter: blur(20px); border-radius: 10px; padding: 10px 16px; font-size: 13px; display: none; max-width: 300px; }
.toast.show { display: block; animation: slideIn 0.2s ease; }
.toast.ok   { border-color: rgba(16,185,129,0.4); }
.toast.err  { border-color: rgba(239,68,68,0.4); }
@keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }

/* ── Scrollbar ───────────────────────────────────────────────── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
</style>
</head>
<body>
<div class="bg-scene">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
</div>

<div class="layout">
  <!-- Sidebar -->
  <nav class="sidebar">
    <div class="logo">
      <span class="logo-icon">🏛️</span>
      <div>
        <div class="logo-text">Empire OS</div>
        <div class="logo-version">v2.0 · Josh Jardin</div>
      </div>
    </div>
    <div class="nav">
      <div class="nav-section">Core</div>
      <div class="nav-item active" onclick="nav('overview', this)">
        <span class="nav-icon">⚡</span> Overview
      </div>
      <div class="nav-item" onclick="nav('discovery', this)">
        <span class="nav-icon">🔭</span> Discovery
        <span class="nav-badge" id="new-badge" style="display:none">New</span>
      </div>
      <div class="nav-item" onclick="nav('store', this)">
        <span class="nav-icon">🛍️</span> Store
      </div>
      <div class="nav-section">AI</div>
      <div class="nav-item" onclick="nav('models', this)">
        <span class="nav-icon">🤖</span> Models
      </div>
      <div class="nav-item" onclick="nav('router', this)">
        <span class="nav-icon">🧭</span> AI Router
      </div>
      <div class="nav-item" onclick="nav('benchmarks', this)">
        <span class="nav-icon">📊</span> Benchmarks
      </div>
      <div class="nav-section">Studio</div>
      <div class="nav-item" onclick="nav('media', this)">
        <span class="nav-icon">🎬</span> Media Studio
      </div>
      <div class="nav-item" onclick="nav('memory', this)">
        <span class="nav-icon">🧠</span> Memory
      </div>
      <div class="nav-section">System</div>
      <div class="nav-item" onclick="nav('health', this)">
        <span class="nav-icon">💚</span> Health
      </div>
      <div class="nav-item" onclick="nav('settings', this)">
        <span class="nav-icon">⚙️</span> Settings
      </div>
    </div>
    <div class="sidebar-footer">
      <div class="sys-status">
        <span class="status-dot" id="sys-dot"></span>
        <span id="sys-label">Checking...</span>
      </div>
    </div>
  </nav>

  <!-- Main -->
  <div class="main">
    <!-- Topbar -->
    <div class="topbar">
      <div class="page-title" id="page-title">Overview</div>
      <div class="topbar-pill"><span class="dot dot-green" id="ram-dot"></span>RAM <span class="val" id="topbar-ram">--</span></div>
      <div class="topbar-pill"><span class="dot dot-green" id="svc-dot"></span>Services <span class="val" id="topbar-svcs">--</span></div>
      <div class="topbar-pill">🤖 Models <span class="val" id="topbar-models">--</span></div>
    </div>

    <!-- Content -->
    <div class="content">

      <!-- ═══════════════ OVERVIEW ═══════════════ -->
      <div class="page active" id="page-overview">
        <div class="stats-grid" id="stats-grid">
          <div class="stat-card"><div class="stat-icon">💾</div><div class="stat-value" id="stat-ram">--</div><div class="stat-label">RAM Used</div><div class="stat-sub" id="stat-ram-sub"></div></div>
          <div class="stat-card"><div class="stat-icon">⚙️</div><div class="stat-value" id="stat-cpu">--</div><div class="stat-label">CPU Usage</div><div class="stat-sub" id="stat-cpu-sub"></div></div>
          <div class="stat-card"><div class="stat-icon">🤖</div><div class="stat-value" id="stat-models">--</div><div class="stat-label">Models Installed</div><div class="stat-sub">Ready to use</div></div>
          <div class="stat-card"><div class="stat-icon">💚</div><div class="stat-value" id="stat-services">--</div><div class="stat-label">Services Online</div><div class="stat-sub" id="stat-services-sub"></div></div>
        </div>

        <div class="section-header">
          <div class="section-title">Quick Launch</div>
        </div>
        <div class="quick-grid">
          <div class="quick-item" onclick="nav('discovery', document.querySelector('[onclick*=discovery]'))">
            <div class="quick-icon">🔭</div><div class="quick-label">Discovery</div>
          </div>
          <div class="quick-item" onclick="nav('store', document.querySelector('[onclick*=store]'))">
            <div class="quick-icon">🛍️</div><div class="quick-label">Store</div>
          </div>
          <div class="quick-item" onclick="window.open('http://localhost:3001/model-manager/','_blank')">
            <div class="quick-icon">📦</div><div class="quick-label">Model Manager</div>
          </div>
          <div class="quick-item" onclick="nav('media', document.querySelector('[onclick*=media]'))">
            <div class="quick-icon">🎬</div><div class="quick-label">Media Studio</div>
          </div>
          <div class="quick-item" onclick="nav('memory', document.querySelector('[onclick*=memory]'))">
            <div class="quick-icon">🧠</div><div class="quick-label">Memory</div>
          </div>
          <div class="quick-item" onclick="nav('health', document.querySelector('[onclick*=health]'))">
            <div class="quick-icon">💚</div><div class="quick-label">Health</div>
          </div>
          <div class="quick-item" onclick="nav('benchmarks', document.querySelector('[onclick*=benchmarks]'))">
            <div class="quick-icon">📊</div><div class="quick-label">Benchmarks</div>
          </div>
          <div class="quick-item" onclick="window.open('http://localhost:11434/','_blank')">
            <div class="quick-icon">🦙</div><div class="quick-label">Ollama</div>
          </div>
        </div>

        <div class="section-header">
          <div class="section-title">Services</div>
          <div class="section-action" onclick="loadOverview()">↻ Refresh</div>
        </div>
        <div class="svc-grid" id="overview-services">Loading...</div>

        <div style="margin-top:24px">
          <div class="section-header"><div class="section-title">System Resources</div></div>
          <div class="card" style="max-width:600px" id="overview-metrics">Loading...</div>
        </div>
      </div>

      <!-- ═══════════════ DISCOVERY ═══════════════ -->
      <div class="page" id="page-discovery">
        <div class="search-row">
          <input class="search-input" id="disc-search" placeholder="Search AI models and tools..." oninput="filterCatalog(this.value)">
          <button class="btn" onclick="loadDiscovery()">↻ Refresh</button>
        </div>
        <div class="chips" id="disc-filters">
          <span class="chip accent" onclick="setDiscFilter('all', this)" style="cursor:pointer">All</span>
          <span class="chip" onclick="setDiscFilter('text', this)" style="cursor:pointer">Text</span>
          <span class="chip" onclick="setDiscFilter('code', this)" style="cursor:pointer">Code</span>
          <span class="chip" onclick="setDiscFilter('vision', this)" style="cursor:pointer">Vision</span>
          <span class="chip" onclick="setDiscFilter('video', this)" style="cursor:pointer">Video</span>
          <span class="chip" onclick="setDiscFilter('embedding', this)" style="cursor:pointer">Embeddings</span>
        </div>
        <div class="install-progress" id="disc-progress">
          <div class="install-title" id="disc-prog-title">Installing...</div>
          <div class="install-bar-bg"><div class="install-bar-fill" id="disc-prog-bar" style="width:0%"></div></div>
          <div class="install-status" id="disc-prog-status"></div>
        </div>
        <div class="card-grid" id="disc-grid">Loading...</div>
      </div>

      <!-- ═══════════════ STORE ═══════════════ -->
      <div class="page" id="page-store">
        <div class="search-row">
          <input class="search-input" id="store-search" placeholder="Search Empire Store..." oninput="filterStore(this.value)">
        </div>
        <div class="chips" id="store-filters" style="margin-bottom:16px">
          <span class="chip accent" onclick="setStoreFilter('all', this)" style="cursor:pointer">All</span>
          <span class="chip" onclick="setStoreFilter('ai-models', this)" style="cursor:pointer">AI Models</span>
          <span class="chip" onclick="setStoreFilter('video', this)" style="cursor:pointer">Video</span>
          <span class="chip" onclick="setStoreFilter('image', this)" style="cursor:pointer">Image</span>
          <span class="chip" onclick="setStoreFilter('voice', this)" style="cursor:pointer">Voice</span>
          <span class="chip" onclick="setStoreFilter('ocr', this)" style="cursor:pointer">OCR</span>
          <span class="chip" onclick="setStoreFilter('automation', this)" style="cursor:pointer">Automation</span>
          <span class="chip" onclick="setStoreFilter('developer', this)" style="cursor:pointer">Developer</span>
        </div>
        <div class="card-grid" id="store-grid">Loading...</div>
      </div>

      <!-- ═══════════════ MODELS ═══════════════ -->
      <div class="page" id="page-models">
        <div class="section-header"><div class="section-title">Installed Models</div><div class="section-action" onclick="loadModels()">↻ Refresh</div></div>
        <div class="card-grid" id="models-grid">Loading...</div>
      </div>

      <!-- ═══════════════ AI ROUTER ═══════════════ -->
      <div class="page" id="page-router">
        <div style="max-width:700px">
          <div class="card" style="margin-bottom:14px">
            <h2 style="font-size:14px;font-weight:600;margin-bottom:14px">Routing Rules</h2>
            <table class="table" id="routing-table"></table>
          </div>
          <div class="card">
            <h2 style="font-size:14px;font-weight:600;margin-bottom:14px">Test Router</h2>
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <select id="route-task" style="background:var(--glass);border:1px solid var(--glass-border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px">
                <option value="code">Coding task</option>
                <option value="research">Research</option>
                <option value="copy">Copywriting</option>
                <option value="summary">Summarization</option>
                <option value="classification">Classification</option>
                <option value="video-gen">Video generation</option>
                <option value="image-gen">Image generation</option>
                <option value="stt">Speech to text</option>
                <option value="tts">Text to speech</option>
              </select>
              <button class="btn primary" onclick="testRouter()">Route</button>
            </div>
            <div id="route-result" style="font-size:13px;color:var(--muted)">Select a task type and click Route</div>
          </div>
        </div>
      </div>

      <!-- ═══════════════ BENCHMARKS ═══════════════ -->
      <div class="page" id="page-benchmarks">
        <div class="section-header"><div class="section-title">Model Benchmarks</div><div class="section-action" onclick="loadBenchmarks()">↻ Refresh</div></div>
        <div class="card" style="margin-bottom:16px" id="bench-content">Loading...</div>
        <div class="card">
          <h2 style="font-size:13px;font-weight:600;margin-bottom:12px">Run New Benchmark</h2>
          <div style="display:flex;gap:8px">
            <select id="bench-model" style="background:var(--glass);border:1px solid var(--glass-border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;flex:1"></select>
            <button class="btn primary" onclick="runBenchmark()">▶ Run</button>
          </div>
          <div id="bench-running" style="margin-top:10px;font-size:12px;color:var(--muted)"></div>
        </div>
      </div>

      <!-- ═══════════════ MEDIA STUDIO ═══════════════ -->
      <div class="page" id="page-media">
        <div class="section-header"><div class="section-title">Media Engines</div><div class="section-action" onclick="loadMedia()">↻ Detect</div></div>
        <div class="card-grid" id="media-grid">Loading...</div>
        <div style="margin-top:20px">
          <div class="section-header"><div class="section-title">Route a Media Task</div></div>
          <div class="card" style="max-width:500px">
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <select id="media-task" style="background:var(--glass);border:1px solid var(--glass-border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;flex:1">
                <option value="video-gen">Generate video</option>
                <option value="image-gen">Generate image</option>
                <option value="stt">Speech to text</option>
                <option value="tts">Text to speech</option>
                <option value="music">Generate music</option>
                <option value="vision">Understand image</option>
              </select>
              <button class="btn primary" onclick="routeMedia()">Find Engine</button>
            </div>
            <div id="media-route-result" style="font-size:12px;color:var(--muted)"></div>
          </div>
        </div>
      </div>

      <!-- ═══════════════ MEMORY ═══════════════ -->
      <div class="page" id="page-memory">
        <div class="search-row">
          <input class="search-input" id="mem-search" placeholder="Search memory..." oninput="searchMemory(this.value)">
          <button class="btn primary" onclick="window.open('http://localhost:3001/knowledge-base/','_blank')">Open Full View ↗</button>
        </div>
        <div class="card-grid" id="memory-grid">Loading...</div>
      </div>

      <!-- ═══════════════ HEALTH ═══════════════ -->
      <div class="page" id="page-health">
        <div class="section-header"><div class="section-title">Services</div><div class="section-action" onclick="loadHealth()">↻ Refresh</div></div>
        <div class="svc-grid" id="health-services" style="margin-bottom:20px">Loading...</div>
        <div class="card" id="health-metrics">Loading...</div>
      </div>

      <!-- ═══════════════ SETTINGS ═══════════════ -->
      <div class="page" id="page-settings">
        <div style="max-width:600px">
          <div class="card" style="margin-bottom:14px">
            <h2 style="font-size:14px;font-weight:600;margin-bottom:14px">Empire OS Configuration</h2>
            <table class="table">
              <tr><td style="color:var(--muted)">Server</td><td>http://localhost:3001</td></tr>
              <tr><td style="color:var(--muted)">Ollama</td><td>http://localhost:11434</td></tr>
              <tr><td style="color:var(--muted)">Default Strategy</td><td>cost (Ollama first)</td></tr>
              <tr><td style="color:var(--muted)">RAM</td><td>8 GB (Josh's laptop)</td></tr>
            </table>
          </div>
          <div class="card">
            <h2 style="font-size:14px;font-weight:600;margin-bottom:12px">Quick Links</h2>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button class="btn" onclick="window.open('http://localhost:3001/model-manager/')">📦 Model Manager</button>
              <button class="btn" onclick="window.open('http://localhost:3001/discovery/')">🔭 Discovery (full)</button>
              <button class="btn" onclick="window.open('http://localhost:3001/knowledge-base/')">🧠 Knowledge Base (full)</button>
              <button class="btn" onclick="window.open('http://localhost:3001/health-monitor/')">💚 Health Monitor (full)</button>
              <button class="btn" onclick="window.open('http://localhost:3001/media-engine/')">🎬 Media Engine (full)</button>
              <button class="btn" onclick="window.open('http://localhost:11434')">🦙 Ollama API</button>
            </div>
          </div>
        </div>
      </div>

    </div><!-- /content -->
  </div><!-- /main -->
</div><!-- /layout -->

<!-- AI Assistant Widget -->
<div class="ai-widget">
  <div class="ai-panel glass" id="ai-panel">
    <div class="ai-panel-header">
      <span style="font-size:16px">🤖</span>
      <span class="ai-panel-title">Empire Assistant</span>
      <span class="ai-close" onclick="toggleAssistant()">✕</span>
    </div>
    <div class="ai-messages" id="ai-messages">
      <div class="msg assistant">Hello Josh! I'm your Empire Assistant. Ask me anything about your AI stack, or ask me to route a task.</div>
    </div>
    <div class="ai-input-row">
      <input class="ai-input" id="ai-input" placeholder="Ask Empire..." onkeydown="if(event.key==='Enter') sendMsg()">
      <button class="ai-send" onclick="sendMsg()">➤</button>
    </div>
  </div>
  <button class="ai-toggle" onclick="toggleAssistant()">🤖</button>
</div>

<div class="toast" id="toast"></div>

<script>
const E = 'http://localhost:3001'
const O = 'http://localhost:11434'

// ── Navigation ──────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  overview:'Overview', discovery:'AI Discovery', store:'Empire Store',
  models:'Model Manager', router:'AI Router', benchmarks:'Benchmarks',
  media:'Media Studio', memory:'Memory', health:'Health Monitor', settings:'Settings'
}
let currentPage = 'overview'

function nav(id, el) {
  currentPage = id
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + id).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  if (el) el.classList.add('active')
  document.getElementById('page-title').textContent = PAGE_TITLES[id] || id
  loadPage(id)
}

function loadPage(id) {
  const loaders = {
    overview: loadOverview, discovery: loadDiscovery, store: loadStore,
    models: loadModels, router: loadRouter, benchmarks: loadBenchmarks,
    media: loadMedia, memory: loadMemory, health: loadHealth
  }
  if (loaders[id]) loaders[id]()
}

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type='ok') {
  const el = document.getElementById('toast')
  el.textContent = msg; el.className = 'toast show ' + type
  setTimeout(() => el.className = 'toast', 3500)
}

// ── Topbar refresh ────────────────────────────────────────────────────────────
async function refreshTopbar() {
  try {
    const [metricsRes, ollamaRes, svcRes] = await Promise.allSettled([
      fetch(E + '/health-monitor/metrics'),
      fetch(O + '/api/tags'),
      fetch(E + '/health-monitor/status')
    ])
    if (metricsRes.status==='fulfilled' && metricsRes.value.ok) {
      const m = await metricsRes.value.json()
      document.getElementById('topbar-ram').textContent = m.ram.usedGB.toFixed(1) + '/' + m.ram.totalGB.toFixed(1) + 'GB'
      const ramDot = document.getElementById('ram-dot')
      ramDot.className = 'dot ' + (m.ram.usedPct>85 ? 'dot-red' : m.ram.usedPct>70 ? 'dot-yellow' : 'dot-green')
    }
    if (ollamaRes.status==='fulfilled' && ollamaRes.value.ok) {
      const d = await ollamaRes.value.json()
      document.getElementById('topbar-models').textContent = (d.models||[]).length
    }
    if (svcRes.status==='fulfilled' && svcRes.value.ok) {
      const svcs = await svcRes.value.json()
      const online = svcs.filter(s=>s.status==='online').length
      document.getElementById('topbar-svcs').textContent = online + '/' + svcs.length
      const allOk = svcs.filter(s=>s.critical).every(s=>s.status==='online')
      document.getElementById('svc-dot').className = 'dot ' + (allOk ? 'dot-green' : 'dot-yellow')
      document.getElementById('sys-dot').style.background = allOk ? 'var(--green)' : 'var(--yellow)'
      document.getElementById('sys-label').textContent = allOk ? 'All systems go' : 'Check health'
    }
  } catch {}
}

// ── Overview ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [metricsRes, ollamaRes, svcRes] = await Promise.allSettled([
      fetch(E + '/health-monitor/metrics'),
      fetch(O + '/api/tags'),
      fetch(E + '/health-monitor/status')
    ])
    if (metricsRes.status==='fulfilled' && metricsRes.value.ok) {
      const m = await metricsRes.value.json()
      document.getElementById('stat-ram').textContent = m.ram.usedGB.toFixed(1) + 'GB'
      document.getElementById('stat-ram-sub').textContent = m.ram.usedPct + '% of ' + m.ram.totalGB.toFixed(1) + 'GB total'
      document.getElementById('stat-cpu').textContent = m.cpu.usagePct + '%'
      document.getElementById('stat-cpu-sub').textContent = m.cpu.cores + ' cores'
      document.getElementById('overview-metrics').innerHTML = \`
        <div class="metric"><div class="metric-label"><span>RAM</span><span class="val">\${m.ram.usedGB.toFixed(1)} / \${m.ram.totalGB.toFixed(1)} GB (\${m.ram.usedPct}%)</span></div><div class="bar-bg"><div class="bar-fill \${m.ram.usedPct>85?'bar-r':m.ram.usedPct>70?'bar-y':'bar-a'}" style="width:\${m.ram.usedPct}%"></div></div></div>
        <div class="metric"><div class="metric-label"><span>CPU (\${m.cpu.cores} cores)</span><span class="val">\${m.cpu.usagePct}%</span></div><div class="bar-bg"><div class="bar-fill \${m.cpu.usagePct>85?'bar-r':m.cpu.usagePct>70?'bar-y':'bar-g'}" style="width:\${m.cpu.usagePct}%"></div></div></div>
        \${m.disk ? \`<div class="metric"><div class="metric-label"><span>Disk (C:)</span><span class="val">\${m.disk.freeGB}GB free / \${m.disk.totalGB}GB (\${m.disk.usedPct}%)</span></div><div class="bar-bg"><div class="bar-fill \${m.disk.usedPct>90?'bar-r':m.disk.usedPct>75?'bar-y':'bar-g'}" style="width:\${m.disk.usedPct}%"></div></div></div>\` : ''}
        <div style="font-size:11px;color:var(--muted);margin-top:8px">Uptime: \${Math.floor(m.uptime/3600)}h \${Math.floor((m.uptime%3600)/60)}m · \${m.platform}</div>\`
    }
    if (ollamaRes.status==='fulfilled' && ollamaRes.value.ok) {
      const d = await ollamaRes.value.json()
      document.getElementById('stat-models').textContent = (d.models||[]).length
    }
    if (svcRes.status==='fulfilled' && svcRes.value.ok) {
      const svcs = await svcRes.value.json()
      const online = svcs.filter(s=>s.status==='online').length
      document.getElementById('stat-services').textContent = online + '/' + svcs.length
      document.getElementById('stat-services-sub').textContent = svcs.filter(s=>s.status!=='online').map(s=>s.name).join(', ') || 'All online'
      document.getElementById('overview-services').innerHTML = svcs.map(s =>
        \`<div class="svc \${s.status==='online'?'ok':'down'}">
          <span style="font-size:16px">\${s.icon}</span>
          <div><div class="svc-name">\${s.name}</div><div class="svc-ping">\${s.status==='online'?(s.latencyMs+'ms'):'Offline'}</div></div>
        </div>\`).join('')
    }
  } catch(e) { console.error(e) }
}

// ── Discovery ─────────────────────────────────────────────────────────────────
let catalog = [], installedModels = [], discFilter = 'all'

async function loadDiscovery() {
  try {
    const [catRes, instRes] = await Promise.allSettled([
      fetch(E + '/discovery/catalog'),
      fetch(O + '/api/tags')
    ])
    if (catRes.status==='fulfilled' && catRes.value.ok) catalog = await catRes.value.json()
    if (instRes.status==='fulfilled' && instRes.value.ok) { const d = await instRes.value.json(); installedModels = d.models||[] }
    renderCatalog()
  } catch {}
}

function renderCatalog(filter='') {
  const filtered = catalog.filter(m =>
    (discFilter==='all' || m.category===discFilter) &&
    (!filter || m.name.toLowerCase().includes(filter.toLowerCase()))
  )
  document.getElementById('disc-grid').innerHTML = filtered.map(m => {
    const inst = installedModels.some(im => im.name.startsWith((m.ollama_id||m.id).split(':')[0]))
    const hw = m.compat || {}
    return \`<div class="card">
      <div class="card-header"><div class="card-icon">\${catIcon(m.category)}</div>
        <div><div class="card-title">\${m.name}</div><div class="card-sub">\${m.ramGB}GB RAM · \${m.contextK}K ctx</div></div>
      </div>
      <div class="card-desc">\${m.description}</div>
      <div class="chips">
        \${m.trending?'<span class="chip purple">🔥 Trending</span>':''}
        \${m.isNew?'<span class="chip green">✨ New</span>':''}
        \${inst?'<span class="chip cyan">✓ Installed</span>':''}
        \${hw.rating?'<span class="chip '+(hw.rating==='✅'?'green':hw.rating==='⚠️'?'yellow':'red')+'">'+hw.rating+' '+hw.label+'</span>':''}
        \${(m.capabilities||[]).slice(0,2).map(c=>'<span class="chip">'+c+'</span>').join('')}
      </div>
      <div class="card-actions">
        \${!inst && hw.compatible!==false ? '<button class="btn primary" onclick="discInstall(\''+m.ollama_id+'\', this)">Install</button>' : ''}
        \${inst ? '<button class="btn success">✓ Installed</button>' : ''}
        \${inst ? '<button class="btn" onclick="discBench(\''+m.ollama_id+'\', this)">⏱ Bench</button>' : ''}
      </div>
    </div>\`
  }).join('') || '<div style="color:var(--muted);padding:40px;text-align:center">No models match this filter</div>'
}

function filterCatalog(q) { renderCatalog(q) }
function setDiscFilter(f, el) {
  discFilter = f
  document.querySelectorAll('#disc-filters .chip').forEach(c => c.classList.remove('accent'))
  el.classList.add('accent')
  renderCatalog(document.getElementById('disc-search').value)
}

async function discInstall(id, btn) {
  if (!id) return
  const old = btn.textContent; btn.textContent='⋯'; btn.disabled=true
  const prog = document.getElementById('disc-progress')
  const bar = document.getElementById('disc-prog-bar')
  const status = document.getElementById('disc-prog-status')
  document.getElementById('disc-prog-title').textContent = 'Installing ' + id
  prog.className = 'install-progress active'
  try {
    const r = await fetch(O + '/api/pull', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:id, stream:true}) })
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
    while(true) {
      const {done,value} = await reader.read(); if(done) break
      buf += dec.decode(value,{stream:true}); const lines = buf.split('\\n'); buf = lines.pop()||''
      for(const l of lines) { try { const d=JSON.parse(l); if(d.total&&d.completed){const p=Math.round(d.completed/d.total*100);bar.style.width=p+'%';status.textContent='Downloading '+p+'% ('+((d.completed/1e9).toFixed(2))+'/'+((d.total/1e9).toFixed(2))+'GB)'}else if(d.status){status.textContent=d.status} }catch{} }
    }
    prog.className = 'install-progress'
    btn.textContent='✓ Done'; toast('✓ '+id+' installed')
    await fetch(E+'/model-manager/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:id})}).catch(()=>{})
    await loadDiscovery()
  } catch(e) { prog.className='install-progress'; btn.textContent=old; btn.disabled=false; toast('Failed: '+e.message,'err') }
}

async function discBench(id, btn) {
  const old=btn.textContent; btn.textContent='⏱ Testing...'; btn.disabled=true
  try {
    const r = await fetch(E+'/discovery/benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:id})})
    const d = await r.json()
    toast(id+': '+(d.tokensPerSec||'?')+' tok/s')
  } catch {}
  btn.textContent=old; btn.disabled=false
}

// ── Store ─────────────────────────────────────────────────────────────────────
let storeCatalog = [], storeFilter = 'all'

async function loadStore() {
  try {
    const r = await fetch(E + '/store/catalog')
    if (r.ok) storeCatalog = await r.json()
  } catch {}
  renderStore('')
}

function renderStore(filter='') {
  const filtered = storeCatalog.filter(item =>
    (storeFilter==='all' || item.category===storeFilter) &&
    (!filter || item.name.toLowerCase().includes(filter.toLowerCase()) || item.description.toLowerCase().includes(filter.toLowerCase()))
  )
  document.getElementById('store-grid').innerHTML = filtered.map(item => \`<div class="card">
    <div class="card-header"><div class="card-icon">\${item.icon}</div>
      <div><div class="card-title">\${item.name}</div><div class="card-sub">\${item.category} · \${item.method}</div></div>
    </div>
    <div class="card-desc">\${item.description}</div>
    <div class="chips">
      \${item.free?'<span class="chip green">Free</span>':'<span class="chip yellow">Paid</span>'}
      \${item.local?'<span class="chip cyan">Local</span>':'<span class="chip">Cloud</span>'}
      \${item.ramGB?'<span class="chip">'+item.ramGB+'GB RAM</span>':''}
      \${item.recommended?'<span class="chip accent">⭐ Recommended</span>':''}
    </div>
    <div class="card-actions">
      <button class="btn primary" onclick="storeInstall('\${item.id}', '\${item.method}', '\${item.installCmd||''}', this)">Install</button>
      \${item.url?'<button class="btn" onclick="window.open(\''+item.url+'\',\'_blank\')">Info ↗</button>':''}
    </div>
  </div>\`).join('') || '<div style="color:var(--muted);padding:40px;text-align:center">No items match</div>'
}

function filterStore(q) { renderStore(q) }
function setStoreFilter(f, el) {
  storeFilter = f
  document.querySelectorAll('#store-filters .chip').forEach(c => c.classList.remove('accent'))
  el.classList.add('accent')
  renderStore(document.getElementById('store-search').value)
}

async function storeInstall(id, method, cmd, btn) {
  if (!confirm('Install ' + id + '? This will run: ' + (cmd||method))) return
  btn.textContent='⋯'; btn.disabled=true
  try {
    const r = await fetch(E+'/installer/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,method,cmd})})
    const d = await r.json()
    toast(d.message || '✓ Installed ' + id)
    btn.textContent='✓ Done'
  } catch(e) { toast('Install failed: '+e.message,'err'); btn.textContent='Install'; btn.disabled=false }
}

// ── Models ────────────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const r = await fetch(O + '/api/tags')
    if (!r.ok) { document.getElementById('models-grid').innerHTML = '<div style="color:var(--muted)">Ollama not reachable</div>'; return }
    const d = await r.json()
    const models = d.models || []
    document.getElementById('models-grid').innerHTML = models.length ? models.map(m => {
      const caps = inferCaps(m.name)
      return \`<div class="card">
        <div class="card-header"><div class="card-icon">\${catIcon(inferCategory(m.name))}</div>
          <div><div class="card-title">\${m.name}</div><div class="card-sub">\${formatSize(m.size)} on disk</div></div>
        </div>
        <div class="chips">\${caps.map(c=>'<span class="chip">'+c+'</span>').join('')}</div>
        <div class="card-actions">
          <button class="btn" onclick="discBench('\${m.name}', this)">⏱ Benchmark</button>
          <button class="btn danger" onclick="removeModel('\${m.name}')">Remove</button>
        </div>
      </div>\`
    }).join('') : '<div style="color:var(--muted)">No models installed. Visit the Store or Discovery to install models.</div>'
    // Populate bench model select
    const sel = document.getElementById('bench-model')
    sel.innerHTML = models.map(m=>'<option>'+m.name+'</option>').join('')
  } catch {}
}

function inferCategory(name) {
  const n = name.toLowerCase()
  if (/llava|vision|moondream|minicpm|video/.test(n)) return 'vision'
  if (/code|coder|deepseek/.test(n)) return 'code'
  if (/embed/.test(n)) return 'embedding'
  return 'text'
}
function inferCaps(name) {
  const n = name.toLowerCase(); const c = ['chat']
  if (/code|coder/.test(n)) c.push('code')
  if (/llava|vision|moondream/.test(n)) c.push('vision')
  if (/embed/.test(n)) c.push('embeddings')
  return c
}
function formatSize(b) { if (!b) return ''; const gb=b/1e9; return gb>=1 ? gb.toFixed(1)+'GB' : Math.round(b/1e6)+'MB' }
function catIcon(cat) { return {text:'💬',code:'💻',vision:'👁️',video:'🎬',audio:'🎵',music:'🎼',embedding:'📐',agent:'🤖'}[cat]||'🤖' }

async function removeModel(name) {
  if (!confirm('Remove ' + name + '?')) return
  await fetch(O+'/api/delete',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})
  toast('Removed '+name); loadModels()
}

// ── Router ────────────────────────────────────────────────────────────────────
function loadRouter() {
  const rules = [
    ['Simple chat','Ollama (local, fast, free)','📥 Use:  /empire-assistant/ai/complete'],
    ['Coding','Qwen Coder → Claude if hard','🧠 Claude handles architecture'],
    ['Research','Gemini (long-context)','📖 128K context window'],
    ['Copywriting','Ollama / Neural-Chat','✍️ Free, fast, capable'],
    ['Image generation','ComfyUI / A1111 → DALL·E','🎨 Local first'],
    ['Video generation','ComfyUI/LTX → Cloud','🎬 GPU-bound'],
    ['Speech → Text','Whisper.cpp / Whisper-py','🎤 Fully offline'],
    ['Text → Speech','Piper → Kokoro → ElevenLabs','🔊 Piper is fastest'],
    ['Computer tasks','Goose','🦆 Local dev agent'],
  ]
  document.getElementById('routing-table').innerHTML = '<tr><th>Task</th><th>Engine</th><th>Notes</th></tr>' +
    rules.map(([t,e,n])=>'<tr><td>'+t+'</td><td><span style="color:var(--cyan)">'+e+'</span></td><td style="color:var(--muted)">'+n+'</td></tr>').join('')
}

async function testRouter() {
  const task = document.getElementById('route-task').value
  const res = document.getElementById('route-result')
  const textTasks = ['code','research','copy','summary','classification']
  const mediaTasks = ['video-gen','image-gen','stt','tts']
  res.style.color = 'var(--muted)'
  res.textContent = 'Routing...'
  try {
    if (mediaTasks.includes(task)) {
      const r = await fetch(E+'/media-engine/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:task})})
      const d = await r.json()
      res.innerHTML = d.engine ? '✅ <strong>'+d.engine.name+'</strong> — '+d.engine.description : '❌ No engine available. ' + (d.hint||'')
    } else {
      const providers = {code:'Claude → Qwen Coder (Ollama) → OpenAI',research:'Gemini → Claude → Ollama',copy:'Ollama → OpenAI → Claude',summary:'Ollama → Claude',classification:'Ollama → Claude'}
      res.innerHTML = '✅ Route: <strong>'+( providers[task]||'Ollama')+'</strong>'
    }
    res.style.color = 'var(--text)'
  } catch { res.textContent = 'Could not reach Empire OS'; res.style.color='var(--red)' }
}

// ── Benchmarks ────────────────────────────────────────────────────────────────
async function loadBenchmarks() {
  try {
    const r = await fetch(E+'/knowledge-base/benchmarks')
    const data = await r.json()
    const entries = Object.entries(data)
    if (!entries.length) { document.getElementById('bench-content').innerHTML='<div style="color:var(--muted)">No benchmarks yet. Install models and run benchmark.</div>'; return }
    const sorted = entries.sort((a,b) => ((b[1] as any).tps||0) - ((a[1] as any).tps||0))
    document.getElementById('bench-content').innerHTML = '<table class="table"><tr><th>Model</th><th>Tokens/sec</th><th>Total ms</th><th>Tested</th></tr>' +
      sorted.map(([id,d]:any) => '<tr><td><strong>'+id+'</strong></td><td style="color:var(--green)"><strong>'+( d.tps||'?')+'</strong></td><td>'+( d.ms||'?')+'</td><td style="color:var(--muted)">'+(d.testedAt?new Date(d.testedAt).toLocaleDateString():'')+'</td></tr>').join('') +
      '</table>'
  } catch {}
}

async function runBenchmark() {
  const model = document.getElementById('bench-model').value
  if (!model) return
  const el = document.getElementById('bench-running')
  el.textContent = 'Running benchmark on ' + model + '...'
  try {
    const r = await fetch(E+'/discovery/benchmark',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model})})
    const d = await r.json()
    el.textContent = '✓ Done: ' + (d.tokensPerSec||'?') + ' tokens/sec'
    toast('⚡ '+model+': '+(d.tokensPerSec||'?')+' tok/s')
    loadBenchmarks()
  } catch(e) { el.textContent='Error: '+e.message; el.style.color='var(--red)' }
}

// ── Media ─────────────────────────────────────────────────────────────────────
async function loadMedia() {
  try {
    const r = await fetch(E+'/media-engine/detect')
    const engines = await r.json()
    document.getElementById('media-grid').innerHTML = engines.map(e => \`<div class="card">
      <div class="card-header"><div class="card-icon">\${e.icon}</div>
        <div><div class="card-title">\${e.name}</div><div class="card-sub">\${e.local?'Local':'Cloud'} · \${e.ramGB?e.ramGB+'GB RAM':'No local RAM'}</div></div>
      </div>
      <div class="card-desc">\${e.description}</div>
      <div class="chips"><span class="chip \${e.available?'green':'red'}">\${e.available?'✓ Available':'✗ Not installed'}</span>\${!e.local?'<span class="chip cyan">☁ Cloud</span>':''}</div>
      \${!e.available && e.installHint ? '<div style="font-size:11px;color:var(--muted);margin-top:6px;padding:6px;background:var(--glass);border-radius:4px">'+e.installHint+'</div>' : ''}
    </div>\`).join('')
  } catch {}
}

async function routeMedia() {
  const cat = document.getElementById('media-task').value
  try {
    const r = await fetch(E+'/media-engine/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat})})
    const d = await r.json()
    document.getElementById('media-route-result').innerHTML = d.engine
      ? '✅ <strong>'+d.engine.icon+' '+d.engine.name+'</strong> — '+d.engine.description
      : '❌ No engine available. '+( d.hint||'')
  } catch {}
}

// ── Memory ────────────────────────────────────────────────────────────────────
async function loadMemory() {
  try {
    const r = await fetch(E+'/knowledge-base/entries')
    const entries = await r.json()
    document.getElementById('memory-grid').innerHTML = entries.slice(0,20).map(e => \`<div class="card">
      <div class="card-header">
        <div class="card-icon">\${{benchmark:'⚡',preference:'⚙️',workflow:'🔄',project:'📁',discovery:'🔭',note:'📝',failure:'⚠️'}[e.category]||'📦'}</div>
        <div><div class="card-title">\${e.title}</div><div class="card-sub">\${e.category} · \${new Date(e.createdAt).toLocaleDateString()}</div></div>
      </div>
    </div>\`).join('') || '<div style="color:var(--muted)">No entries yet</div>'
  } catch {}
}

async function searchMemory(q) {
  if (!q) { loadMemory(); return }
  try {
    const r = await fetch(E+'/knowledge-base/search?q='+encodeURIComponent(q), { headers:{'x-q':q} })
    const entries = await r.json()
    document.getElementById('memory-grid').innerHTML = entries.slice(0,20).map(e => \`<div class="card"><div class="card-header"><div class="card-title">\${e.title}</div></div></div>\`).join('') || '<div style="color:var(--muted)">No results</div>'
  } catch {}
}

// ── Health ────────────────────────────────────────────────────────────────────
async function loadHealth() {
  try {
    const [svcRes, metRes] = await Promise.allSettled([
      fetch(E+'/health-monitor/status'), fetch(E+'/health-monitor/metrics')
    ])
    if (svcRes.status==='fulfilled' && svcRes.value.ok) {
      const svcs = await svcRes.value.json()
      document.getElementById('health-services').innerHTML = svcs.map(s => \`
        <div class="svc \${s.status==='online'?'ok':'down'}">
          <span style="font-size:16px">\${s.icon}</span>
          <div><div class="svc-name">\${s.name}</div><div class="svc-ping">\${s.status==='online'?(s.latencyMs+'ms'):s.repairHint}</div></div>
        </div>\`).join('')
    }
    if (metRes.status==='fulfilled' && metRes.value.ok) {
      const m = await metRes.value.json()
      document.getElementById('health-metrics').innerHTML = \`
        <div class="metric"><div class="metric-label"><span>RAM</span><span class="val">\${m.ram.usedGB.toFixed(1)}/\${m.ram.totalGB.toFixed(1)}GB (\${m.ram.usedPct}%)</span></div><div class="bar-bg"><div class="bar-fill \${m.ram.usedPct>85?'bar-r':m.ram.usedPct>70?'bar-y':'bar-a'}" style="width:\${m.ram.usedPct}%"></div></div></div>
        <div class="metric"><div class="metric-label"><span>CPU</span><span class="val">\${m.cpu.usagePct}%</span></div><div class="bar-bg"><div class="bar-fill \${m.cpu.usagePct>85?'bar-r':m.cpu.usagePct>70?'bar-y':'bar-g'}" style="width:\${m.cpu.usagePct}%"></div></div></div>
        \${m.disk?'<div class="metric"><div class="metric-label"><span>Disk</span><span class="val">'+m.disk.freeGB+'GB free ('+m.disk.usedPct+'%)</span></div><div class="bar-bg"><div class="bar-fill '+(m.disk.usedPct>90?'bar-r':m.disk.usedPct>75?'bar-y':'bar-g')+'" style="width:'+m.disk.usedPct+'%"></div></div></div>':''}\`
    }
  } catch {}
}

// ── AI Assistant ──────────────────────────────────────────────────────────────
let aiOpen = false

function toggleAssistant() {
  aiOpen = !aiOpen
  document.getElementById('ai-panel').className = 'ai-panel glass' + (aiOpen ? ' open' : '')
  if (aiOpen) document.getElementById('ai-input').focus()
}

async function sendMsg() {
  const inp = document.getElementById('ai-input')
  const msg = inp.value.trim(); if (!msg) return
  inp.value = ''
  const msgs = document.getElementById('ai-messages')
  msgs.innerHTML += '<div class="msg user">' + escHtml(msg) + '</div>'
  msgs.innerHTML += '<div class="msg thinking" id="thinking">Thinking...</div>'
  msgs.scrollTop = msgs.scrollHeight
  try {
    const r = await fetch(E+'/empire-assistant/agent/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: msg })
    })
    const d = await r.json()
    document.getElementById('thinking').remove()
    msgs.innerHTML += '<div class="msg assistant">' + escHtml(d.response||d.message||JSON.stringify(d)) + '</div>'
  } catch {
    document.getElementById('thinking').textContent = 'Error reaching Empire Assistant'
  }
  msgs.scrollTop = msgs.scrollHeight
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// ── Boot ──────────────────────────────────────────────────────────────────────
loadOverview()
refreshTopbar()
setInterval(refreshTopbar, 15000)
</script>
</body>
</html>`

export class EmpireDashboardModule implements EmpireModule {
  readonly moduleId = 'empire-dashboard'

  async init(_services: CoreServices, _config: Record<string, unknown>): Promise<void> {}

  async handleRequest(req: GatewayRequest): Promise<GatewayResponse> {
    const start = Date.now()
    return {
      status: 200, body: HTML, moduleId: this.moduleId,
      durationMs: Date.now() - start,
      headers: { 'Content-Type': 'text/html' },
    }
  }

  async handleEvent(): Promise<void> {}

  async health(): Promise<ModuleHealth> {
    return { status: 'healthy', moduleId: this.moduleId, uptime: process.uptime() }
  }

  async shutdown(): Promise<void> {}
}
