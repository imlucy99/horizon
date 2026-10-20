/* =========================================================
   JGVRP Speedometer HUD (layout horizontal)
   API (dipanggil dari game / CEF):
     setSpeed(m/s)            setRPM(0.0 - 1.0)
     setFuel(0-1 | 0-100)     setHealth(0-1 | 0-1000)   -> ENGINE HEALTH
     setGear(n)               setHeadlights(0 off | 1 low | 2 high)
     setSeatbelts(bool)       setEngine(bool)
     updateLockStatus(state)  setOdometer(miles)
     setOil(psi 0-100 | null) -> opsional, kalau tidak dipanggil oil dihitung otomatis
   ========================================================= */

const MPS_TO_MPH = 2.236936;
const MAX_RPM = 8;          // skala tachometer (x1000)
const REDLINE = 7;          // mulai zona merah (x1000)
const OIL_MAX = 100;        // skala oil pressure (psi)
const FUEL_N = 20;          // jumlah interval tick skala FUEL
const ENG_N = 20;           // jumlah interval tick skala ENGINE

const NOOP_EL = document.createElement('div');   // pengaman kalau ada elemen yang dihapus dari HTML
const $ = (id) => document.getElementById(id) || NOOP_EL;
const elHud = $('hud');
const svg = $('dial');

// ---------- Helper Parser (JGRP) ----------
function isLockedState(val) {
    return val === true || val === 1 || val === "1" || val === "true" || val === 2 || val === "2";
}
function isTrueValue(val) {
    return val === true || val === 1 || val === "1" || val === "true";
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- Geometri ----------
const RX = 376, RY = 132;                 // pusat arc RPM
const RPM_START = 160, RPM_SWEEP = 220;   // derajat (0 = kanan, searah jarum jam)
const rpmAngle = (ratio) => RPM_START + clamp01(ratio) * RPM_SWEEP;

const OIL_X0 = 772, OIL_X1 = 916, OIL_Y = 118, OIL_N = 50;   // skala oil (garis tick horizontal)

const pol = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [(RX + r * Math.cos(t)).toFixed(2), (RY + r * Math.sin(t)).toFixed(2)];
};
function arcPath(r, a1, a2) {
    const [x1, y1] = pol(r, a1), [x2, y2] = pol(r, a2);
    return `M${x1} ${y1}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}
function segs(cls, x0, y, n, w, gap, h) {
    let s = '';
    for (let i = 0; i < n; i++) {
        s += `<rect class="seg ${cls}" x="${(x0 + i * (w + gap)).toFixed(1)}" y="${y}" width="${w}" height="${h}" rx="1.5"/>`;
    }
    return s;
}

// Skala tick bergaya OIL: angka di atas, garis tick di tengah (dipakai RPM, FUEL, OIL, ENGINE)
//   o = { cls, ncls, x0, x1, n, major, labels[], red(i), redNum(labelIdx) }
function scale(o) {
    const y = OIL_Y;
    let s = `<line x1="${o.x0}" y1="${y + 3}" x2="${o.x1}" y2="${y + 3}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
    for (let i = 0; i <= o.n; i++) {
        const x = (o.x0 + ((o.x1 - o.x0) * i) / o.n).toFixed(2);
        const maj = i % o.major === 0;
        const mid = o.major % 2 === 0 && i % (o.major / 2) === 0;
        const h = maj ? 14 : mid ? 10 : 7;
        s += `<line class="${o.cls}${o.red(i) ? ' rl' : ''}" x1="${x}" y1="${y - h}" x2="${x}" y2="${y}" stroke-width="${maj ? 2.2 : 1.3}"/>`;
        if (maj) {
            const li = i / o.major;
            s += `<text class="${o.ncls}${o.redNum(li) ? ' rl' : ''}" x="${x}" y="${y - 22}" text-anchor="middle">${o.labels[li]}</text>`;
        }
    }
    return s;
}

