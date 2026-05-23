# CareEZ Demo Deploy Log

## 2026-05-24 — Live API Deploy Attempt

### Objective
Replace static mock at demo.careez.org with live seniordeli.com API-wired version.

### Investigation

| Check | Result |
|---|---|
| `curl -sI https://demo.careez.org` | 200 OK, served via Cloudflare |
| CF Pages project listing | BLOCKED — no CLOUDFLARE_API_TOKEN set; wrangler not authenticated |
| `gh repo list rayc0 | grep careez` | Only `rayc0/careez-org` exists (single-file landing page, NOT the demo) |
| Demo DNS | Resolves via Cloudflare CDN — CF Pages direct upload (no connected Git repo found) |
| Current demo content | Static mock, `style.css` + `app.js` loaded separately — separate CF Pages project from careez-org |

### Action Taken

1. Created new GitHub repo: **https://github.com/rayc0/careez-demo** (public)
2. Pushed `~/Projects/careez-demo/` (commit `ec76740`) — contains:
   - `index.html` — mobile-frame demo UI with "Live API" badge
   - `style.css` — styling
   - `app.js` — calls `https://www.seniordeli.com/api/iddsi-classify` and `/api/voice-aspiration-screen` (17 live API references, 5 `iddsi-classify` references)

### BLOCKER — Raymond Action Required

**CF Pages has no API token available** — cannot list projects or trigger deploy programmatically.

Raymond needs to do ONE of these (2 minutes in CF dashboard):

**Option A — Reconnect existing CF Pages project to new repo (recommended):**
1. Go to https://dash.cloudflare.com → Pages
2. Find the project serving demo.careez.org (likely named `careez-demo` or similar)
3. Settings → Builds & Deployments → Connect to Git → select `rayc0/careez-demo` → Save
4. Trigger a deploy → done

**Option B — Create new CF Pages project:**
1. Go to https://dash.cloudflare.com → Pages → Create project
2. Connect to Git → `rayc0/careez-demo`, branch `main`, root `/`, no build command
3. After deploy: Settings → Custom Domains → Add `demo.careez.org`
4. (Remove custom domain from old project if applicable)

### Verification Commands (run after Raymond deploys)

```bash
curl -sI https://demo.careez.org   # expect 200
curl -s https://demo.careez.org | grep -c "iddsi-classify"   # expect ≥1
curl -s https://demo.careez.org | grep -c "Live API"   # expect ≥1
```

### CORS Check

The seniordeli.com API already returns `Access-Control-Allow-Origin: *` (confirmed from curl headers on demo.careez.org response). No CORS push to seniordeli-website needed.

### Status: PARTIAL — GitHub repo created and pushed; CF Pages reconnection is a Raymond dashboard step
