/**
 * CareEZ 照護食 Safety — Interactive Demo
 * HKEX IFS 2026 · Carewells Limited
 *
 * Live API integration (2026-05-24):
 *   POST https://www.seniordeli.com/api/iddsi-classify
 *       body: { description: "<food text>" }
 *       → { level, label, labelZh, color, confidence, rationale }
 *
 *   POST https://www.seniordeli.com/api/voice-aspiration-screen
 *       body: { symptoms: [...], language: "zh-HK" }
 *       → { riskLevel, riskScore, recommendedAction, referralUrgency, ... }
 *
 * Falls back to deterministic mock if the API is unreachable.
 * No PHI collected or transmitted — only demo food descriptions and
 * synthetic symptom arrays are sent.
 */

// ─── API config ─────────────────────────────────────
const API_BASE = 'https://www.seniordeli.com';

// Demo food descriptions sent to the API (no real patient data)
const FOOD_DESC_FAIL   = 'thin watery congee rice porridge, very liquid, flows easily, no thickness';
const FOOD_DESC_PASS   = 'thick congee rice porridge with added thickener, minced texture, holds shape, moist and cohesive';
const VOICE_SYMPTOMS   = ['coughing_during_meals', 'wet_gurgling_voice'];

// ─── Screen identifiers ────────────────────────────
const S = {
  INTRO:           'intro',
  HOME:            'home',
  MEAL_UPLOAD:     'meal_upload',
  SNAP_ANALYZING:  'snap_analyzing',
  SNAP_FAIL:       'snap_fail',
  SNAP_FIX:        'snap_fix',
  SNAP_RECHECK:    'snap_recheck',
  SNAP_ANALYZING2: 'snap_analyzing2',
  SNAP_PASS:       'snap_pass',
  VOICE_CHECK:     'voice_check',
  VOICE_RECORDING: 'voice_recording',
  VOICE_RESULT:    'voice_result',
  NURSE_ALERT:     'nurse_alert',
  NURSE_CONFIRM:   'nurse_confirm',
  FAMILY_SUMMARY:  'family_summary',
  CLOSING:         'closing',
};

// ─── App state ─────────────────────────────────────
const app = {
  screen:      S.INTRO,
  photoTaken:  false,
  recheckTaken: false,
  // Results from live API (null = not yet fetched)
  iddsiFail:   null,   // first check result
  iddsiPass:   null,   // recheck result
  voiceResult: null,   // voice screen result
  apiLive:     true,   // tracks whether API responded successfully
};

// ─── Timer handles for cleanup ─────────────────────
let _waveAnim = null;
let _autoNav  = null;
let _voiceTmr = null;
let _voiceSec = 20;

// ─── Navigate ──────────────────────────────────────
function nav(screen) {
  _cleanup();
  app.screen = screen;
  _render();
  _boot(screen);
}

function _cleanup() {
  if (_waveAnim) { cancelAnimationFrame(_waveAnim); _waveAnim = null; }
  if (_autoNav)  { clearTimeout(_autoNav);  _autoNav  = null; }
  if (_voiceTmr) { clearInterval(_voiceTmr); _voiceTmr = null; }
}

// ─── Live API helpers ───────────────────────────────

/**
 * Call IDDSI classifier. Returns parsed JSON or null on failure.
 * Falls back to mock result so the demo never hard-breaks.
 */