function buildDial() {
    let s = `
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a1c21"/><stop offset="0.1" stop-color="#0e0f12"/><stop offset="1" stop-color="#050506"/>
      </linearGradient>
      <linearGradient id="centerg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d0e11"/><stop offset="1" stop-color="#020203"/>
      </linearGradient>
      <linearGradient id="glowbar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <!-- bar bawah -->
    <path d="M210 170 L990 170 L952 232 L248 232 Z" fill="url(#panel)" stroke="rgba(255,255,255,0.1)" stroke-width="1.2" stroke-linejoin="round"/>
    <!-- rim atas -->
    <path d="M100 14 L1100 14 L1124 26 L76 26 Z" fill="#0b0c0e" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <!-- body utama (ujung lancip kiri & kanan) -->
    <path d="M70 26 L1130 26 L1186 104 L1130 182 L70 182 L14 104 Z" fill="url(#panel)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- panel tengah (speed) -->
    <path d="M490 26 L710 26 L690 208 L510 208 Z" fill="url(#centerg)" stroke="rgba(255,255,255,0.12)" stroke-width="1.2" stroke-linejoin="round"/>

    <!-- aksen putih -->
    <rect x="250" y="17" width="190" height="3" fill="url(#glowbar)" opacity="0.9"/>
    <rect x="760" y="17" width="190" height="3" fill="url(#glowbar)" opacity="0.9"/>
    <rect x="540" y="219" width="120" height="3" fill="url(#glowbar)" opacity="0.9"/>

    <!-- chevron merah kiri & kanan -->
    <path d="M58 46 L30 104 L58 162" fill="none" stroke="#ff2a2f" stroke-opacity="0.25" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 46 L30 104 L58 162" fill="none" stroke="#ff2a2f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M1142 46 L1170 104 L1142 162" fill="none" stroke="#ff2a2f" stroke-opacity="0.25" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M1142 46 L1170 104 L1142 162" fill="none" stroke="#ff2a2f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- garis merah miring di sisi panel speed -->
    <path d="M476 58 L494 152" fill="none" stroke="#ff2a2f" stroke-opacity="0.3" stroke-width="12" stroke-linecap="round"/>
    <path d="M476 58 L494 152" fill="none" stroke="#ff2a2f" stroke-width="4" stroke-linecap="round"/>
    <path d="M724 58 L706 152" fill="none" stroke="#ff2a2f" stroke-opacity="0.3" stroke-width="12" stroke-linecap="round"/>
    <path d="M724 58 L706 152" fill="none" stroke="#ff2a2f" stroke-width="4" stroke-linecap="round"/>

    <!-- pembatas tipis -->
    <path d="M262 60 L278 150" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>
    <path d="M938 60 L922 150" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>

    <!-- skala FUEL / RPM / OIL / ENGINE dibangun di bawah -->`;

    const label = (name, valId, valInit, x0, x1, sub) =>
        `<text class="lbl" x="${x0}" y="142">${name}</text>` +
        (sub ? `<text class="lbl sm" x="${x1}" y="142" text-anchor="end">${sub}</text>`
             : `<text id="${valId}" class="val" x="${x1}" y="143" text-anchor="end">${valInit}</text>`);

    // FUEL
    s += '<svg id="fuel-ico" class="ico" x="52" y="88" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>';
    s += scale({ cls: 'ft', ncls: 'fnum', x0: 96, x1: 240, n: FUEL_N, major: 10, labels: ['E', '1/2', 'F'],
                 red: (i) => i < 4, redNum: (k) => k === 0 });
    s += label('FUEL', 'fuel-val', '0%', 96, 240);

    // RPM (tanpa ikon, dipusatkan di antara pembatas)
    s += scale({ cls: 'rt', ncls: 'num', x0: 304, x1: 450, n: MAX_RPM * 5, major: 5, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8],
                 red: (i) => i >= REDLINE * 5, redNum: (k) => k >= REDLINE });
    s += label('RPM', '', '', 304, 450, 'x1000');

    // OIL
    s += '<svg id="oil-ico" class="ico" x="728" y="92" width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 10h4.2l1.3-2h2V6.5H8V5h6v1.5h-2V8h2.5l2 1.8 5-2.8 1 1.2-6.6 7.3H8.4L7 13H2.5zM20.2 14.6c0-.9 1.1-2.3 1.1-2.3s1.1 1.4 1.1 2.3c0 .6-.5 1.1-1.1 1.1s-1.1-.5-1.1-1.1z"/></svg>';
    s += scale({ cls: 'ot', ncls: 'onum', x0: OIL_X0, x1: OIL_X1, n: OIL_N, major: 10, labels: [0, 20, 40, 60, 80, 100],
                 red: (i) => i >= 40, redNum: (k) => k >= 4 });
    s += label('OIL', 'oil-val', '0 psi', OIL_X0, OIL_X1);

    // ENGINE
    s += '<svg id="eng-ico" class="ico" x="946" y="88" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M3 12h2.2M5.2 8.5h3.1V6.3h5v2.2h2.1l1.5 2h3.1v6.2h-2.2l-1.4 1.8H8.8l-3.6-3.6z"/></svg>';
    s += scale({ cls: 'et', ncls: 'enum', x0: 988, x1: 1132, n: ENG_N, major: 5, labels: [0, 25, 50, 75, 100],
                 red: (i) => i < 6, redNum: (k) => k === 0 });
    s += label('ENGINE', 'eng-val', '100%', 988, 1132);
    svg.innerHTML = s;
}
buildDial();

