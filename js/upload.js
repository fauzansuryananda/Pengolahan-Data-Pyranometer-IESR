/* Upload Raw Data — gabung beberapa .xlsx → Source.Name | Date | Pyranometer(W/m2)
   → + Month (nama bulan) → + Hour (00–23) → + kWh/m2/days = (W/1000) × (1/60) → agregasi untuk dashboard.
   Semua proses berjalan di browser (tidak ada data yang dikirim ke server). */
(function () {
  'use strict';
  const App = window.PyranoApp;
  const $ = (s, r = document) => r.querySelector(s);
  if (!App || !$('#upOpen')) return;

  const modal = $('#upModal'), drop = $('#upDrop'), input = $('#upInput'), folderInput = $('#upFolder'), listEl = $('#upFiles'), msgEl = $('#upMsg');
  const resEl = $('#upResult'), progEl = $('#upProg'), barEl = $('#upBar'), progTxt = $('#upProgTxt');
  const btnApply = $('#upApply'), btnDl = $('#upDownload'), btnReset = $('#upReset'), nameEl = $('#upName');
  const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const pad2 = n => String(n).padStart(2, '0');
  const nf = n => n.toLocaleString('id-ID');
  const tick = () => new Promise(r => setTimeout(r, 30));
  const slug = s => String(s).replace(/[^\w]+/g, '_');
  const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let lastYield = 0;
  const maybeYield = async () => { if (performance.now() - lastYield > 60) { await new Promise(r => setTimeout(r, 0)); lastYield = performance.now(); } };

  const files = [];   // { name,size,ts[],w[],skipped,neg,info,error }
  let result = null, busy = false;

  /* ---------- modal ---------- */
  function openModal() {
    modal.hidden = false; btnReset.hidden = !App.isCustom();
    if (!nameEl.value) nameEl.value = App.sensorName();
    setTimeout(() => $('#upPickFolder').focus(), 30);
  }
  const closeModal = () => { if (!busy) modal.hidden = true; };
  $('#upOpen').addEventListener('click', openModal);
  $('#upClose').addEventListener('click', closeModal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  /* ---------- pilih / seret file atau folder ---------- */
  $('#upPickFiles').addEventListener('click', () => input.click());
  $('#upPickFolder').addEventListener('click', () => folderInput.click());
  drop.addEventListener('click', e => { if (!e.target.closest('button')) folderInput.click(); });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  folderInput.addEventListener('change', () => { addFiles(folderInput.files); folderInput.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('over'); });

  // menelusuri folder (termasuk sub-folder) dari drag & drop
  const readEntries = r => new Promise((res, rej) => { const all = []; const next = () => r.readEntries(b => { if (!b.length) res(all); else { all.push(...b); next(); } }, rej); next(); });
  async function walk(entry, out) {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); f.relPath = entry.fullPath.replace(/^\//, ''); out.push(f); }
    else if (entry.isDirectory) { for (const k of await readEntries(entry.createReader())) await walk(k, out); }
  }
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    const items = [...(e.dataTransfer.items || [])], fallback = [...e.dataTransfer.files];
    const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);   // harus diambil sinkron
    if (!entries.length) { addFiles(fallback); return; }
    try { msg('Membaca isi folder…'); const out = []; for (const en of entries) await walk(en, out); msg(''); addFiles(out); }
    catch (err) { msg('Gagal membaca folder: ' + (err.message || err)); }
  });

  const msg = t => { msgEl.hidden = !t; msgEl.textContent = t || ''; };
  const setBusy = b => { busy = b; btnApply.disabled = b || !result; btnDl.disabled = b || !result; };
  function prog(p, t) { progEl.hidden = false; barEl.style.width = Math.round(p * 100) + '%'; progTxt.textContent = t; }

  /* ---------- parsing ---------- */
  // tanggal Excel (serial) atau teks → milidetik UTC "jam dinding" (tanpa pergeseran zona waktu)
  function parseDate(v, flags) {
    if (typeof v === 'number') return Math.round((v - 25569) * 864e5 / 1000) * 1000;
    if (v instanceof Date) return v.getTime();
    if (typeof v !== 'string') return NaN;
    const s = v.trim();
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { flags.text = true; return Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T](\d{1,2})[:.](\d{2})(?::(\d{2}))?)?\s*(AM|PM)?/i);
    if (m) {
      flags.text = true;
      let a = +m[1], b = +m[2], h = +(m[4] || 0);
      const dayFirst = a > 12, day = dayFirst ? a : b, mon = dayFirst ? b : a;   // default bulan/hari/tahun, mis. 4/1/2023 12:01:14 AM
      if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      return Date.UTC(+m[3], mon - 1, day, h, +(m[5] || 0), +(m[6] || 0));
    }
    return NaN;
  }
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') { const n = parseFloat(v.trim().replace(',', '.')); return isFinite(n) ? n : null; }
    return null;
  }
  // cari kolom Date & Pyranometer(W/m2) lewat nama header (urutan kolom bebas)
  function findCols(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i] || []; let d = -1, p = -1;
      r.forEach((c, j) => {
        if (typeof c !== 'string') return;
        const t = c.trim().toLowerCase();
        if (d < 0 && /^(date|tanggal|datetime|date.?time|time|waktu|timestamp)/.test(t)) d = j;
        if (p < 0 && /pyrano|w\/m|irradi|radiasi/.test(t)) p = j;
      });
      if (d >= 0 && p >= 0) return { d, p, start: i + 1, hd: String(r[d]), hp: String(r[p]) };
    }
    const f = rows[0] || [];   // tanpa header: kolom 1 = Date, kolom 2 = Pyranometer
    if (!isNaN(parseDate(f[0], {})) && parseNum(f[1]) != null) return { d: 0, p: 1, start: 0, hd: 'kolom 1', hp: 'kolom 2' };
    return null;
  }
  async function readFile(f) {
    const rec = { name: f.name, size: f.size, ts: [], w: [], skipped: 0, neg: 0, info: '', error: '' };
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', dense: true });
      let rows = null, cols = null, sheet = '';
      for (const n of wb.SheetNames) {
        const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
        const c = findCols(r);
        if (c) { rows = r; cols = c; sheet = n; break; }
      }
      if (!cols) throw new Error('Kolom "Date" dan "Pyranometer(W/m2)" tidak ditemukan');
      const flags = {};
      for (let i = cols.start; i < rows.length; i++) {
        const row = rows[i], ts = parseDate(row[cols.d], flags), w = parseNum(row[cols.p]);
        if (isNaN(ts) || w == null) { rec.skipped++; continue; }
        rec.ts.push(ts); rec.w.push(w); if (w < 0) rec.neg++;
      }
      if (!rec.ts.length) throw new Error('Tidak ada baris data yang valid');
      rec.info = `Sheet "${sheet}" · ${cols.hd} & ${cols.hp}` + (flags.text ? ' · tanggal teks dibaca bulan/hari/tahun' : '') + (rec.skipped ? ` · ${nf(rec.skipped)} baris kosong/tidak valid dilewati` : '');
    } catch (e) { rec.error = e.message || 'Gagal membaca file'; }
    return rec;
  }

  const isXlsx = f => /\.xls[xm]$/i.test(f.name) && !f.name.startsWith('~$');
  const pathOf = f => (f.relPath || f.webkitRelativePath || f.name);
  const folderOf = p => { const s = p.split('/'); return s.length > 1 ? s[s.length - 2] : '(file langsung)'; };

  async function addFiles(list) {
    if (busy) return;
    const arr = [...list], okExt = arr.filter(isXlsx);
    const keyOf = f => pathOf(f) + '|' + f.size;
    const dup = okExt.filter(f => files.some(x => x.key === keyOf(f)));
    const fresh = okExt.filter(f => !dup.includes(f));
    const notes = [];
    const hidden = arr.filter(f => f.name.startsWith('~$')).length, other = arr.length - okExt.length - hidden;
    if (other > 0) notes.push(`${other} file selain .xlsx dilewati.`);
    if (hidden > 0) notes.push(`${hidden} file sementara Excel (~$) dilewati.`);
    if (dup.length) notes.push(`${dup.length} file yang sama sudah ada dan dilewati.`);
    msg(notes.join(' '));
    if (!window.XLSX) { msg('Library pembaca Excel tidak ditemukan (js/vendor/xlsx.mini.min.js).'); return; }
    if (!fresh.length) { if (!arr.length) msg('Tidak ada file .xlsx yang ditemukan.'); else if (!okExt.length) msg('Tidak ada file .xlsx pada pilihan Anda.'); return; }
    setBusy(true);
    for (let i = 0; i < fresh.length; i++) {
      const p = pathOf(fresh[i]);
      prog(i / fresh.length, `Membaca ${p} (${i + 1}/${fresh.length})…`);
      await maybeYield();
      const rec = await readFile(fresh[i]);
      rec.path = p; rec.folder = folderOf(p); rec.key = keyOf(fresh[i]);
      files.push(rec);
      if (i % 5 === 4 || i === fresh.length - 1) renderFiles();
    }
    renderFiles(); prog(1, 'Menggabungkan & mentransformasi…'); await tick();
    compute(); progEl.hidden = true; setBusy(false);
  }
  function removeGroup(folder) { for (let i = files.length - 1; i >= 0; i--) if (files[i].folder === folder) files.splice(i, 1); renderFiles(); compute(); }
  function renderFiles() {
    listEl.innerHTML = '';
    files.sort((x, y) => (x.path || x.name).localeCompare(y.path || y.name, undefined, { numeric: true }));
    const groups = new Map();
    files.forEach(f => { if (!groups.has(f.folder)) groups.set(f.folder, []); groups.get(f.folder).push(f); });
    groups.forEach((arr, folder) => {
      const rows = arr.reduce((a, f) => a + f.ts.length, 0), bad = arr.filter(f => f.error);
      const li = document.createElement('li'); li.className = bad.length === arr.length ? 'bad' : '';
      li.innerHTML = '<details><summary><span class="ico"></span><span class="nm"><span></span><small></small></span><span class="rows"></span><button type="button" aria-label="Hapus grup">×</button></summary><ul class="sub"></ul></details>';
      $('.ico', li).textContent = bad.length ? '!' : '✓';
      $('.nm span', li).textContent = folder === '(file langsung)' ? folder : '📁 ' + folder;
      $('.nm small', li).textContent = `${arr.length} file` + (bad.length ? ` · ${bad.length} gagal dibaca` : ' · semua valid') + ' · klik untuk melihat rincian';
      $('.rows', li).textContent = rows ? `${nf(rows)} baris` : '';
      $('summary button', li).addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); removeGroup(folder); });
      const sub = $('.sub', li);
      arr.forEach(f => {
        const s = document.createElement('li'); s.className = f.error ? 'bad' : ''; s.title = f.info || f.error;
        s.innerHTML = '<span></span><span></span>'; s.children[0].textContent = f.name;
        s.children[1].textContent = f.error ? f.error : `${nf(f.ts.length)} baris`; sub.appendChild(s);
      });
      listEl.appendChild(li);
    });
  }

  /* ---------- transformasi & agregasi ---------- */
  const fmtDate = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`; };
  const okFiles = () => files.filter(f => !f.error).sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name, undefined, { numeric: true }));

  function compute() {
    const ok = okFiles();
    if (!ok.length) { result = null; resEl.hidden = true; btnApply.disabled = btnDl.disabled = true; if (files.length) msg('Tidak ada file yang valid.'); return; }
    const yc = {}; let minT = Infinity, maxT = -Infinity, neg = 0, skipped = 0;
    ok.forEach(f => { neg += f.neg; skipped += f.skipped; f.ts.forEach(t => { const y = new Date(t).getUTCFullYear(); yc[y] = (yc[y] || 0) + 1; if (t < minT) minT = t; if (t > maxT) maxT = t; }); });
    const year = +Object.entries(yc).sort((a, b) => b[1] - a[1])[0][0];
    const SZ = 13 * 32 * 24, kS = new Float64Array(SZ), wS = new Float64Array(SZ), nC = new Float64Array(SZ);
    let total = 0, other = 0;
    ok.forEach(f => {
      for (let i = 0; i < f.ts.length; i++) {
        const d = new Date(f.ts[i]);
        if (d.getUTCFullYear() !== year) { other++; continue; }
        const idx = ((d.getUTCMonth() + 1) * 32 + d.getUTCDate()) * 24 + d.getUTCHours(), w = f.w[i];
        kS[idx] += (w / 1000) * (1 / 60); wS[idx] += w; nC[idx]++; total++;
      }
    });
    const rows = [], monthsSeen = new Set(), daySeen = new Set();
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) for (let h = 0; h < 24; h++) {
      const idx = (m * 32 + d) * 24 + h;
      if (nC[idx]) { rows.push([m, d, h, Math.round(kS[idx] * 1e7) / 1e7, Math.round(wS[idx] / nC[idx] * 1e4) / 1e4, nC[idx]]); monthsSeen.add(m); daySeen.add(m * 100 + d); }
    }
    let missing = 0; monthsSeen.forEach(m => { const n = new Date(year, m, 0).getDate(); for (let d = 1; d <= n; d++) if (!daySeen.has(m * 100 + d)) missing++; });
    result = { raw: { sensor: nameEl.value || App.sensorName(), year, cols: ['month', 'day', 'hour', 'kwh', 'wm2', 'n'], rows }, files: ok.length, total, other, year, months: monthsSeen.size, missing, minT, maxT, neg, skipped };
    renderResult(ok);
  }

  function renderResult(ok) {
    const r = result;
    $('#upS1').textContent = `${nf(r.total + r.other)} baris dari ${r.files} file → kolom Source.Name, Date, Pyranometer(W/m2)`;
    $('#upS2').textContent = 'Month = nama bulan dari kolom Date (January, February, …)';
    $('#upS3').textContent = 'Hour = jam dari kolom Date, bilangan bulat 00–23';
    const stat = [['Baris data', nf(r.total)], ['File digabung', r.files], ['Periode', `${fmtDate(r.minT).slice(0, 10)} → ${fmtDate(r.maxT).slice(0, 10)}`],
      ['Tahun · bulan', `${r.year} · ${r.months} bulan`], ['Hari tanpa data', nf(r.missing)]];
    $('#upStats').innerHTML = stat.map(s => `<div><small>${s[0]}</small><b>${s[1]}</b></div>`).join('');
    const tbl = ['<thead><tr><th>Source.Name</th><th>Date</th><th>Pyranometer(W/m2)</th><th>Month</th><th>Hour</th><th>kWh/m2/days</th></tr></thead><tbody>'];
    let shown = 0;
    for (const f of ok) { for (let i = 0; i < f.ts.length && shown < 8; i++, shown++) {
      const w = f.w[i];
      tbl.push(`<tr><td>${f.name.replace(/</g, '&lt;')}</td><td>${fmtDate(f.ts[i])}</td><td class="n">${w}</td><td>${MONTH_EN[new Date(f.ts[i]).getUTCMonth()]}</td><td class="n">${pad2(new Date(f.ts[i]).getUTCHours())}</td><td class="n">${((w / 1000) * (1 / 60)).toFixed(8)}</td></tr>`); } if (shown >= 8) break; }
    $('#upPreview').innerHTML = tbl.join('') + '</tbody>';
    const notes = [];
    if (r.other) notes.push(`${nf(r.other)} baris dari tahun lain diabaikan (dashboard memakai tahun ${r.year}).`);
    if (r.neg) notes.push(`${nf(r.neg)} baris bernilai negatif tetap dihitung apa adanya.`);
    if (r.missing) notes.push('Hari tanpa data ditampilkan bernilai 0 pada chart dan matrix.');
    msg(notes.join(' '));
    resEl.hidden = false; btnApply.disabled = btnDl.disabled = false;
  }

  /* ---------- aksi ---------- */
  btnApply.addEventListener('click', () => {
    if (!result) return;
    const name = nameEl.value.trim();
    result.raw.sensor = name || App.sensorName();
    App.apply(result.raw, name, `${result.files} file .xlsx yang diunggah`);
    modal.hidden = true; btnReset.hidden = false;
  });
  btnReset.addEventListener('click', () => { App.reset(); btnReset.hidden = true; modal.hidden = true; });

  async function downloadXlsx() {
    if (!result || busy) return;
    modal.hidden = false; setBusy(true); prog(.1, 'Menyusun file hasil transformasi…'); await tick();
    try {
      const ws = {}, E = XLSX.utils.encode_cell;
      ['Source.Name', 'Date', 'Pyranometer(W/m2)', 'Month', 'Hour', 'kWh/m2/days'].forEach((h, c) => { ws[E({ r: 0, c })] = { t: 's', v: h }; });
      let r = 1;
      for (const f of okFiles()) for (let i = 0; i < f.ts.length; i++, r++) {
        const w = f.w[i], t = f.ts[i], R = r + 1;
        ws['A' + R] = { t: 's', v: f.name };
        ws['B' + R] = { t: 'n', v: t / 864e5 + 25569, z: 'yyyy-mm-dd hh:mm:ss' };
        ws['C' + R] = { t: 'n', v: w };
        const dt = new Date(t);
        ws['D' + R] = { t: 's', v: MONTH_EN[dt.getUTCMonth()] };
        ws['E' + R] = { t: 'n', v: dt.getUTCHours(), z: '00' };
        ws['F' + R] = { t: 'n', v: (w / 1000) * (1 / 60), z: '0.000000' };
      }
      ws['!ref'] = `A1:F${r}`; ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 7 }, { wch: 14 }];
      prog(.6, 'Menulis file .xlsx…'); await tick();
      const out = XLSX.write({ SheetNames: ['Data'], Sheets: { Data: ws } }, { bookType: 'xlsx', type: 'array', compression: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `${slug(nameEl.value || App.sensorName())}_Data_Transformasi_${result.year}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { msg('Gagal membuat file .xlsx: ' + (e.message || e)); }
    progEl.hidden = true; setBusy(false);
  }
  btnDl.addEventListener('click', downloadXlsx);

  // item tambahan di menu Export CSV setelah data hasil olahan diterapkan
  const menu = $('#exportMenu');
  function syncMenuItem() {
    let b = $('#exRaw');
    if (!App.isCustom()) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button');
    b.type = 'button'; b.id = 'exRaw'; b.setAttribute('role', 'menuitem');
    b.innerHTML = 'Data hasil olahan (.xlsx) <small>gabungan raw · Month · Hour · kWh/m2/days</small>';
    b.addEventListener('click', () => { menu.hidden = true; $('#exportBtn').setAttribute('aria-expanded', 'false'); downloadXlsx(); });
    menu.appendChild(b);
  }
  btnApply.addEventListener('click', () => setTimeout(syncMenuItem, 0));
  btnReset.addEventListener('click', () => setTimeout(syncMenuItem, 0));
})();
