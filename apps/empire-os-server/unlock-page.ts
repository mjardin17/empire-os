/** The "Empire OS is locked" page served at /unlock when EMPIRE_API_KEY is set. */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function unlockPage(opts: { next: string; error?: string; unlocked?: boolean }): string {
  const body = opts.unlocked
    ? `<p class="ok">This browser is unlocked.</p>
       <p><a href="/empire-dashboard/">Open the dashboard</a></p>
       <form method="post" action="/lock"><button type="submit" class="secondary">Lock this browser</button></form>`
    : `<p>This Empire OS server needs its key (<code>EMPIRE_API_KEY</code> in <code>apps/empire-os-server/.env</code>).
       Enter it once; this browser remembers it for 30 days.</p>
       ${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ''}
       <form method="post" action="/unlock">
         <input type="hidden" name="next" value="${esc(opts.next)}">
         <input type="password" name="key" placeholder="Empire key" autocomplete="current-password" autofocus required>
         <button type="submit">Unlock</button>
       </form>`
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Empire OS — locked</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#e2e8f0;font:14px/1.5 ui-monospace,Menlo,monospace}
  .card{width:min(440px,90vw);background:#18181b;border:1px solid #27272a;border-radius:12px;padding:28px}
  h1{font-size:18px;margin:0 0 12px} code{color:#a5b4fc}
  input{width:100%;box-sizing:border-box;margin:8px 0 12px;padding:10px;background:#09090b;border:1px solid #3f3f46;border-radius:8px;color:#e2e8f0;font:inherit}
  button{width:100%;padding:10px;border:0;border-radius:8px;background:#059669;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  button.secondary{background:#27272a;margin-top:8px} a{color:#34d399}
  .err{color:#fca5a5}.ok{color:#6ee7b7}
</style></head>
<body><div class="card" data-testid="unlock-card"><h1>🔒 Empire OS is locked</h1>${body}</div></body></html>`
}