// ---------- Teks intro: ganti di index.html pada data-text="OBEY" ----------
(function () {
    const el = $('intro-text');
    if (el === NOOP_EL) return;
    const text = (el.dataset.text || el.textContent || 'OBEY').trim().toUpperCase();
    const chars = Array.from(text);
    el.textContent = '';
    chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.animationDelay = (0.3 + i * 0.09).toFixed(2) + 's';
        el.appendChild(span);
    });
    el.style.fontSize = Math.max(14, Math.min(34, Math.floor(180 / (chars.length * 0.95)))) + 'px';
})();

const rTicks = svg.querySelectorAll('.rt');
const rNums = svg.querySelectorAll('.num');
const oTicks = svg.querySelectorAll('.ot');
const fTicks = svg.querySelectorAll('.ft');
const eTicks = svg.querySelectorAll('.et');

// ---------- State ----------
const state = {
    mph: 0,
    rpm: 0,          // target 0-1 dari game
    rpmShown: 0,     // nilai yang di-smooth untuk animasi
    health: 1,       // engine health 0-1
    fuel: 0,
    oilShown: 0,     // psi, di-smooth
    oilOverride: null,
    lastTick: -1,
    lastOilTick: -1,
    lastFuelLit: -1,
    lastEngLit: -1,
    lastMphShown: -1,
    belted: false,
    engine: false,   // dari setEngine(); alarm hanya bunyi saat mesin hidup
    mps: 0,
};
let bootUntil = performance.now() + 1700;

let lastRedline = null;
function renderRpm(ratio) {
    const lit = Math.round(ratio * MAX_RPM * 5);
    if (lit !== state.lastTick) {
        state.lastTick = lit;
        rTicks.forEach((t, i) => t.classList.toggle('on', i <= lit && ratio > 0.003));
        rNums.forEach((n, v) => n.classList.toggle('on', v * 5 <= lit && ratio > 0.003));
    }
    const red = ratio >= REDLINE / MAX_RPM;
    if (red !== lastRedline) {
        lastRedline = red;
        elHud.classList.toggle('redline', red);
    }
}

function renderOil(psi) {
    const lit = Math.round((psi / OIL_MAX) * OIL_N);
    if (lit !== state.lastOilTick) {
        state.lastOilTick = lit;
        oTicks.forEach((t, i) => t.classList.toggle('on', i <= lit && psi > 0.5));
    }
    setText($('oil-val'), Math.round(psi) + ' psi');
}

function renderBars(f, e) {
    const fl = f > 0.005 ? Math.round(f * FUEL_N) : -1;
    const el = e > 0.005 ? Math.round(e * ENG_N) : -1;
    if (fl !== state.lastFuelLit) {
        state.lastFuelLit = fl;
        fTicks.forEach((t, i) => t.classList.toggle('on', i <= fl));
    }
    if (el !== state.lastEngLit) {
        state.lastEngLit = el;
        eTicks.forEach((t, i) => t.classList.toggle('on', i <= el));
    }
}
function refreshBars() {
    if (performance.now() >= bootUntil) renderBars(state.fuel, state.health);
}

// Helper: tulis DOM hanya kalau isinya memang berubah
function setText(el, txt) { txt = String(txt); if (el.textContent !== txt) el.textContent = txt; }
function setClass(el, cls) { if (el.className !== cls) el.className = cls; }

function padDigits(n, len) {
    const s = String(Math.max(0, n)).padStart(len, '0');
    const firstSig = s.search(/[1-9]/);
    const cut = firstSig === -1 ? len - 1 : firstSig;
    return `<span class="dim">${s.slice(0, cut)}</span><span class="bright">${s.slice(cut)}</span>`;
}

// Oil pressure otomatis: naik mengikuti RPM, turun kalau engine health rusak, 0 saat mesin mati
function oilTarget() {
    if (state.oilOverride !== null) return Math.min(OIL_MAX, state.oilOverride);
    if (!state.engine) return 0;
    return Math.min(OIL_MAX, (18 + state.rpm * 52) * (0.45 + 0.55 * state.health));
}

