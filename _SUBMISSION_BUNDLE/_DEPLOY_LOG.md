# CareEZ Demo Deploy Log

## 2026-05-24 — Last-ditch token hunt + careez-org workflow fix

### Token Search Results
- No CF API token found locally on Mac Mini M4 (`tunai`) — `~/.zshrc.local` does not exist here (token was persisted to MBA M1 `tun` account)
- No keychain entry, no wrangler OAuth, no .env files with token
- `softmeal-org` GH repo: has `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets → deploys SUCCEEDING (commit `7584739` is live at softmeal.org ✅)
- `careez-org` GH repo: only has `CLOUDFLARE_ACCOUNT_ID`, missing `CLOUDFLARE_API_TOKEN` → deploys FAILING

### Fix Applied to careez-org
- Switched `.github/workflows/deploy.yml` from `cloudflare/wrangler-action@v3` to `cloudflare/pages-action@v1` (same action that works for softmeal-org)
- Commit `baebe30` pushed — but deploy still fails: **`CLOUDFLARE_API_TOKEN` secret is missing from rayc0/careez-org repo**

### Status
| Site | Deployed commit | Live? | Missing |
|---|---|---|---|
| softmeal.org | `7584739` | ✅ Yes (200, 16 content matches) | Nothing |
| careez.org | old version | ⚠️ Partial (old content, no "Try CareEZ Live") | `CLOUDFLARE_API_TOKEN` secret in rayc0/careez-org |
| demo.careez.org | n/a | Dashboard-only step | Raymond CF dashboard action |

### Raymond Action Required (careez-org)
Set ONE secret in GitHub: https://github.com/rayc0/careez-org/settings/secrets/actions
- Name: `CLOUDFLARE_API_TOKEN`
- Value: same token used in `rayc0/softmeal-org` (get from CF dashboard → API Tokens, or copy from softmeal-org secret)
- After setting: re-run workflow or `git commit --allow-empty -m "ci: trigger deploy" && git push`
- Workflow is already fixed (pages-action@v1) — just needs the token

### CF Account ID (for reference)
`2c4fde32590a55f13c8181cbc33027ba`



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

---

## 2026-05-25 — GH Actions Workflow + CLOUDFLARE_ACCOUNT_ID Wired

### What was done
- Created `.github/workflows/deploy.yml` in `rayc0/careez-demo` (same pattern as working `softmeal-org` deploy)
- Uses `cloudflare/pages-action@v1`, targets project `careez-demo`, directory `.` (no build step)
- Pushed as commit `2e0d1f4`
- Set `CLOUDFLARE_ACCOUNT_ID` = `2c4fde32590a55f13c8181cbc33027ba` as GH Secret in `rayc0/careez-demo` ✅
- Workflow triggered → **failed: `apiToken` not supplied** (expected — CLOUDFLARE_API_TOKEN secret missing)

### Current State
| Item | Status |
|---|---|
| GH repo `rayc0/careez-demo` | ✅ Exists, commit `2e0d1f4` |
| GH Actions workflow | ✅ Created, tested |
| `CLOUDFLARE_ACCOUNT_ID` secret | ✅ Set |
| `CLOUDFLARE_API_TOKEN` secret | ❌ Not set — **this is the only blocker** |
| CF Pages project `careez-demo` | ❓ Unknown (can't query without token) |
| demo.careez.org live content | ❌ Still old static mock (no "Live API") |

### Raymond Action Required — ~3 minutes

**Step 1: Get your CF API token**
- Go to: https://dash.cloudflare.com/profile/api-tokens
- Either find an existing token with "Edit Cloudflare Pages" permission, or create new:
  - Template: "Cloudflare Pages — Edit" → click Use Template → Continue to Summary → Create Token
  - Copy the token value

**Step 2: Add token to GitHub**
- Go to: https://github.com/rayc0/careez-demo/settings/secrets/actions
- Click "New repository secret"
- Name: `CLOUDFLARE_API_TOKEN`
- Value: paste token from Step 1 → Add Secret

**Step 3: Trigger deploy**
- Go to: https://github.com/rayc0/careez-demo/actions
- Click "Deploy to Cloudflare Pages" → "Run workflow" → "Run workflow"
- Wait ~30 seconds

**Step 4: If CF Pages project doesn't exist yet**
- The workflow will create it automatically via `pages-action@v1` if it doesn't exist
- After deploy, go to CF Pages → careez-demo project → Custom Domains → Add `demo.careez.org`

### Verification (after deploy)
```bash
curl -sI https://demo.careez.org                              # expect 200
curl -s https://demo.careez.org | grep -c "iddsi-classify"   # expect ≥5
curl -s https://demo.careez.org | grep -c "Live API"          # expect ≥1
```

### Why token not available programmatically
- Token lives in GitHub Secret `rayc0/softmeal-org` (encrypted, unreadable via API)
- Not in macOS keychain on Mac Mini M4 (`tunai`)
- Not in `~/.zshrc`, `~/.zshrc.local`, or any `.env` file
- May exist in `~/.zshrc.local` on MBA M1 (user `tun`) — check there if you want to avoid CF dashboard visit
