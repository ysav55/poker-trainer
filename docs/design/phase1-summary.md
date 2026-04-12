---
marp: true
theme: default
paginate: true
---

<style>
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --text: #e6edf3;
  --muted: #8b949e;
  --gold: #d4af37;
  --success: #3fb950;
  --error: #f85149;
  --warning: #d29922;
  --info: #58a6ff;
  --border: #30363d;
}

section {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 18px;
  padding: 48px;
  line-height: 1.6;
  border-bottom: 3px solid var(--gold);
}

h1, h2 { color: var(--gold); margin: 0; font-weight: 700; }
h1 { font-size: 40px; }
h2 { position: absolute; top: 36px; left: 48px; font-size: 28px; }
h2 + * { margin-top: 72px; }
h3 { color: var(--info); font-size: 20px; margin-top: 16px; }
strong { color: var(--info); }
em { color: var(--muted); font-style: normal; }

pre {
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.4;
}

table { width: 100%; border-collapse: collapse; font-size: 15px; }
th { background: var(--surface); color: var(--gold); padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border); }
td { padding: 8px 12px; border-bottom: 1px solid #21262d; }

section.lead { display: flex; flex-direction: column; justify-content: center; }
section.lead h1 { margin-bottom: 12px; }
section.lead p { font-size: 18px; color: var(--muted); }
</style>

<!-- _class: lead -->

# Phase 1 Complete
Foundation Layer — 4 commits shipped

---

## Color Tokens

`client/src/lib/colors.js` — single source of truth

<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px;">
  <div style="background: #060a0f; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">bgPrimary</div>
    <div style="font-size: 13px; color: #e6edf3; font-family: monospace;">#060a0f</div>
  </div>
  <div style="background: #0d1117; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">bgSurface</div>
    <div style="font-size: 13px; color: #e6edf3; font-family: monospace;">#0d1117</div>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">bgSurfaceRaised</div>
    <div style="font-size: 13px; color: #e6edf3; font-family: monospace;">#161b22</div>
  </div>
  <div style="background: #1c2128; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">bgSurfaceHover</div>
    <div style="font-size: 13px; color: #e6edf3; font-family: monospace;">#1c2128</div>
  </div>
</div>

<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px;">
  <div style="background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">gold</div>
    <div style="font-size: 16px; color: #d4af37; font-weight: bold;">■ #d4af37</div>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">success</div>
    <div style="font-size: 16px; color: #3fb950; font-weight: bold;">■ #3fb950</div>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">error</div>
    <div style="font-size: 16px; color: #f85149; font-weight: bold;">■ #f85149</div>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; padding: 12px; border-radius: 6px;">
    <div style="font-size: 11px; color: #8b949e;">warning</div>
    <div style="font-size: 16px; color: #d29922; font-weight: bold;">■ #d29922</div>
  </div>
</div>

---

## Toast System

`ToastContext` + `ToastContainer` — viewport-anchored notification stack

<div style="position: relative; background: #060a0f; border: 1px solid #30363d; border-radius: 8px; height: 280px; padding: 16px; margin-top: 16px;">
  <div style="color: #8b949e; font-size: 12px; margin-bottom: 8px;">↗ fixed top-4 right-4 z-50</div>
  
  <div style="position: absolute; top: 40px; right: 16px; display: flex; flex-direction: column; gap: 8px; width: 320px;">
    <div style="background: #161b22; border: 1px solid #3fb950; border-radius: 8px; padding: 12px 16px; display: flex; gap: 8px; align-items: flex-start;">
      <span style="color: #3fb950; font-size: 14px;">✓</span>
      <span style="color: #e6edf3; font-size: 14px; flex: 1;">Table created successfully</span>
      <span style="color: #6e7681; font-size: 12px;">✕</span>
    </div>
    <div style="background: #161b22; border: 1px solid #f85149; border-radius: 8px; padding: 12px 16px; display: flex; gap: 8px; align-items: flex-start;">
      <span style="color: #f85149; font-size: 14px;">⚠</span>
      <span style="color: #e6edf3; font-size: 14px; flex: 1;">Insufficient chips for buy-in</span>
      <span style="color: #6e7681; font-size: 12px;">✕</span>
    </div>
    <div style="background: #161b22; border: 1px solid #d4af37; border-radius: 8px; padding: 12px 16px; display: flex; gap: 8px; align-items: flex-start;">
      <span style="color: #d4af37; font-size: 14px;">ℹ</span>
      <span style="color: #e6edf3; font-size: 14px; flex: 1;">Student alert: VPIP regression</span>
      <span style="color: #6e7681; font-size: 12px;">✕</span>
    </div>
  </div>
</div>

*Max 5 visible · auto-dismiss 5s · click to dismiss*

---

## What Shipped

| Commit | File | What |
|---|---|---|
| `2c50b3f` | `lib/colors.js` | 16 semantic color tokens |
| `08fc134` | `package.json` | lucide-react v1.8.0 |
| `6c24061` | `contexts/ToastContext.jsx` | useToast hook + provider |
| `c31968b` | `components/ToastContainer.jsx` | Fixed toast stack UI |

**Tests:** 9 new tests, all passing

**Next:** Phase 2 — Sidebar + Layout (5 components, route rewiring)