// ---------- Loop animasi ----------
// Hemat FPS: loop BERHENTI saat tidak ada yang bergerak, dan dibatasi MAX_FPS.
const MAX_FPS = 40;
const FRAME_MS = 1000 / MAX_FPS;
let lastFrame = 0, rafId = 0;
function kick() {
    if (rafId) return;
    lastFrame = performance.now() - FRAME_MS;
    rafId = requestAnimationFrame(frame);
}
function frame(now) {
    rafId = 0;
    if (now - lastFrame < FRAME_MS - 2) { rafId = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    const booting = now < bootUntil;
    let target = state.rpm;
    if (booting) {
        // sweep saat kontak ON: semua gauge naik lalu turun
        const t = 1 - (bootUntil - now) / 1700;
        target = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.55) / 0.45);
        if (t >= 0.45 && t < 0.55) target = 1;
    } else if (elHud.classList.contains('booting')) {
        elHud.classList.remove('booting');
    }

    const k = booting ? 1 : Math.min(1, dt * 14);
    state.rpmShown += (target - state.rpmShown) * k;
    if (Math.abs(target - state.rpmShown) < 0.0005) state.rpmShown = target;
    renderRpm(state.rpmShown);

    const oilT = booting ? target * OIL_MAX : oilTarget();
    state.oilShown += (oilT - state.oilShown) * (booting ? 1 : Math.min(1, dt * 6));
    if (Math.abs(oilT - state.oilShown) < 0.05) state.oilShown = oilT;
    renderOil(state.oilShown);
    if (!booting) elHud.classList.toggle('oil-low', state.engine && state.oilShown < 15);

    renderBars(booting ? target : state.fuel, booting ? target : state.health);

    if (booting || state.rpmShown !== target || state.oilShown !== oilT) rafId = requestAnimationFrame(frame);
}
kick();

// ---------- 1. Kecepatan (m/s -> MPH) ----------
window.setSpeed = function (speed) {
    const mph = Math.round(Number(speed || 0) * MPS_TO_MPH);
    state.mph = mph;
    state.mps = Number(speed || 0);
    if (mph !== state.lastMphShown) {
        state.lastMphShown = mph;
        $('speed-display').innerHTML = padDigits(mph, 3);
    }
};

// ---------- 2. RPM (0.0 - 1.0) ----------
window.setRPM = function (rpm) {
    const r = clamp01(Number(rpm || 0));
    if (r === state.rpm) return;
    state.rpm = r;
    kick();
};

// ---------- 3. Fuel ----------
window.setFuel = function (fuel) {
    const val = Number(fuel || 0);
    const percent = clamp01(val > 1 ? val / 100 : val);
    state.fuel = percent;
    setText($('fuel-val'), Math.round(percent * 100) + '%');
    elHud.classList.toggle('fuel-low', percent < 0.20);
    refreshBars();
};

// ---------- 4. Engine Health ----------
// >50% normal (putih) | 30-50% WORN (kuning) | <30% DAMAGED (merah berkedip)
window.setHealth = function (health) {
    const val = Number(health || 0);
    const percent = clamp01(val > 1 ? val / 1000 : val);
    state.health = percent;
    setText($('eng-val'), Math.round(percent * 100) + '%');
    elHud.classList.toggle('eng-warn', percent <= 0.5 && percent > 0.3);
    elHud.classList.toggle('eng-crit', percent <= 0.3);
    refreshBars();
    kick();   // oil ikut turun kalau health jelek
};

// ---------- 4b. Oil manual (opsional) ----------
window.setOil = function (psi) {
    state.oilOverride = (psi === null || psi === undefined || psi === '') ? null : Math.max(0, Number(psi) || 0);
    kick();
};

// ---------- 5. Gear ----------
window.setGear = function (gear) {
    let g = String(gear);
    if (gear == 0 || g === '0' || g.toUpperCase() === 'R') g = 'R';
    else if (gear === null || gear === undefined || g === '' || g.toUpperCase() === 'N') g = 'N';
    setText($('gear'), g);
    const col = g === 'R' ? 'var(--red)' : '';
    if ($('gear').style.color !== col) $('gear').style.color = col;
};

// ---------- 6. Lock / Unlock Vehicle ----------
window.updateLockStatus = function (st) {
    const locked = isLockedState(st);
    setClass($('door-lock'), locked ? 'icon-item locked' : 'icon-item');
    elHud.classList.toggle('is-locked', locked);
};
window.setDoors = window.updateLockStatus;
window.setDoorLock = window.updateLockStatus;
window.setVehicleLocked = window.updateLockStatus;
window.setLocked = window.updateLockStatus;
window.setLock = window.updateLockStatus;
window.toggleLock = window.updateLockStatus;

