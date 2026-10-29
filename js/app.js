/* Data Pyranometer IESR — dashboard interaktif (tanpa library eksternal) */
(function () {
  'use strict';

  /* =====================  Util  ===================== */
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const svgEl = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const pad2 = n => String(n).padStart(2, '0');
  const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = REDUCED ? 0 : 720;

  const CFG = window.SENSOR_CONFIG || {};
  const ORIGINAL = window.PYRANO_DATA;
  const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /* =====================  Data (bisa diganti lewat Upload Raw Data)  ===================== */
  let RAW, YEAR, months, K, W, N, dayTot, monTot, customName = '', customSource = '';
  const dim = m => new Date(YEAR, m, 0).getDate();
  function buildData(raw) {
    RAW = raw; YEAR = raw.year;
    months = [...new Set(raw.rows.map(r => r[0]))].sort((a, b) => a - b);
    K = {}; W = {}; N = {}; dayTot = {}; monTot = {};
    months.forEach(m => {
      K[m] = [null]; W[m] = [null]; N[m] = [null];
      for (let d = 1; d <= dim(m); d++) { K[m].push(new Array(24).fill(0)); W[m].push(new Array(24).fill(0)); N[m].push(new Array(24).fill(0)); }
    });
    // baris: [bulan, hari, jam, kWh (sum), W/m2 (rata-rata jam), n sampel (opsional)]
    raw.rows.forEach(([m, d, h, k, w, n]) => { K[m][d][h] = k; W[m][d][h] = w; N[m][d][h] = n == null ? 1 : n; });
    months.forEach(m => {
      dayTot[m] = [null]; let s = 0;
      for (let d = 1; d <= dim(m); d++) { const t = K[m][d].reduce((a, b) => a + b, 0); dayTot[m].push(t); s += t; }
      monTot[m] = s;
    });
  }
  buildData(ORIGINAL);

  /* =====================  State  ===================== */
  const S = { mode: 'month', m: months[0], day: null };       // tampilan global
  const MX = { mode: 'monthly', m: months[0] };               // matrix
  const scopeName = () => (S.mode === 'annual' ? String(YEAR) : `${MONTH_ID[S.m - 1]} ${YEAR}`);

  function getHourly() {
    if (S.day) return W[S.m][S.day].slice();
    const list = S.mode === 'annual' ? months : [S.m];
    const out = new Array(24).fill(0), cnt = new Array(24).fill(0);
    list.forEach(m => { for (let d = 1; d <= dim(m); d++) { for (let h = 0; h < 24; h++) { out[h] += W[m][d][h] * N[m][d][h]; cnt[h] += N[m][d][h]; } } });
    return out.map((v, h) => (cnt[h] ? v / cnt[h] : 0));
  }
  function getDaily() {
    const items = [];
    (S.mode === 'annual' ? months : [S.m]).forEach(m => { for (let d = 1; d <= dim(m); d++) items.push({ m, d, v: dayTot[m][d] }); });
    return items;
  }
  const getMonthly = () => months.map(m => ({ m, v: monTot[m] }));

  function getKpi() {
    let items, unit, avgCap, sumCap;
    if (S.mode === 'annual') {
      items = months.map(m => ({ v: monTot[m], label: MONTH_ID[m - 1] }));
      unit = 'kWh/m²/month'; avgCap = `Rata-rata bulanan · ${YEAR}`; sumCap = `Nilai total · ${YEAR}`;
    } else {
      items = getDaily().map(x => ({ v: x.v, label: `${x.d} ${MONTH_ID[S.m - 1]}` }));
      unit = 'kWh/m²/days'; avgCap = `Rata-rata harian · ${scopeName()}`; sumCap = `Nilai total · ${scopeName()}`;
    }
    const vals = items.map(i => i.v);
    const sum = vals.reduce((a, b) => a + b, 0);
    const mn = items.reduce((a, b) => (b.v < a.v ? b : a));
    const mx = items.reduce((a, b) => (b.v > a.v ? b : a));
    return {
      unit,
      avg: { v: sum / vals.length, cap: avgCap },
      min: { v: mn.v, cap: `Nilai terendah · ${mn.label}` },
      max: { v: mx.v, cap: `Nilai tertinggi · ${mx.label}` },
      sum: { v: sum, cap: sumCap }
    };
  }

  function matrixModel(mode, m) {
    let n, cols, vals;
    if (mode === 'monthly') {
      n = dim(m);
      cols = Array.from({ length: n }, (_, i) => ({ label: String(i + 1), long: `${i + 1} ${MONTH_ID[m - 1]} ${YEAR}`, ref: { m, d: i + 1 } }));
      vals = Array.from({ length: 24 }, (_, h) => Array.from({ length: n }, (_, i) => K[m][i + 1][h]));
    } else {
      n = months.length;
      cols = months.map(mm => ({ label: MONTH_SHORT[mm - 1], long: `${MONTH_ID[mm - 1]} ${YEAR}`, ref: { m: mm } }));
      vals = Array.from({ length: 24 }, (_, h) => months.map(mm => { let s = 0; for (let d = 1; d <= dim(mm); d++) s += K[mm][d][h]; return s; }));
    }
    const rowTot = vals.map(r => r.reduce((a, b) => a + b, 0));
    const colTot = Array.from({ length: n }, (_, c) => vals.reduce((a, r) => a + r[c], 0));
    const grand = rowTot.reduce((a, b) => a + b, 0);
    let vmax = -Infinity, vmin = Infinity; vals.forEach(r => r.forEach(v => { if (v > vmax) vmax = v; if (v < vmin) vmin = v; }));
    if (!(vmax > vmin)) vmax = vmin + 1;
    return { mode, m, n, cols, vals, rowTot, colTot, grand, vmax, vmin };
  }

  /* =====================  Tooltip / toast  ===================== */
  const tipEl = $('#tooltip');
  const tipHtml = (title, val, unit, sub) =>
    `<div class="tt-h">${title}</div><div class="tt-v"><b>${val}</b><span>${unit}</span></div>${sub ? `<div class="tt-s">${sub}</div>` : ''}`;
  function showTip(html, x, y, color) {
    tipEl.innerHTML = html; tipEl.style.setProperty('--tt', color || '#D8481A'); tipEl.hidden = false;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let L = x + 14, T = y - h - 12;
    if (L + w > window.innerWidth - 8) L = x - w - 14;
    if (L < 8) L = 8;
    if (T < 8) T = y + 18;
    tipEl.style.transform = `translate(${L}px,${T}px)`;
  }
  const hideTip = () => { tipEl.hidden = true; };
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* =====================  Skala & kurva  ===================== */
  function niceScale(max, count = 4) {
    if (!(max > 0)) return { ymax: 1, step: .25 };
    const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    return { ymax: Math.ceil(max / step - 1e-9) * step, step };
  }
  function resample(a, M) {
    const n = a.length;
    if (n === M) return a.slice();
    if (n === 1) return new Array(M).fill(a[0]);
    const o = new Array(M);
    for (let i = 0; i < M; i++) {
      const p = i * (n - 1) / (M - 1), i0 = Math.floor(p), i1 = Math.min(n - 1, i0 + 1);
      o[i] = a[i0] + (a[i1] - a[i0]) * (p - i0);
    }
    return o;
  }
  function monotonePath(p) {
    const n = p.length;
    if (!n) return '';
    if (n === 1) return `M${p[0].x},${p[0].y}`;
    const dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = (p[i + 1].x - p[i].x) || 1e-6; m[i] = (p[i + 1].y - p[i].y) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const tau = 3 / Math.sqrt(s); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
    }
    let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(p[i].x + h).toFixed(1)},${(p[i].y + t[i] * h).toFixed(1)} ${(p[i + 1].x - h).toFixed(1)},${(p[i + 1].y - t[i + 1] * h).toFixed(1)} ${p[i + 1].x.toFixed(1)},${p[i + 1].y.toFixed(1)}`;
    }
    return d;
  }

  /* =====================  Line chart (morph)  ===================== */
  class LineChart {
    constructor(host, o) {
      this.host = host;
      this.o = Object.assign({ h: 280, ml: 58, mr: 16, mt: 14, mb: 54, pad: 8, color: '#111111', dot: '#111111', sw: 1.25, yTitle: '', xTitle: '', tickGap: 42, maxDots: 40, tip: null, onClick: null }, o);
      this.uid = 'lg' + Math.random().toString(36).slice(2, 8);
      this.svg = svgEl('svg', { class: 'lc', role: 'img', 'aria-label': o.label || '' }, host);
      const defs = svgEl('defs', {}, this.svg);
      const lg = svgEl('linearGradient', { id: this.uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      this.lg = lg; lg.setAttribute('gradientUnits', 'userSpaceOnUse');
      // merah ala referensi ridgeline: nilai tinggi = merah lebih pekat, rendah = merah muda
      svgEl('stop', { offset: '0%', 'stop-color': '#F65A5A', 'stop-opacity': .82 }, lg);
      svgEl('stop', { offset: '100%', 'stop-color': '#FFB0AD', 'stop-opacity': .55 }, lg);
      this.axisG = svgEl('g', {}, this.svg);
      this.area = svgEl('path', { fill: `url(#${this.uid})` }, this.svg);
      this.line = svgEl('path', { fill: 'none', stroke: this.o.color, 'stroke-width': this.o.sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }, this.svg);
      this.dots = svgEl('g', {}, this.svg);
      this.selG = svgEl('g', {}, this.svg);
      this.guide = svgEl('line', { class: 'guide', visibility: 'hidden', 'pointer-events': 'none' }, this.svg);
      this.hov = svgEl('circle', { r: 5.5, fill: '#fff', stroke: this.o.dot, 'stroke-width': 1.8, visibility: 'hidden', 'pointer-events': 'none' }, this.svg);
      this.hit = svgEl('rect', { fill: 'transparent' }, this.svg);
      if (this.o.onClick) this.hit.style.cursor = 'pointer';
      this.vals = []; this.ticks = []; this.cur = []; this.ymax = 1; this.step = .25; this.sel = null; this.anim = 0; this.axisCur = null;
      this.measure();
      this.hit.addEventListener('pointermove', e => this.hover(e));
      this.hit.addEventListener('pointerleave', () => this.unhover());
      this.hit.addEventListener('click', e => { const i = this.idxAt(e); if (i != null && this.o.onClick) this.o.onClick(i); });
      if (window.ResizeObserver) new ResizeObserver(() => {
        if (Math.abs(this.host.clientWidth - this.W) > 1) { this.measure(); if (this.vals.length) this.rebuild(); }
      }).observe(host);
    }
    measure() {
      this.W = Math.max(280, this.host.clientWidth || 600); this.H = this.o.h;
      this.svg.setAttribute('width', this.W); this.svg.setAttribute('height', this.H);
      const { ml, mr, mt, mb } = this.o;
      this.hit.setAttribute('x', ml); this.hit.setAttribute('y', mt);
      this.hit.setAttribute('width', this.W - ml - mr); this.hit.setAttribute('height', this.H - mt - mb);
      this.lg.setAttribute('x1', 0); this.lg.setAttribute('x2', 0); this.lg.setAttribute('y1', mt); this.lg.setAttribute('y2', this.H - mb);
    }
    X(i, n) { const { ml, mr, pad } = this.o; const w = this.W - ml - mr - 2 * pad; return ml + pad + (n > 1 ? i * w / (n - 1) : w / 2); }
    Y(f) { const { mt, mb } = this.o; return mt + (1 - f) * (this.H - mt - mb); }

    buildAxis() {
      const { ml, mr, mt, mb } = this.o, g = svgEl('g', { class: 'axis' });
      const n = this.vals.length;
      for (let v = 0; v <= this.ymax + 1e-9; v += this.step) {
        const y = this.Y(v / this.ymax);
        svgEl('line', { class: v === 0 ? 'base' : 'grid', x1: ml, x2: this.W - mr, y1: y, y2: y }, g);
        const t = svgEl('text', { class: 'tick', x: ml - 10, y: y + 4, 'text-anchor': 'end' }, g);
        t.textContent = this.step < 1 ? f2(v) : String(Math.round(v * 100) / 100);
      }
      let last = -1e9; const kept = [];
      this.ticks.forEach(tk => {
        const x = this.X(tk.i, n);
        if (x - last < this.o.tickGap) return;
        last = x; kept.push({ x, label: tk.label });
      });
      kept.forEach(k => g.insertBefore(svgEl('line', { class: 'vgrid', x1: k.x, x2: k.x, y1: mt, y2: this.H - mb }), g.firstChild));
      kept.forEach(k => { const t = svgEl('text', { class: 'tick', x: k.x, y: this.H - mb + 19, 'text-anchor': 'middle' }, g); t.textContent = k.label; });
      if (this.o.yTitle) {
        const t = svgEl('text', { class: 'atitle', transform: `translate(14,${mt + (this.H - mt - mb) / 2}) rotate(-90)`, 'text-anchor': 'middle' }, g);
        t.textContent = this.o.yTitle;
      }
      if (this.xTitle || this.o.xTitle) {
        const t = svgEl('text', { class: 'atitle', x: ml + (this.W - ml - mr) / 2, y: this.H - 6, 'text-anchor': 'middle' }, g);
        t.textContent = this.xTitle || this.o.xTitle;
      }
      return g;
    }
    swapAxis() {
      const old = this.axisCur;
      if (old) { old.style.opacity = 0; setTimeout(() => old.remove(), 600); }
      const g = this.buildAxis(); g.style.opacity = 0; this.axisG.appendChild(g); this.axisCur = g;
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = 1; }));
    }
    rebuild() {
      this.stop();
      this.axisG.textContent = ''; this.axisCur = this.buildAxis(); this.axisG.appendChild(this.axisCur);
      this.cur = this.vals.map(v => v / this.ymax); this.final();
    }
    stop() { if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; } }

    set(vals, ticks, { sel = null, xTitle = '', animate = true } = {}) {
      this.vals = vals; this.ticks = ticks; this.sel = sel; this.xTitle = xTitle;
      const sc = niceScale(Math.max(0, ...vals)); this.ymax = sc.ymax; this.step = sc.step;
      const target = vals.map(v => v / sc.ymax);
      this.stop(); this.swapAxis(); this.unhover();
      const from = this.cur.length ? this.cur : target.map(() => 0);
      this.dots.textContent = ''; this.selG.textContent = '';
      if (!animate || !DUR) { this.cur = target; this.final(); return; }
      const M = Math.max(from.length, target.length, 2), a = resample(from, M), b = resample(target, M), t0 = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - t0) / DUR), e = ease(t);
        const fr = a.map((v, i) => v + (b[i] - v) * e);
        this.cur = fr; this.paint(fr);
        if (t < 1) this.anim = requestAnimationFrame(frame);
        else { this.anim = 0; this.cur = target; this.final(); }
      };
      this.anim = requestAnimationFrame(frame);
    }
    paint(fr) {
      const n = fr.length, pts = fr.map((v, i) => ({ x: this.X(i, n), y: this.Y(v) }));
      const d = monotonePath(pts), y0 = this.Y(0);
      this.line.setAttribute('d', d);
      this.area.setAttribute('d', n ? `${d}L${pts[n - 1].x.toFixed(1)},${y0}L${pts[0].x.toFixed(1)},${y0}Z` : '');
    }
    final() {
      this.paint(this.cur);
      const n = this.cur.length;
      this.dots.textContent = ''; this.selG.textContent = '';
      if (n <= this.o.maxDots) {
        this.cur.forEach((v, i) => {
          const c = svgEl('circle', { class: 'dot dot-in', cx: this.X(i, n), cy: this.Y(v), r: 3.2, stroke: this.o.dot }, this.dots);
          c.style.animationDelay = (i * 8) + 'ms'; c.style.transformOrigin = `${this.X(i, n)}px ${this.Y(v)}px`;
        });
      }
      if (this.sel != null && this.sel >= 0 && this.sel < n) {
        svgEl('circle', { cx: this.X(this.sel, n), cy: this.Y(this.cur[this.sel]), r: 7, fill: '#111111', stroke: '#FFFFFF', 'stroke-width': 2.4, 'pointer-events': 'none' }, this.selG);
      }
    }
    idxAt(e) {
      const n = this.vals.length; if (!n) return null;
      const r = this.svg.getBoundingClientRect(), x = e.clientX - r.left;
      const { ml, mr, pad } = this.o, w = this.W - ml - mr - 2 * pad;
      return clamp(Math.round((x - ml - pad) / w * (n - 1)), 0, n - 1);
    }
    hover(e) {
      if (this.anim) return;
      const i = this.idxAt(e); if (i == null) return;
      const n = this.vals.length, px = this.X(i, n), py = this.Y(this.vals[i] / this.ymax);
      this.guide.setAttribute('x1', px); this.guide.setAttribute('x2', px);
      this.guide.setAttribute('y1', this.o.mt); this.guide.setAttribute('y2', this.H - this.o.mb);
      this.hov.setAttribute('cx', px); this.hov.setAttribute('cy', py);
      this.guide.setAttribute('visibility', 'visible'); this.hov.setAttribute('visibility', 'visible');
      if (this.o.tip) showTip(this.o.tip(i, this.vals[i]), e.clientX, e.clientY, this.o.tipColor);
    }
    unhover() { this.guide.setAttribute('visibility', 'hidden'); this.hov.setAttribute('visibility', 'hidden'); hideTip(); }
  }

  /* =====================  Matrix (morph)  ===================== */
  // Conditional formatting diverging: nilai terendah = merah, tengah = putih, tertinggi = biru
  const RED = [70, 120, 196], BLUE = [247, 118, 122];
  function colorAt(t) {
    t = clamp(t, 0, 1);
    const d = Math.abs(t - .5) * 2, e = t < .5 ? RED : BLUE;
    return [lerp(255, e[0], d), lerp(255, e[1], d), lerp(255, e[2], d)];
  }
  document.getElementById('legendBar').style.background =
    `linear-gradient(90deg,rgb(${RED.join(',')}),#ffffff,rgb(${BLUE.join(',')}))`;

  const HDR_H = 32, ROW_H = 23, TOT_GAP = 6, TOT_H = 30, LABEL_W = 46, TOT_W = 78, COL_GAP = 10;
  const rowY = r => (r === -1 ? 0 : r === 24 ? HDR_H + 24 * ROW_H + TOT_GAP : HDR_H + r * ROW_H);
  const mapC = (c, from, to) => Math.min(to - 1, Math.floor((c + .5) / from * to));

  class Matrix {
    constructor(host) {
      this.host = host; this.model = null; this.L = null; this.cells = new Map(); this.anim = 0; this.onHeader = null;
      this.svg = svgEl('svg', { class: 'mx', role: 'img', 'aria-label': 'Matrix pivot kWh/m² per jam' }, host);
      this.gStatic = svgEl('g', {}, this.svg);
      this.gCells = svgEl('g', {}, this.svg);
      this.gHover = svgEl('g', { visibility: 'hidden' }, this.svg);
      this.rowBand = svgEl('rect', { class: 'mx-band' }, this.gHover);
      this.colBand = svgEl('rect', { class: 'mx-band' }, this.gHover);
      this.focus = svgEl('rect', { class: 'mx-focus' }, this.gHover);
      this.vline = svgEl('line', { class: 'axisline', x1: LABEL_W - 4, x2: LABEL_W - 4, y1: HDR_H, y2: HDR_H + 24 * ROW_H }, this.gStatic);
      this.hline = svgEl('line', { class: 'rule', x1: LABEL_W - 4, y1: HDR_H - 3, y2: HDR_H - 3 }, this.gStatic);
      this.tline = svgEl('line', { class: 'rule', x1: LABEL_W - 4, y1: HDR_H + 24 * ROW_H + 2, y2: HDR_H + 24 * ROW_H + 2 }, this.gStatic);
      for (let h = 0; h < 24; h++) {
        const t = svgEl('text', { class: 'rowlab', x: LABEL_W - 14, y: rowY(h) + ROW_H / 2 + 4.2, 'text-anchor': 'end' }, this.gStatic); t.textContent = h;
      }
      const hc = svgEl('text', { class: 'corner', x: LABEL_W - 14, y: HDR_H / 2 + 4, 'text-anchor': 'end' }, this.gStatic); hc.textContent = 'Hour';
      const tc = svgEl('text', { class: 'rowlab', x: LABEL_W - 14, y: rowY(24) + TOT_H / 2 + 4, 'text-anchor': 'end', style: 'font-weight:800' }, this.gStatic); tc.textContent = 'Total';
      this.svg.addEventListener('pointermove', e => this.hover(e));
      this.svg.addEventListener('pointerleave', () => this.unhover());
      this.svg.addEventListener('click', e => {
        const g = e.target.closest && e.target.closest('g[data-r="-1"]');
        if (g && g.dataset.c !== 'T' && this.onHeader) this.onHeader(+g.dataset.c);
      });
      if (window.ResizeObserver) new ResizeObserver(() => {
        const w = this.host.clientWidth;
        if (this.model && Math.abs(w - (this.hostW || 0)) > 1) { this.hostW = w; this.set(this.model, false); }
      }).observe(host);
    }
    layout(n) {
      const avail = this.host.clientWidth || 900, minCw = n > 12 ? 33 : 70;
      const cw = clamp((avail - LABEL_W - TOT_W - COL_GAP - 8) / n, minCw, 130);
      const totX = LABEL_W + n * cw + COL_GAP;
      return { n, cw, totX, width: totX + TOT_W + 6 };
    }
    target(r, c, mod, L) {
      const isT = c === 'T';
      const st = { x: isT ? L.totX : LABEL_W + c * L.cw, w: isT ? TOT_W : L.cw, val: 0, label: '', rgb: [255, 255, 255], op: 1 };
      if (r === -1) st.label = isT ? 'Total' : mod.cols[c].label;
      else if (r === 24) st.val = isT ? mod.grand : mod.colTot[c];
      else { st.val = isT ? mod.rowTot[r] : mod.vals[r][c]; if (!isT) st.rgb = colorAt((st.val - mod.vmin) / (mod.vmax - mod.vmin)); }
      return st;
    }
    make(r, c, st) {
      const kind = r === -1 ? 'hdr' : (r === 24 || c === 'T') ? 'tot' : 'body';
      const g = svgEl('g', { class: 'c ' + kind, 'data-r': r, 'data-c': c });
      let rect = null;
      if (kind === 'body') rect = svgEl('rect', { y: rowY(r) + .75, height: ROW_H - 1.5, rx: 1.5 }, g);
      const ty = r === -1 ? HDR_H / 2 + 4 : r === 24 ? rowY(24) + TOT_H / 2 + 4 : rowY(r) + ROW_H / 2 + 4.2;
      const text = svgEl('text', { y: ty, 'text-anchor': 'middle' }, g);
      this.gCells.appendChild(g);
      const el = { r, c, kind, g, rect, text, cur: { ...st }, from: null, to: null, shown: '' };
      this.cells.set(r + '|' + c, el);
      return el;
    }
    apply(el, st) {
      el.g.setAttribute('opacity', st.op.toFixed(3));
      const txt = el.kind === 'hdr' ? st.label : f2(st.val);
      if (txt !== el.shown) { el.text.textContent = txt; el.shown = txt; }
      el.text.setAttribute('x', (st.x + st.w / 2).toFixed(1));
      if (el.rect) {
        el.rect.setAttribute('x', (st.x + .75).toFixed(1)); el.rect.setAttribute('width', Math.max(0, st.w - 1.5).toFixed(1));
        const [r, g, b] = st.rgb;
        el.rect.setAttribute('fill', `rgb(${r | 0},${g | 0},${b | 0})`);
        const lum = .299 * r + .587 * g + .114 * b;
        el.text.setAttribute('fill', lum < 135 ? '#FFFFFF' : '#23252E');
      }
    }
    tick(t) {
      const e = t >= 1 ? 1 : ease(t);
      this.cells.forEach(el => {
        const a = el.from, b = el.to;
        const st = {
          x: lerp(a.x, b.x, e), w: lerp(a.w, b.w, e), val: lerp(a.val, b.val, e), op: lerp(a.op, b.op, e),
          rgb: [lerp(a.rgb[0], b.rgb[0], e), lerp(a.rgb[1], b.rgb[1], e), lerp(a.rgb[2], b.rgb[2], e)],
          label: e < .5 ? a.label : b.label
        };
        el.cur = st; this.apply(el, st);
      });
    }
    end() {
      if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; }
      if (!this.running) return;
      this.tick(1);
      const nNew = this.running.nNew;
      [...this.cells.entries()].forEach(([k, el]) => { if (el.c !== 'T' && el.c >= nNew) { el.g.remove(); this.cells.delete(k); } });
      this.running = null;
    }
    set(model, animate = true) {
      this.end();
      const L = this.layout(model.n), old = this.model, nOld = old ? old.n : 0, nNew = model.n, M = Math.max(nOld, nNew);
      this.hostW = this.host.clientWidth;
      for (let r = -1; r <= 24; r++) {
        const cs = [...Array(M).keys(), 'T'];
        cs.forEach(c => {
          const k = r + '|' + c, ex = this.cells.get(k);
          let to, from;
          if (c === 'T' || c < nNew) to = this.target(r, c, model, L);
          else { to = this.target(r, mapC(c, nOld, nNew), model, L); to.op = 0; if (ex) { to.val = ex.cur.val; to.label = ex.cur.label; to.rgb = ex.cur.rgb.slice(); } }
          if (ex) from = { ...ex.cur, rgb: ex.cur.rgb.slice() };
          else {
            const src = old && c !== 'T' ? this.cells.get(r + '|' + mapC(c, nNew, nOld)) : null;
            from = src ? { ...src.cur, rgb: src.cur.rgb.slice(), op: 0 } : { ...to, val: 0, rgb: [255, 255, 255], op: 0 };
          }
          const el = ex || this.make(r, c, from);
          el.from = from; el.to = to;
        });
      }
      this.model = model; this.L = L; this.running = { nNew };
      this.svg.setAttribute('width', L.width); this.svg.setAttribute('height', rowY(24) + TOT_H + 2);
      this.hline.setAttribute('x2', L.width - 4); this.tline.setAttribute('x2', L.width - 4);
      if (!animate || !DUR) { this.end(); return; }
      const t0 = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - t0) / (DUR + 180));
        this.tick(t);
        if (t < 1) this.anim = requestAnimationFrame(frame); else this.end();
      };
      this.anim = requestAnimationFrame(frame);
    }
    hover(e) {
      if (this.anim || !this.model) return;
      const g = e.target.closest && e.target.closest('g.c');
      if (!g || g.classList.contains('tot') || g.classList.contains('hdr')) { this.unhover(); return; }
      const r = +g.dataset.r, c = +g.dataset.c, L = this.L, m = this.model;
      const x = LABEL_W + c * L.cw;
      this.rowBand.setAttribute('x', LABEL_W); this.rowBand.setAttribute('y', rowY(r));
      this.rowBand.setAttribute('width', L.n * L.cw); this.rowBand.setAttribute('height', ROW_H);
      this.colBand.setAttribute('x', x); this.colBand.setAttribute('y', HDR_H);
      this.colBand.setAttribute('width', L.cw); this.colBand.setAttribute('height', 24 * ROW_H);
      this.focus.setAttribute('x', x + .75); this.focus.setAttribute('y', rowY(r) + .75);
      this.focus.setAttribute('width', L.cw - 1.5); this.focus.setAttribute('height', ROW_H - 1.5);
      this.gHover.setAttribute('visibility', 'visible');
      const cell = this.cells.get(r + '|' + c), rgb = cell ? cell.cur.rgb.map(v => v | 0).join(',') : '216,72,26';
      showTip(tipHtml(m.cols[c].long, f2(m.vals[r][c]), 'kWh/m²', `Jam ${pad2(r)}:00 – ${pad2(r)}:59`), e.clientX, e.clientY, `rgb(${rgb})`);
    }
    unhover() { this.gHover.setAttribute('visibility', 'hidden'); hideTip(); }
  }

  /* =====================  UI helpers  ===================== */
  function makeSeg(root, onPick) {
    const btns = $$('button', root), thumb = $('.thumb', root); let val = null;
    const place = () => {
      const b = btns.find(x => x.dataset.v === val); if (!b) return;
      thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    btns.forEach(b => b.addEventListener('click', () => onPick(b.dataset.v)));
    window.addEventListener('resize', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    return { set(v) { val = v; btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); place(); } };
  }
  function fillMonths(sel) {
    sel.innerHTML = months.map(m => `<option value="${m}">${MONTH_ID[m - 1]} ${YEAR}</option>`).join('');
  }
  function tweenNum(el, to) {
    const from = parseFloat(el.dataset.v || '0'); el.dataset.v = to;
    cancelAnimationFrame(+(el.dataset.raf || 0));
    if (!DUR) { el.textContent = f2(to); return; }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / (DUR + 100));
      el.textContent = f2(lerp(from, to, ease(t)));
      if (t < 1) el.dataset.raf = requestAnimationFrame(step);
    };
    el.dataset.raf = requestAnimationFrame(step);
  }

  /* =====================  Instances  ===================== */
  const hourlyChart = new LineChart($('#chart-hourly'), {
    h: 280, color: '#111111', dot: '#111111', yTitle: 'Pyranometer (W/m²)', tickGap: 46, label: 'Grafik garis rata-rata radiasi per jam',
    tip: (i, v) => tipHtml(`${pad2(i)}:00 – ${pad2(i)}:59`, (Math.round(v * 10) / 10).toFixed(1), 'W/m²', S.day ? `${S.day} ${MONTH_ID[S.m - 1]} ${YEAR}` : `Rata-rata · ${scopeName()}`)
  });
  const T = { trend: 'day' };                                   // switch tren Solar Energy: 'day' | 'month'
  let dailyItems = [];
  const energyChart = new LineChart($('#chart-energy'), {
    h: 280, color: '#111111', dot: '#111111', yTitle: 'kWh/m²/days', tickGap: 26, label: 'Grafik garis energi surya',
    tip: (i, v) => {
      if (T.trend === 'month') return tipHtml(`${MONTH_ID[months[i] - 1]} ${YEAR}`, f2(v), 'kWh/m²/month', 'Klik untuk memilih bulan');
      const it = dailyItems[i]; return tipHtml(`${it.d} ${MONTH_ID[it.m - 1]} ${YEAR}`, f2(v), 'kWh/m²/days', 'Klik untuk profil per jam');
    },
    onClick: i => {
      if (T.trend === 'month') { if (!(S.mode === 'month' && S.m === months[i] && !S.day)) setMonth(months[i]); }
      else { const it = dailyItems[i]; selectDay(it.m, it.d); }
    }
  });
  const matrix = new Matrix($('#mxWrap'));

  const segGlobal = makeSeg($('#segGlobal'), v => (v === 'annual' ? setAnnual() : setMonth(S.m)));
  const segMatrix = makeSeg($('#segMatrix'), v => { MX.mode = v; renderMatrix(true); });
  const segTrend = makeSeg($('#segTrend'), v => { T.trend = v; render(true); });
  const selMonth = $('#selMonth'), selMx = $('#selMxMonth');
  const refreshMonthOptions = () => { fillMonths(selMonth); fillMonths(selMx); };
  refreshMonthOptions();
  selMonth.addEventListener('change', () => setMonth(+selMonth.value));
  selMx.addEventListener('change', () => { MX.m = +selMx.value; MX.mode = 'monthly'; renderMatrix(true); });
  matrix.onHeader = c => {
    const col = matrix.model.cols[c].ref;
    if (matrix.model.mode === 'monthly') selectDay(col.m, col.d); else setMonth(col.m);
  };
  $('#dayChip').addEventListener('click', () => { S.day = null; render(true); });

  /* =====================  State changes  ===================== */
  function syncMatrix() { MX.mode = S.mode === 'annual' ? 'annual' : 'monthly'; MX.m = S.m; }
  function setAnnual() { S.mode = 'annual'; S.day = null; syncMatrix(); render(true); }
  function setMonth(m) { S.mode = 'month'; S.m = m; S.day = null; syncMatrix(); render(true); }
  function selectDay(m, d) {
    const same = S.mode === 'month' && S.m === m && S.day === d;
    S.mode = 'month'; S.m = m; S.day = same ? null : d; syncMatrix(); render(true);
  }

  /* =====================  Render  ===================== */
  function render(animate) {
    const sName = scopeName();
    segGlobal.set(S.mode); selMonth.value = S.m;
    selMonth.parentElement.classList.toggle('idle', S.mode === 'annual');

    // KPI
    const k = getKpi();
    ['avg', 'min', 'max', 'sum'].forEach(id => {
      const n = $('#kv-' + id); animate ? tweenNum(n, k[id].v) : (n.textContent = f2(k[id].v), n.dataset.v = k[id].v);
      $('#kc-' + id).textContent = k[id].cap;
    });
    $$('[data-unit]').forEach(u => { u.textContent = k.unit; });

    // Hourly
    const hv = getHourly();
    const dayTxt = S.day ? `${S.day} ${MONTH_ID[S.m - 1]} ${YEAR}` : '';
    $('#badgeHourly').textContent = `Average · ${S.day ? `${S.day} ${MONTH_ID[S.m - 1]}` : S.mode === 'annual' ? YEAR : MONTH_ID[S.m - 1]}`;
    $('#dayChip').hidden = !S.day; $('#dayChipText').textContent = dayTxt;
    hourlyChart.set(hv, Array.from({ length: 12 }, (_, i) => ({ i: i * 2, label: pad2(i * 2) + ':00' })), { xTitle: 'Hour', animate });

    // Solar Energy — switch tren per hari / per bulan
    segTrend.set(T.trend);
    dailyItems = getDaily();
    if (T.trend === 'day') {
      $('#badgeEnergy').textContent = `Sum · ${S.mode === 'annual' ? YEAR : MONTH_ID[S.m - 1]}`;
      $('#energyHint').textContent = 'Total per tanggal · klik titik untuk profil per jam';
      const dTicks = S.mode === 'annual'
        ? dailyItems.reduce((a, it, i) => (it.d === 1 && a.push({ i, label: MONTH_SHORT[it.m - 1] }), a), [])
        : dailyItems.map((it, i) => ({ i, label: String(it.d) }));
      energyChart.o.yTitle = 'kWh/m²/days'; energyChart.o.tickGap = S.mode === 'annual' ? 40 : 26;
      energyChart.set(dailyItems.map(x => x.v), dTicks,
        { sel: S.mode === 'month' && S.day ? S.day - 1 : null, xTitle: `Date (Day) — ${sName}`, animate });
    } else {
      const mv = getMonthly();
      $('#badgeEnergy').textContent = `Sum · ${YEAR}`;
      $('#energyHint').textContent = 'Total per bulan · klik titik untuk memilih bulan';
      energyChart.o.yTitle = 'kWh/m²/month'; energyChart.o.tickGap = 40;
      energyChart.set(mv.map(x => x.v), months.map((m, i) => ({ i, label: MONTH_SHORT[m - 1] })),
        { sel: S.mode === 'month' ? months.indexOf(S.m) : null, xTitle: `Date (Month) — ${YEAR}`, animate });
    }

    renderMatrix(animate);
  }
  function renderMatrix(animate) {
    segMatrix.set(MX.mode); selMx.value = MX.m;
    selMx.parentElement.classList.toggle('idle', MX.mode === 'annual');
    const model = matrixModel(MX.mode, MX.m);
    $('#mxTitle').textContent = MX.mode === 'monthly' ? 'Matrix Pivot Monthly' : 'Matrix Pivot Annual';
    $('#mxHint').textContent = MX.mode === 'monthly'
      ? `Baris: Hour · Kolom: Date (Day) · Nilai: kWh/m²/days (sum) · ${MONTH_ID[MX.m - 1]} ${YEAR}`
      : `Baris: Hour · Kolom: Date (Month) · Nilai: kWh/m²/month (sum) · ${YEAR}`;
    $('#legendMax').textContent = f2(model.vmax); $('#legendMin').textContent = f2(model.vmin);
    matrix.set(model, animate);
  }

  /* =====================  Export CSV  ===================== */
  const r4 = v => Math.round(v * 10000) / 10000;
  const slug = s => s.replace(/[^\w]+/g, '_');
  function csvEscape(v) { const s = String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function download(name, rows) {
    const csv = '\ufeff' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${name} diunduh`);
  }
  const base = () => `IESR_Pyranometer_${slug(sensorLabel())}`;
  const exporters = {
    hourly() {
      const hv = getHourly();
      const scope = S.day ? `${S.day}_${MONTH_ID[S.m - 1]}_${YEAR}` : slug(scopeName());
      download(`${base()}_hourly_${scope}.csv`, [['Hour', 'Pyranometer(W/m2) Average'], ...hv.map((v, h) => [h, r4(v)])]);
    },
    daily() {
      // Date = tanggalnya saja (mis. 20). Pada periode Annual ditambah kolom Month agar tiap baris tetap jelas.
      const annual = S.mode === 'annual';
      download(`${base()}_daily_${slug(scopeName())}.csv`, [
        annual ? ['Month', 'Date', 'kWh/m2/days Sum'] : ['Date', 'kWh/m2/days Sum'],
        ...getDaily().map(it => (annual ? [MONTH_ID[it.m - 1], it.d, r4(it.v)] : [it.d, r4(it.v)]))
      ]);
    },
    monthly() {
      download(`${base()}_monthly_${YEAR}.csv`, [['Month', 'kWh/m2/month Sum'], ...getMonthly().map(x => [MONTH_ID[x.m - 1], r4(x.v)])]);
    },
    matrix() {
      const m = matrix.model;
      const head = m.mode === 'monthly' ? 'Date (Day)' : 'Date (Month)';
      const rows = [['Hour', ...m.cols.map(c => c.label), 'Total']];
      for (let h = 0; h < 24; h++) rows.push([h, ...m.vals[h].map(r4), r4(m.rowTot[h])]);
      rows.push(['Total', ...m.colTot.map(r4), r4(m.grand)]);
      const nm = m.mode === 'monthly' ? `matrix_monthly_${slug(MONTH_ID[m.m - 1])}_${YEAR}` : `matrix_annual_${YEAR}`;
      rows.unshift([`Kolom: ${head}`, 'Nilai: kWh/m2 (sum)']);
      download(`${base()}_${nm}.csv`, rows);
    },
    energy() { return T.trend === 'day' ? exporters.daily() : exporters.monthly(); },
    all() {
      const rows = [['Date', 'Month', 'Day', 'Hour', 'Pyranometer(W/m2) Average', 'kWh/m2 Sum']];
      months.forEach(m => { for (let d = 1; d <= dim(m); d++) for (let h = 0; h < 24; h++)
        rows.push([`${YEAR}-${pad2(m)}-${pad2(d)}`, MONTH_ID[m - 1], d, h, r4(W[m][d][h]), r4(K[m][d][h])]); });
      download(`${base()}_semua_data_per_jam_${YEAR}.csv`, rows);
    }
  };
  const menu = $('#exportMenu'), menuBtn = $('#exportBtn');
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.hidden; menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
    if (open) $('button', menu).focus();
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });
  $$('[data-export]').forEach(b => b.addEventListener('click', () => { exporters[b.dataset.export](); closeMenu(); }));

  /* =====================  Init  ===================== */
  const sensorLabel = () => customName || CFG.name || ORIGINAL.sensor;
  function updateMeta() {
    $('#metaName').textContent = sensorLabel();
    $('#metaLoc').textContent = (typeof CFG.latitude === 'number' && typeof CFG.longitude === 'number')
      ? `Lat ${CFG.latitude}, Lon ${CFG.longitude}` : 'Lat –, Lon – (isi di js/config.js)';
    $('#metaPeriod').textContent = `${YEAR} (${MONTH_ID[months[0] - 1]} – ${MONTH_ID[months[months.length - 1] - 1]})`;
    $('#footSrc').textContent = customSource || CFG.source || 'data bawaan';
    document.title = 'Data Pyranometer IESR';
  }
  // dipanggil modul upload.js
  window.PyranoApp = {
    isCustom: () => RAW !== ORIGINAL,
    sensorName: sensorLabel,
    apply(raw, name, source) {
      customName = name || ''; customSource = source || '';
      buildData(raw);
      S.mode = 'month'; S.m = months[0]; S.day = null; MX.mode = 'monthly'; MX.m = months[0];
      refreshMonthOptions(); updateMeta(); render(true);
      toast('Data baru diterapkan ke dashboard');
    },
    reset() { this.apply(ORIGINAL, '', ''); }
  };
  updateMeta();
  render(true);
})();