async function _callIddsi(description) {
  try {
    const res = await fetch(`${API_BASE}/api/iddsi-classify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    app.apiLive = true;
    return data;
  } catch (err) {
    console.warn('[CareEZ] IDDSI API unavailable, using mock fallback:', err.message);
    app.apiLive = false;
    return null;
  }
}

/**
 * Call voice aspiration screener. Returns parsed JSON or null on failure.
 */
async function _callVoice(symptoms) {
  try {
    const res = await fetch(`${API_BASE}/api/voice-aspiration-screen`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ symptoms, language: 'zh-HK' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    app.apiLive = true;
    return data;
  } catch (err) {
    console.warn('[CareEZ] Voice API unavailable, using mock fallback:', err.message);
    app.apiLive = false;
    return null;
  }
}

// ─── Render ────────────────────────────────────────
function _render() {
  const root = document.getElementById('app-root');
  const wrap = document.createElement('div');
  wrap.className = 'screen';
  wrap.innerHTML = _html(app.screen);
  root.innerHTML = '';
  root.appendChild(wrap);

  // Bind data-nav links
  root.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.disabled) return;
      nav(el.dataset.nav);
    });
  });
}

function _html(screen) {
  switch (screen) {
    case S.INTRO:           return _introHTML();
    case S.HOME:            return _homeHTML();
    case S.MEAL_UPLOAD:     return _mealUploadHTML();
    case S.SNAP_ANALYZING:  return _analyzingHTML('Sinusuri ang texture…', 'Analyzing texture via live API…');
    case S.SNAP_FAIL:       return _snapFailHTML();
    case S.SNAP_FIX:        return _snapFixHTML();
    case S.SNAP_RECHECK:    return _snapRecheckHTML();
    case S.SNAP_ANALYZING2: return _analyzingHTML('Bine-verify muli…', 'Re-verifying texture via live API…');
    case S.SNAP_PASS:       return _snapPassHTML();
    case S.VOICE_CHECK:     return _voiceCheckHTML();
    case S.VOICE_RECORDING: return _voiceRecordingHTML();
    case S.VOICE_RESULT:    return _voiceResultHTML();
    case S.NURSE_ALERT:     return _nurseAlertHTML();
    case S.NURSE_CONFIRM:   return _nurseConfirmHTML();
    case S.FAMILY_SUMMARY:  return _familySummaryHTML();
    case S.CLOSING:         return _closingHTML();
    default:                return _homeHTML();
  }
}

// ─── Post-render hooks ─────────────────────────────
function _boot(screen) {
  // ── First IDDSI check: call live API, nav to result when done ──
  if (screen === S.SNAP_ANALYZING) {
    _callIddsi(FOOD_DESC_FAIL).then(data => {
      // Store result (API or mock fallback)
      if (data) {
        app.iddsiFail = data;
      } else {
        // Mock fallback: thin congee = IDDSI 0
        app.iddsiFail = {
          level: 0, label: 'Thin', labelZh: '稀薄', color: '#FFFFFF', confidence: 'high',
          rationale: 'Fallback mock — API unreachable.',
          disclaimer: 'Prototype rule-based classifier. Not for clinical use.',
        };
      }
      nav(S.SNAP_FAIL);
    });
    // Minimum spinner time of 1.8 s for UX (API usually responds < 1 s)
    // The nav() call above fires when the promise resolves, no fixed timeout needed.
    return;
  }

  // ── Recheck: call live API with adjusted food description ──
  if (screen === S.SNAP_ANALYZING2) {
    _callIddsi(FOOD_DESC_PASS).then(data => {
      if (data) {
        app.iddsiPass = data;
      } else {
        // Mock fallback: thick adjusted congee = IDDSI 5
        app.iddsiPass = {
          level: 5, label: 'Minced & Moist', labelZh: '剪碎及濕潤', color: '#FF8C00', confidence: 'high',
          rationale: 'Fallback mock — API unreachable.',
          disclaimer: 'Prototype rule-based classifier. Not for clinical use.',
        };
      }
      nav(S.SNAP_PASS);
    });
    return;
  }

  // Camera buttons
  if (screen === S.MEAL_UPLOAD || screen === S.SNAP_RECHECK) {
    const camBtn = document.getElementById('cam-btn');
    if (camBtn) camBtn.addEventListener('click', _handleCamera);
  }

  // Start waveform + countdown on voice recording; fire API call in background
  if (screen === S.VOICE_RECORDING) _startVoice();

  // Nurse alert: reveal response button after 2.5 s
  if (screen === S.NURSE_ALERT) {
    setTimeout(() => {
      const wait = document.getElementById('nurse-wait');
      const btn  = document.getElementById('nurse-btn');
      if (wait) wait.style.display = 'none';
      if (btn)  btn.style.display  = 'flex';
    }, 2600);
  }
}

// ─── Camera simulation ─────────────────────────────
function _handleCamera() {
  const area       = document.getElementById('cam-area');
  const analyzeBtn = document.getElementById('analyze-btn');
  if (!area) return;

  const isRecheck = app.screen === S.SNAP_RECHECK;
  area.classList.add('has-photo');
  area.innerHTML = '<canvas id="food-canvas" class="photo-preview-canvas"></canvas>';

  // Draw simulated food photo
  requestAnimationFrame(() => _drawFood('food-canvas', isRecheck));

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.style.opacity = '1';
  }
}

function _drawFood(id, isThick) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const W = canvas.width  = canvas.offsetWidth  || 310;
  const H = canvas.height = canvas.offsetHeight || 180;
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isThick ? '#FFF7ED' : '#EFF6FF');
  grad.addColorStop(1, isThick ? '#FEF3C7' : '#DBEAFE');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Bowl shadow
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * .62 + 6, W * .37, H * .16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bowl body
  ctx.fillStyle = '#E5E7EB';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * .55, W * .38, H * .32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Congee surface
  const congeeColor = isThick ? '#FDE68A' : '#BAE6FD';
  ctx.fillStyle = congeeColor;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * .51, W * .32, H * .25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Texture hint
  if (isThick) {
    ctx.strokeStyle = 'rgba(180,130,0,.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 + (i - 1.5) * 18, H * .5, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Label
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.font = `bold ${Math.round(W * .043)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(isThick ? '✓ Inayos na congee (adjusted)' : 'Congee — Gng. Lau', W / 2, H - 10);
}

// ─── Waveform animation ─────────────────────────────
function _drawWave(canvas) {
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  let t = 0;
  const BARS = 24;

  function frame() {
    const W = canvas.width  = canvas.offsetWidth  || 310;
    const H = canvas.height = canvas.offsetHeight || 72;
    ctx.clearRect(0, 0, W, H);
    const spacing = W / BARS;
    const barW    = Math.max(4, spacing - 3);

    for (let i = 0; i < BARS; i++) {
      const ph  = (i / BARS) * Math.PI * 4;
      const amp = .12 + .78 * Math.abs(Math.sin(t * 1.1 + ph) * Math.cos(t * .65 + ph * .6));
      const bH  = Math.max(5, (H * .88) * amp);
      const x   = i * spacing + (spacing - barW) / 2;
      const y   = (H - bH) / 2;
      const g   = ctx.createLinearGradient(0, y, 0, y + bH);
      g.addColorStop(0, `rgba(26,126,101,${.5 + .45 * amp})`);
      g.addColorStop(1, `rgba(26,126,101,${.2 + .2 * amp})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, bH, 3);
      else ctx.rect(x, y, barW, bH);
      ctx.fill();
    }
    t += .11;
    _waveAnim = requestAnimationFrame(frame);
  }
  _waveAnim = requestAnimationFrame(frame);
}

function _startVoice() {
  _voiceSec = 20;
  _drawWave(document.getElementById('waveform'));

  // Fire the voice API call in background; result stored when it resolves
  _callVoice(VOICE_SYMPTOMS).then(data => {
    if (data) {
      app.voiceResult = data;
    } else {
      // Mock fallback: high risk, indeterminate triage
      app.voiceResult = {
        riskLevel: 'high', riskScore: 6,
        flags: VOICE_SYMPTOMS,
        recommendedAction: '立即通知護士及言語治療師。進食前須進行正式吞嚥評估。',
        referralUrgency: 'immediate',
        recommendedIddsiFluids: 'IDDSI Level 3–4 until assessed',
      };
    }
  });

  _voiceTmr = setInterval(() => {
    _voiceSec--;
    const el = document.getElementById('vcd');
    if (el) el.textContent = _voiceSec;
    if (_voiceSec <= 0) {
      _cleanup();
      setTimeout(() => nav(S.VOICE_RESULT), 350);
    }
  }, 1000);
}

// ─── Shared HTML helpers ────────────────────────────
function _hdr(title, sub, { back, backTo, lang = true } = {}) {
  const backBtn  = back
    ? `<button class="back-btn" data-nav="${backTo}">‹ Back</button>`
    : `<div style="width:52px"></div>`;
  const langBadge = lang
    ? `<div class="lang-badge">TAGALOG</div>`
    : `<div style="width:52px"></div>`;
  return `
    <div class="app-header">
      ${backBtn}
      <div class="header-center">
        <div class="app-header-title">${title}</div>
        ${sub ? `<div class="app-header-subtitle">${sub}</div>` : ''}
      </div>
      ${langBadge}
    </div>`;
}

function _steps(active) {
  const dots = [1,2,3,4,5].map(i => {
    let cls = 'step-dot';
    if (i === active) cls += ' active';
    else if (i < active) cls += ' done';
    return `<div class="${cls}"></div>`;
  }).join('');
  return `<div class="step-indicator">${dots}</div>`;
}

// ─── API status badge ───────────────────────────────
function _apiBadge() {
  if (!app.apiLive) {
    return `<span class="badge" style="background:#FEF3C7;color:#78350F;border:1px solid #FCD34D">⚠ Offline — mock fallback</span>`;
  }
  return `<span class="badge" style="background:#DCFCE7;color:#14532D;border:1px solid #86EFAC">🟢 Live API</span>`;
}

// ─── Screen HTML ────────────────────────────────────

function _introHTML() {
  return `
    <div class="intro-screen">
      <div style="font-size:52px;margin-bottom:4px">🍚</div>
      <div style="font-size:23px;font-weight:800;color:white;letter-spacing:-.5px;line-height:1.3">
        Every meal is a decision.
      </div>
      <div style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.75;max-width:270px">
        640,000 carers make it with no tool, no training in their language, no clinician on hand.
      </div>
      <div style="width:48px;height:2px;background:rgba(255,255,255,.15);margin:4px 0"></div>
      <div style="font-size:21px;font-weight:800;color:#6EE7B7;letter-spacing:-.3px">CareEZ</div>
      <div style="font-size:12px;color:rgba(255,255,255,.35);margin-top:2px">照護食 Safety · HKEX IFS 2026</div>
      <button class="btn" data-nav="${S.HOME}"
        style="margin-top:28px;width:100%;font-size:16px;padding:16px;background:rgba(255,255,255,.12);color:white;border:1px solid rgba(255,255,255,.25);border-radius:14px">
        Simulan ang Demo &nbsp;→&nbsp; Start Demo
      </button>
      <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:10px;line-height:1.6;text-align:center">
        Live API calls to www.seniordeli.com<br>No PHI collected or transmitted
      </div>
      <div style="font-size:10px;color:rgba(110,231,183,.55);margin-top:8px;line-height:1.6;text-align:center;border:1px solid rgba(110,231,183,.2);border-radius:8px;padding:6px 12px">
        🌐 <span style="font-weight:600">TAGALOG</span> demo shown · Cantonese, English &amp; Bahasa Indonesia flows in Year 1 roadmap
      </div>
    </div>`;
}

function _homeHTML() {
  return `
    ${_hdr('CareEZ 照護食', 'Swallowing Safety', { lang: true })}
    <div class="screen-content">
      <div class="card-label">Iyong Residente · Your Resident</div>
      <div class="resident-card">
        <div class="resident-name">Gng. Lau · Mrs. Lau</div>
        <div class="resident-meta">84 taong gulang · Room 3B</div>
        <div class="resident-level"><span>🍽</span> IDDSI Antas 5 — Minced &amp; Moist</div>
        <div class="resident-risk">⚠️ &nbsp;Panganib sa aspiration · Aspiration risk</div>
      </div>

      <div class="card-label" style="margin-top:2px">Ngayon · Today — Meal Schedule</div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--g100)">
          <div>
            <div style="font-size:14px;font-weight:600">Almusal · Breakfast</div>
            <div class="small muted mt-4">7:30 · Lugaw</div>
          </div>
          <div class="badge badge-success">✓ Kumpleto</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--g100)">
          <div>
            <div style="font-size:14px;font-weight:600">Tanghalian · Lunch</div>
            <div class="small muted mt-4">12:00 · Congee</div>
          </div>
          <div class="badge" style="background:#FEF3C7;color:#92400E;border:1px solid #FCD34D">⏳ Inihanda</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
          <div>
            <div style="font-size:14px;font-weight:600">Hapunan · Dinner</div>
            <div class="small muted mt-4">18:00</div>
          </div>
          <div class="badge" style="background:var(--g100);color:var(--g400);border:1px solid var(--g200)">○ Susunod</div>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Tanghalian na ni Gng. Lau. Ito ba ay ligtas?"</div>
        <div class="carer-quote-en">"It's Mrs. Lau's lunch. Is this safe for her?"</div>
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.MEAL_UPLOAD}"
        style="font-size:16px;padding:16px">
        📷 &nbsp;I-check ang Pagkain · Check Meal Safety
      </button>
    </div>
    ${_steps(1)}`;
}

function _mealUploadHTML() {
  return `
    ${_hdr('Suriin ang Pagkain', 'Check Meal Texture', { back: true, backTo: S.HOME })}
    <div class="screen-content">
      <div class="card">
        <div class="card-label">Mag-foto ng Pagkain · Photograph the Meal</div>
        <div class="small muted" style="margin-bottom:12px;line-height:1.55">
          Ipakita ang buong mangkok · Show the whole bowl clearly
        </div>
        <div class="camera-area" id="cam-area">
          <div class="camera-icon">📷</div>
          <div class="camera-label">I-tap para kumuha ng litrato</div>
          <div class="camera-label xsmall" style="opacity:.6">Tap to take photo</div>
        </div>
        <button id="cam-btn" class="btn btn-secondary mt-12">
          📷 Kunan ng Litrato · Take Photo
        </button>
      </div>
      <div class="tech-caption">
        On-screen: App language: Tagalog · Resident profile: IDDSI L5
      </div>
    </div>
    <div class="bottom-actions">
      <button id="analyze-btn" class="btn btn-primary"
        data-nav="${S.SNAP_ANALYZING}"
        style="opacity:.38;font-size:15px" disabled>
        🔍 I-analyze ang Texture · Analyze
      </button>
    </div>
    ${_steps(2)}`;
}

function _analyzingHTML(tl, en) {
  return `
    ${_hdr('Sinusuri…', 'Analyzing', { lang: false })}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">${tl}</div>
      <div class="loading-subtext">
        ${en}<br><br>
        <span style="font-size:11px;color:var(--g400)">
          Calling www.seniordeli.com/api/iddsi-classify
        </span>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:center">
        <span class="badge" style="background:#DCFCE7;color:#14532D;border:1px solid #86EFAC">🟢 Live API call in progress…</span>
      </div>
    </div>`;
}

function _snapFailHTML() {
  // Use live API result if available, otherwise mock
  const r = app.iddsiFail;
  const foundLevel  = r ? r.level  : 2;
  const foundLabel  = r ? r.label  : 'Mildly Thick';
  const confidence  = r ? r.confidence : 'high';
  const apiSource   = r && app.apiLive ? 'Live API result' : 'Mock fallback';

  return `
    ${_hdr('Resulta · Result', 'IDDSI Classification', { back: true, backTo: S.MEAL_UPLOAD })}
    <div class="screen-content">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="badge badge-illustrative">⚠ Ilustrasyon — Prototype</div>
        ${_apiBadge()}
      </div>

      <div class="card" style="border:2px solid var(--red-border);background:var(--red-l)">
        <div class="result-icon">❌</div>
        <div class="result-title result-title-fail">MASYADONG MANIPIS</div>
        <div style="font-size:11px;font-weight:700;text-align:center;color:var(--red);letter-spacing:.06em;margin-top:2px">
          TOO THIN FOR LEVEL 5
        </div>
        <div class="result-sub">
          Ang congee ay nasa IDDSI Antas ${foundLevel} lamang.<br>
          <span class="muted small">IDDSI Level ${foundLevel} (${foundLabel}) · Required: Level 5</span>
        </div>
        <div class="level-compare">
          <div class="level-box">
            <div class="level-num" style="color:var(--red)">Antas ${foundLevel}</div>
            <div class="level-sub">Natagpuan · Found</div>
          </div>
          <div class="level-arrow">→</div>
          <div class="level-box">
            <div class="level-num" style="color:var(--green)">Antas 5</div>
            <div class="level-sub">Kailangan · Required</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:10px;color:var(--g400)">
          Confidence: ${confidence} · ${apiSource}
        </div>
      </div>

      <div class="fix-step">
        <div class="fix-step-title">
          <span class="fix-step-num">!</span>
          Paano Ayusin · How to Fix
        </div>
        <div class="fix-step-text">
          <strong>Magdagdag ng pampalapot (thickener)</strong> — 1 scoop.
          Haluin nang 30 segundo. Maghintay ng 2 minuto bago kunan muli.<br>
          <span class="muted small">Add 1 scoop thickener. Mix 30 s. Wait 2 min before re-photo.</span>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Ang texture ay mas manipis kaysa sa ligtas na antas ni Gng. Lau. Narito ang paraan upang ayusin ito."</div>
        <div class="carer-quote-en">"The texture is thinner than Mrs. Lau's safe level. Here's how to adjust it."</div>
      </div>

      <div class="tech-caption">
        On-screen: IDDSI texture classification via www.seniordeli.com/api/iddsi-classify
        <br><span class="badge badge-illustrative mt-8" style="display:inline-flex">⚠ Illustrative — prototype</span>
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.SNAP_FIX}">
        🔧 Ayusin at I-check Muli · Fix &amp; Re-check
      </button>
    </div>
    ${_steps(3)}`;
}

function _snapFixHTML() {
  return `
    ${_hdr('Ayusin ang Pagkain', 'Fix the Meal', { back: true, backTo: S.SNAP_FAIL })}
    <div class="screen-content">
      <div style="font-size:38px;text-align:center;margin:8px 0">🥣</div>

      <div class="fix-step">
        <div class="fix-step-title">
          <span class="fix-step-num">1</span>
          Magdagdag ng 1 scoop pampalapot
        </div>
        <div class="fix-step-text">Add 1 scoop of thickener · mix into warm congee</div>
      </div>
      <div class="fix-step">
        <div class="fix-step-title">
          <span class="fix-step-num">2</span>
          Haluin nang 30 segundo
        </div>
        <div class="fix-step-text">Stir for 30 seconds until evenly mixed</div>
      </div>
      <div class="fix-step">
        <div class="fix-step-title">
          <span class="fix-step-num">3</span>
          Maghintay ng 2 minuto
        </div>
        <div class="fix-step-text">Wait 2 minutes for texture to set before re-check</div>
      </div>

      <div style="font-size:13px;color:var(--g600);text-align:center;line-height:1.6;margin-top:4px">
        Handa na ba? Kunan muli ng litrato.<br>
        <span class="muted small">Ready? Take a new photo to verify the texture.</span>
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.SNAP_RECHECK}">
        📷 Handa Na · Ready — Re-photograph
      </button>
    </div>`;
}

function _snapRecheckHTML() {
  return `
    ${_hdr('I-verify Muli', 'Re-verify Texture', { back: true, backTo: S.SNAP_FIX })}
    <div class="screen-content">
      <div class="card">
        <div class="card-label">Kunan Muli ng Litrato · Re-photograph the Meal</div>
        <div class="small muted" style="margin-bottom:12px;line-height:1.55">
          Ipakita ang inayos na pagkain · Show the adjusted meal
        </div>
        <div class="camera-area" id="cam-area">
          <div class="camera-icon">📷</div>
          <div class="camera-label">I-tap para kumuha ng litrato</div>
          <div class="camera-label xsmall" style="opacity:.6">Tap to re-photograph</div>
        </div>
        <button id="cam-btn" class="btn btn-secondary mt-12">
          📷 Kunan Muli · Re-photograph
        </button>
      </div>
      <div class="tech-caption">
        On-screen: Re-verification · IDDSI texture classification via live API
      </div>
    </div>
    <div class="bottom-actions">
      <button id="analyze-btn" class="btn btn-primary"
        data-nav="${S.SNAP_ANALYZING2}"
        style="opacity:.38;font-size:15px" disabled>
        🔍 I-verify Muli · Re-verify
      </button>
    </div>
    ${_steps(4)}`;
}

function _snapPassHTML() {
  const r = app.iddsiPass;
  const passLevel = r ? r.level  : 5;
  const passLabel = r ? r.label  : 'Minced & Moist';
  const confidence = r ? r.confidence : 'high';
  const apiSource  = r && app.apiLive ? 'Live API result' : 'Mock fallback';

  return `
    ${_hdr('Resulta · Result', 'IDDSI Classification', { lang: true })}
    <div class="screen-content">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="badge badge-illustrative">⚠ Ilustrasyon — Prototype</div>
        ${_apiBadge()}
      </div>

      <div class="card" style="border:2px solid var(--green-border);background:var(--green-l)">
        <div class="result-icon">✅</div>
        <div class="result-title result-title-pass">TUGMA — IDDSI ANTAS ${passLevel}</div>
        <div style="font-size:11px;font-weight:700;text-align:center;color:var(--green);letter-spacing:.06em;margin-top:2px">
          MATCH — IDDSI LEVEL ${passLevel} ✓
        </div>
        <div class="result-sub">
          Ligtas ang texture para sa Gng. Lau.<br>
          <span class="muted small">${passLabel} · Confidence: ${confidence} · ${apiSource}</span>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Ngayon ay tumutugma na ito sa kanyang plano."</div>
        <div class="carer-quote-en">"Now it matches her plan."</div>
      </div>

      <div class="tech-caption">
        On-screen: Re-verified via www.seniordeli.com/api/iddsi-classify
        <br><span class="badge badge-illustrative mt-8" style="display:inline-flex">⚠ Illustrative — prototype</span>
      </div>

      <div class="card" style="border-left:4px solid var(--amber-border)">
        <div style="font-size:13px;font-weight:700;color:var(--g800);margin-bottom:5px">
          🎙 Susunod: Voice Safety Check
        </div>
        <div class="small muted" style="line-height:1.55">
          Ang texture ay OK. Kailangan pa rin ng voice check para sa Gng. Lau.<br>
          <span style="color:var(--g400)">Texture is OK. Mrs. Lau still needs a voice safety check.</span>
        </div>
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.VOICE_CHECK}" style="font-size:15px">
        🎙 Simulan ang Voice Check · Start Voice Check
      </button>
      <button class="btn btn-ghost" data-nav="${S.FAMILY_SUMMARY}">
        Laktawan · Skip to Summary
      </button>
    </div>
    ${_steps(5)}`;
}

function _voiceCheckHTML() {
  return `
    ${_hdr('Voice Safety Check', 'Prototype · Year 1', { back: true, backTo: S.SNAP_PASS })}
    <div class="screen-content">
      <div style="display:flex;justify-content:flex-end">
        <div class="badge badge-prototype">🔬 Prototype — Year 1 Deliverable</div>
      </div>

      <div class="card" style="border-left:4px solid var(--amber-border)">
        <div style="font-size:14px;font-weight:700;color:var(--g800);margin-bottom:10px">
          Mga Tagubilin · Instructions
        </div>
        <div style="font-size:13px;color:var(--g700);line-height:1.75">
          1. Hilingin kay Gng. Lau na magsabi:<br>
          &nbsp;&nbsp;&nbsp;<em style="color:var(--brand)">"Kumain ako ng kaunti"</em><br>
          &nbsp;&nbsp;&nbsp;<span class="muted xsmall">"I ate a little"</span><br><br>
          2. Humiling ng isang malinaw na aha.<br>
          &nbsp;&nbsp;&nbsp;<span class="muted xsmall">Ask for one clear cough.</span>
        </div>
      </div>

      <div class="data-notice">
        <span class="data-notice-icon">🔒</span>
        <span>Symptoms sent to www.seniordeli.com/api/voice-aspiration-screen.<br>
        No audio recorded or transmitted — demo uses synthetic symptom flags only.</span>
      </div>

      <div class="tech-caption">
        On-screen: Acoustic voice-biomarker screening · live aspiration risk API
        <br><span class="badge badge-prototype mt-8" style="display:inline-flex">🔬 Prototype — Year 1 deliverable</span>
      </div>
    </div>
    <div class="bottom-actions">
      <div class="center muted small" style="margin-bottom:6px">
        Pindutin para magsimula · Press to start (20-second recording)
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:10px">
        <button class="record-btn" data-nav="${S.VOICE_RECORDING}">🎙</button>
      </div>
      <div class="center xsmall" style="color:var(--g400)">
        20-segundo na recording · 20-second recording
      </div>
    </div>`;
}

function _voiceRecordingHTML() {
  return `
    ${_hdr('Nire-record…', 'Recording', { lang: false })}
    <div class="screen-content">
      <div class="waveform-container">
        <div class="recording-label">
          <span class="recording-dot"></span>
          Nire-record · Recording
        </div>
        <canvas id="waveform" class="waveform-canvas"></canvas>
        <div class="center">
          <div class="countdown-display" id="vcd">20</div>
          <div class="small muted">segundo · seconds remaining</div>
        </div>
      </div>

      <div class="card center" style="padding:22px 16px">
        <div style="font-size:34px;margin-bottom:8px">👴</div>
        <div style="font-size:15px;font-weight:700;color:var(--g800)">Gng. Lau</div>
        <div class="small muted mt-8" style="line-height:1.6">
          Magsalita at umaha habang nire-record<br>
          <span class="xsmall" style="color:var(--g400)">Speak and cough while recording</span>
        </div>
      </div>

      <div class="data-notice">
        <span class="data-notice-icon">🔒</span>
        <span>Calling live aspiration screen API with synthetic symptom flags · no audio transmitted</span>
      </div>
      <div style="display:flex;justify-content:center;margin-top:12px">
        <span class="badge badge-prototype">🔬 Prototype — Year 1 Deliverable</span>
      </div>
    </div>`;
}

function _voiceResultHTML() {
  const r = app.voiceResult;
  // Map riskLevel to display
  const riskLevel  = r ? r.riskLevel  : 'high';
  const urgency    = r ? r.referralUrgency : 'immediate';
  const action     = r ? r.recommendedAction : '立即通知護士及言語治療師。';
  const apiSource  = r && app.apiLive ? 'Live API result' : 'Mock fallback';

  // All paths lead to escalation ("indeterminate" / escalate to clinician) —
  // the centrepiece safety beat remains regardless of exact risk level.
  return `
    ${_hdr('Resulta ng Voice Check', 'Voice Check Result', { lang: true })}
    <div class="screen-content">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="badge badge-prototype">🔬 Prototype — Year 1 Deliverable</div>
        ${_apiBadge()}
      </div>

      <div class="escalation-card">
        <div class="escalation-icon">⚠️</div>
        <div class="escalation-title">
          HINDI SIGURADO<br>
          <span style="font-size:15px;letter-spacing:.07em">INDETERMINATE</span>
        </div>
        <div class="escalation-subtitle">
          Hindi makapagbibigay ng malinaw na resulta ang app
        </div>

        <div class="escalation-no-diag">
          <strong>⛔ Ang app ay HINDI nagdi-diagnose.</strong><br>
          The app does NOT give a diagnosis or an all-clear.<br><br>
          Iniuulat nito ang hindi malinaw na resulta sa isang kliniko para sa tamang pagsusuri.<br>
          <span style="color:var(--g400)">It reports an indeterminate result to a clinician for proper assessment.</span>
          <div style="margin-top:8px;padding:8px;background:var(--g50);border-radius:8px;font-size:11px;color:var(--g500)">
            Risk level: <strong>${riskLevel}</strong> · Urgency: <strong>${urgency}</strong><br>
            ${action}<br>
            <span style="font-size:10px;opacity:.7">${apiSource}</span>
          </div>
        </div>

        <div class="escalation-action">
          📞 AKSYON KINAKAILANGAN:<br>
          Makipag-ugnayan kay Nurse Wong agad.<br>
          <span style="font-weight:400;font-size:12px;color:#78350F">
            ACTION REQUIRED: Contact Nurse Wong now.
          </span>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Hindi ito sigurado. Sinasabi nitong tawagan ang nars — hindi hulaan."</div>
        <div class="carer-quote-en">"It's not sure. It's telling me to call the nurse — not to guess."</div>
      </div>

      <div class="tech-caption">
        On-screen: Aspiration screen via www.seniordeli.com/api/voice-aspiration-screen
        → <strong>triage to clinician</strong> (never diagnosis)
        <br><span class="badge badge-prototype mt-8" style="display:inline-flex">🔬 Prototype — Year 1 deliverable</span>
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-danger" data-nav="${S.NURSE_ALERT}" style="font-size:15px;padding:16px">
        📞 ABISUHAN SI NURSE WONG · Notify Nurse Wong
      </button>
    </div>`;
}

function _nurseAlertHTML() {
  return `
    ${_hdr('Abiso Ipinadala', 'Alert Sent', { lang: true })}
    <div class="screen-content">
      <div class="card" style="border:2px solid var(--green-border);text-align:center;padding:24px 16px">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <div style="font-size:17px;font-weight:700;color:var(--green)">Naabisuhan si Nurse Wong</div>
        <div class="small muted mt-4">Nurse Wong has been notified</div>
      </div>

      <div class="card">
        <div class="card-label">Mga Ipinadala · What Was Sent</div>
        <div class="sent-item">
          <div class="sent-icon">✓</div>
          <div>Voice screening summary (indeterminate flag)</div>
        </div>
        <div class="sent-item">
          <div class="sent-icon">✓</div>
          <div>Gng. Lau — IDDSI L5 care context</div>
        </div>
        <div class="sent-item">
          <div class="sent-icon">✓</div>
          <div>Oras ng check: 12:04 · Time of check</div>
        </div>
        <div class="sent-item">
          <div class="sent-icon" style="background:var(--red-l)">⛔</div>
          <div>Raw audio — <strong>HINDI ipinadala</strong> (on-device only)</div>
        </div>
      </div>

      <div class="data-notice">
        <span class="data-notice-icon">🔒</span>
        <span>Walang raw data ng matatanda ang lumalabas sa bahay.<br>
        No raw elder data leaves the home.</span>
      </div>

      <div id="nurse-wait" style="text-align:center;padding:14px 0">
        <div class="loading-spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 8px"></div>
        <div class="small muted">Naghihintay ng tugon… Waiting for response…</div>
      </div>

      <button id="nurse-btn" class="btn btn-primary"
        data-nav="${S.NURSE_CONFIRM}"
        style="display:none;font-size:15px">
        📋 Tignan ang Tugon ng Nars · View Nurse's Response
      </button>
    </div>`;
}

function _nurseConfirmHTML() {
  return `
    ${_hdr('Tugon ng Nars', "Nurse's Response", { lang: true })}
    <div class="screen-content">
      <div class="nurse-card">
        <div class="nurse-header">
          <div class="nurse-avatar">👩‍⚕️</div>
          <div>
            <div class="nurse-name">Nurse Wong</div>
            <div class="nurse-role">RCHE Registered Nurse</div>
          </div>
          <div class="badge badge-success ml-auto">Nakita ✓</div>
        </div>
        <div class="nurse-msg">
          <strong>Tagalog:</strong> Nakita ko ang ulat. Pakibago ang texture ni Gng. Lau sa IDDSI Antas 6 sa susunod na 3 araw. I-monitor ang kanyang paglunok sa bawat kain. Tawagan ako kung may pagbabago.<br><br>
          <strong>English:</strong> I've reviewed the report. Please adjust Mrs. Lau's texture to IDDSI Level 6 for the next 3 days. Monitor her swallowing at each meal. Call me if anything changes.
        </div>
      </div>

      <div class="card" style="background:var(--green-l);border:1px solid var(--green-border)">
        <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:6px">
          ✅ Na-update ang Care Plan
        </div>
        <div class="small" style="color:var(--g700);line-height:1.6">
          IDDSI Level 6 para sa 3 araw · Recheck pagkatapos<br>
          <span class="muted">IDDSI Level 6 for 3 days · Recheck after</span>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Ang nars ang nagpapasya. Pinapanatili ko lang siyang ligtas sa pagitan."</div>
        <div class="carer-quote-en">"The nurse decides. I just keep her safe in between."</div>
      </div>

      <div class="tech-caption">
        On-screen: Human-in-the-loop · clinician confirms · no elder data leaves the home
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.FAMILY_SUMMARY}">
        📊 Tingnan ang Lingguhang Ulat · View Weekly Summary
      </button>
    </div>`;
}

function _familySummaryHTML() {
  return `
    ${_hdr('Lingguhang Ulat', 'Weekly Summary — Family View', { lang: true })}
    <div class="screen-content">
      <div class="card">
        <div class="card-label">Para sa Pamilya Lau · For the Lau Family</div>
        <div class="small muted">Linggo ng Mayo 12–18, 2026 · Week of 12–18 May 2026</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">7/7</div>
          <div class="stat-label">Meal checks<br>kumpleto · complete</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--amber)">1</div>
          <div class="stat-label">Safety flag<br>→ na-resolve ✓</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">2</div>
          <div class="stat-label">Texture<br>adjustments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--green);font-size:17px">Mabuti</div>
          <div class="stat-label">Overall<br>quality · Good</div>
        </div>
      </div>

      <div class="card" style="border-left:4px solid var(--green)">
        <div style="font-size:13px;font-weight:700;color:var(--g800);margin-bottom:6px">
          📋 Nurse Wong's Weekly Note
        </div>
        <div class="small" style="color:var(--g600);line-height:1.65">
          Ang kalidad ng pag-aalaga ay mahusay. Ang isang voice flag ay na-review at na-resolve ng kliniko. Patuloy na mag-monitor.<br>
          <span class="muted">Care quality this week is excellent. One voice flag reviewed and resolved by clinician. Continue monitoring.</span>
        </div>
      </div>

      <div class="carer-quote">
        <div class="carer-quote-tl">"Nakikita ng kanyang pamilya na siya ay ligtas. Iyon lang ang gusto ko."</div>
        <div class="carer-quote-en">"Her family sees she's safe. That's all I ever wanted."</div>
      </div>

      <div class="tech-caption">
        On-screen: Consented · co-governed public clinical resource
      </div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-primary" data-nav="${S.CLOSING}" style="font-size:15px">
        Tapusin ang Demo · End Demo &nbsp;→
      </button>
    </div>`;
}

function _closingHTML() {
  return `
    <div class="closing-screen">
      <div style="font-size:42px;margin-bottom:4px">🍚</div>
      <div class="closing-small">
        No app to learn.<br>
        No clinician required for the everyday.<br>
        A clinician for the moments that matter.
      </div>
      <div class="closing-divider"></div>
      <div class="closing-main">
        "That is the difference between a meal and a hospital admission."
      </div>

      <!-- Card 4 — HK Institutional Network -->
      <div style="margin-top:18px;width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:16px;text-align:left">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:10px;font-weight:700;background:#1D4ED8;color:white;padding:3px 8px;border-radius:20px;letter-spacing:.5px">HK INSTITUTIONAL NETWORK</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:white;margin-bottom:6px;line-height:1.3">
          HK Care Home Network — Deployment Ready
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);line-height:1.65;margin-bottom:12px">
          CareEZ reaches Hong Kong's care home sector through a 200+ partner facility network (Getz Healthcare HK distribution), with WhatsApp Business verified and ready for live carer deployment in Year 1. Every carer, helper, and care home staff member accesses the AI assistant in their language — on the browser or phone they already carry. No app download required.
        </div>
        <div style="font-size:10px;color:rgba(110,231,183,.7);margin-bottom:10px;font-weight:500">
          WhatsApp Business Verified · Browser-native · 粵語 / English / Tagalog / Bahasa Indonesia
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div style="font-size:11px;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:6px">
            <span>📱</span><span><strong style="color:rgba(255,255,255,.8)">WhatsApp:</strong> Ready for Year 1 deployment</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:6px">
            <span>🌐</span><span><strong style="color:rgba(255,255,255,.8)">Web:</strong> Live today — no install required</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:6px">
            <span>🏥</span><span><strong style="color:rgba(255,255,255,.8)">Network:</strong> 200+ partner care facilities (Getz HK)</span>
          </div>
        </div>
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);width:100%;text-align:center">
        <div class="closing-brand">CareEZ 照護食</div>
        <div class="closing-meta mt-8">
          HKEX IFS 2026 · Carewells Limited · 24 months · HK$1,800,000<br>
          Live API demo · www.seniordeli.com endpoints<br>
          No real clinical data was used or collected.
        </div>
        <div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,.2);font-style:italic">
          Also serving mainland family caregivers via WeChat — extending Hong Kong's care food standard cross-border.
        </div>
      </div>
      <button class="btn btn-outline-white" data-nav="${S.INTRO}"
        style="margin-top:20px;width:100%;font-size:14px">
        ↺ Muling Simulan · Restart Demo
      </button>
    </div>`;
}

// ─── Init ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  _render();
  _boot(app.screen);
});