// ---------- 7. Lampu (0 = mati, 1 = low beam, 2 = high beam) ----------
window.setHeadlights = function (st) {
    const val = Number(st || 0);
    setClass($('headlight'), val === 2 ? 'icon-item high-beam' : val === 1 ? 'icon-item active' : 'icon-item');
};

// ---------- 8. Sein (dinonaktifkan) ----------
window.setLeftIndicator = function () {};
window.setRightIndicator = function () {};

// ---------- 9. Seatbelt (true = terpasang) ----------
window.setSeatbelts = function (val) {
    const on = isTrueValue(val);
    state.belted = on;
    setClass($('seatbelts'), on ? 'icon-item active' : 'icon-item warn');
};

// ---------- 10. Odometer (mil) ----------
window.setOdometer = function (distance) {
    setText($('odometer'), Number(distance || 0).toFixed(1));
};

// ---------- Intro (bisa dipanggil ulang: playIntro()) ----------
let introTimer;
window.playIntro = function () {
    elHud.classList.remove('intro-on');
    void elHud.offsetWidth;
    elHud.classList.add('intro-on');
    bootUntil = performance.now() + 1700;
    kick();
    clearTimeout(introTimer);
    introTimer = setTimeout(() => elHud.classList.remove('intro-on'), 2750);
};

// ---------- Suara peringatan (Web Audio, tanpa file mp3) ----------
// Matikan semua: setHudSound(false)
const SND = {
    enabled: true,
    volume: 0.3,            // 0 - 1
    seatbeltEvery: 2000,    // ms jeda antar bunyi seatbelt
    seatbeltMinSpeed: 1,    // m/s: seatbelt hanya bunyi saat bergerak lebih cepat dari ini
    fuelBelow: 0.20,        // bensin di bawah 20%
    fuelEvery: 30000,       // ms jeda antar chime bensin
};
try {
    const q = new URLSearchParams(location.search);
    ['nosound', 'mute', 'silent', 'noalarm', 'noseatbelt', 'nobelt'].forEach((k) => {
        if (q.has(k) && !['0', 'false', 'no', 'off'].includes((q.get(k) || '').toLowerCase())) SND.enabled = false;
    });
    if (q.has('volume') && !isNaN(parseFloat(q.get('volume')))) SND.volume = Math.max(0, Math.min(1, parseFloat(q.get('volume'))));
} catch (e) {}
let audioCtx = null;
function getAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}
function tone(freq, start, dur, type, vol) {
    const a = getAudio();
    if (!a) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, SND.volume * vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
}
window.playHudSound = function (kind) {
    if (!SND.enabled) return;
    if (kind === 'seatbelt') {
        tone(1000, 0.00, 0.14, 'triangle', 1);
        tone(1000, 0.22, 0.14, 'triangle', 1);
    } else if (kind === 'fuel') {
        tone(988, 0.00, 0.45, 'sine', 1);
        tone(1976, 0.00, 0.30, 'sine', 0.25);
        tone(740, 0.30, 0.70, 'sine', 1);
        tone(1480, 0.30, 0.45, 'sine', 0.25);
    }
};
window.setHudSound = function (on, volume) {
    SND.enabled = !!on;
    if (volume !== undefined) SND.volume = clamp01(Number(volume));
};
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

let lastSeatBeep = -Infinity, lastFuelChime = -Infinity;
setInterval(() => {
    if (!SND.enabled || elHud.classList.contains('intro-on')) return;
    const now = performance.now();

    const seatWarn = state.engine && !state.belted && state.mps > SND.seatbeltMinSpeed;
    if (!seatWarn) lastSeatBeep = -Infinity;
    else if (now - lastSeatBeep >= SND.seatbeltEvery) {
        lastSeatBeep = now;
        window.playHudSound('seatbelt');
    }

    const fuelWarn = state.engine && state.fuel < SND.fuelBelow;
    if (!fuelWarn) lastFuelChime = -Infinity;
    else if (now - lastFuelChime >= SND.fuelEvery) {
        lastFuelChime = now;
        window.playHudSound('fuel');
    }
}, 250);

// ---------- Engine (setEngine(true/false)) ----------
window.setEngine = function (on) {
    state.engine = isTrueValue(on);
    kick();   // oil pressure naik/turun saat mesin hidup/mati
};
window.setSeatbeltSoundEnabled = (on) => window.setHudSound(!!on);
window.setSeatbeltVolume = (v) => { const n = parseFloat(v); if (!isNaN(n)) window.setHudSound(SND.enabled, n); };

// Pesan gaya NUI: window.postMessage({ action: 'setEngine', state: true })
window.addEventListener('message', function (event) {
    const d = event.data;
    if (!d || typeof d !== 'object' || !d.action) return;
    try {
        switch (d.action) {
            case 'setEngine': window.setEngine(d.state); break;
            case 'setSpeed': window.setSpeed(Number(d.speed) || 0); break;
            case 'setRPM': window.setRPM(Number(d.rpm) || 0); break;
            case 'setFuel': window.setFuel(Number(d.fuel) || 0); break;
            case 'setHealth': window.setHealth(Number(d.health) || 0); break;
            case 'setOil': window.setOil(d.oil !== undefined ? d.oil : d.psi); break;
            case 'setGear': window.setGear(d.gear !== undefined ? d.gear : 'N'); break;
            case 'setHeadlights': window.setHeadlights(Number(d.state) || 0); break;
            case 'setSeatbelts': window.setSeatbelts(!!d.state); break;
            case 'setOdometer': window.setOdometer(Number(d.distance) || 0); break;
            case 'muteSeatbelt': window.setSeatbeltSoundEnabled(false); break;
            case 'unmuteSeatbelt': window.setSeatbeltSoundEnabled(true); break;
            case 'setSeatbeltSound': window.setSeatbeltSoundEnabled(d.enabled !== undefined ? !!d.enabled : !d.disabled); break;
            case 'setVolume': window.setSeatbeltVolume(d.volume !== undefined ? d.volume : d.value); break;
        }
    } catch (e) { /* abaikan pesan rusak */ }
});

// ---------- Message handler (lock & intro) ----------
window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'setDoors' || data.action === 'setDoors' || data.type === 'lock') {
        window.updateLockStatus(data.status !== undefined ? data.status : data.state);
    }
    if (data.type === 'playIntro' || data.action === 'playIntro') window.playIntro();
});

// ---------- Nilai awal ----------
window.setSpeed(0);
window.setRPM(0);
window.setFuel(100);
window.setHealth(1000);
window.setGear('N');
window.setHeadlights(0);
window.setSeatbelts(false);
window.setEngine(false);
window.updateLockStatus(false);
window.setOdometer(0);
window.playIntro();

// ---------- Demo (otomatis di preview Netlify atau dengan ?demo) ----------
const params = new URLSearchParams(location.search);
const isPreview = params.has('demo') || (/netlify\.app$/.test(location.hostname) && !params.has('nodemo'));

if (isPreview) {
    document.body.classList.add('preview');
    const fit = () => document.documentElement.style.setProperty('--scale', Math.min(1, window.innerWidth / 1260));
    fit();
    window.addEventListener('resize', fit);

    const GEAR_TOP = [0, 28, 48, 72, 98, 128, 165];   // batas mph per gigi
    let mps = 0, gear = 1, throttle = true, odo = 18452.3, health = 1000, fuel = 86, t = 0;

    setTimeout(() => {
        setEngine(true);
        setTimeout(() => setSeatbelts(true), 9000);
        setHeadlights(1);
        setInterval(() => {
            t += 0.05;
            const mph = mps * MPS_TO_MPH;
            if (throttle) mps += 0.38 / gear; else mps -= 0.55;
            if (mph > 150) throttle = false;
            if (mps <= 0) { mps = 0; throttle = true; }

            while (gear < 6 && mph > GEAR_TOP[gear]) gear++;
            while (gear > 1 && mph < GEAR_TOP[gear - 1] - 6) gear--;
            const lo = GEAR_TOP[gear - 1], hi = GEAR_TOP[gear];
            const rpm = 0.11 + clamp01((mph - lo) / (hi - lo)) * (throttle ? 0.82 : 0.6);

            health = Math.max(180, health - 0.9);
            if (health <= 180) health = 1000;
            fuel = fuel <= 4 ? 86 : fuel - 0.02;
            odo += (mph * 0.05) / 3600;

            setSpeed(mps);
            setRPM(rpm);
            setGear(gear);
            setHealth(health);
            setFuel(fuel);
            setOdometer(odo);
            setHeadlights(Math.floor(t / 9) % 3 === 2 ? 2 : 1);
            updateLockStatus(Math.floor(t / 7) % 2);
        }, 50);
    }, 3000);
}
