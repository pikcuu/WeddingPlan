/* ==========================================================
   LOGIKA WEBSITE — Menuju Hari Bahagia
   Alur: PIN → muat data (Google Sheet / mode demo) → render.
   Setiap perubahan langsung tampil di layar, lalu disimpan ke
   Google Sheet secara berurutan. Jika gagal, tampilan dikembalikan
   ke data terakhir dari server.
   ========================================================== */
(function(){
  "use strict";

  /* ================= KONSTANTA ================= */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const API_URL = String(CONFIG.APPS_SCRIPT_URL || "").trim();
  const hasBackend = API_URL !== "";
  const FALLBACK_PIN = String(CONFIG.FALLBACK_PIN || "");
  const TEMPLATE = typeof CHECKLIST_TEMPLATE !== "undefined" ? CHECKLIST_TEMPLATE : [];
  const KATEGORI = typeof KATEGORI_SARAN !== "undefined" ? KATEGORI_SARAN : [];

  const KEY_DEMO = "wedding_demo_state_v1";
  const KEY_PIN = "wedding_pin_v2";
  const KEY_CACHE = "wedding_cache_v2";
  const KEY_GATE_MSG = "wedding_gate_msg";

  const REQUEST_TIMEOUT = 20000;
  const AUTO_REFRESH_MS = 60000;

  const STATUS_TAHAP = ["Belum Mulai", "Berjalan", "Selesai"];
  const STATUS_VENDOR = ["Dipertimbangkan", "Dihubungi", "Deal"];
  // Awalan nama yang dilewati saat mengambil nama panggilan / inisial
  const NAME_PREFIXES = ["moh", "moh.", "muh", "muh.", "muhammad", "mohammad", "mohamad", "muhamad", "m", "m.", "andi", "a.", "st", "st."];

  const ERRORS = {
    PIN_INVALID: "PIN belum tepat, coba lagi.",
    PIN_NOT_SET: "PIN belum diisi di tab Config pada Google Sheet.",
    TOO_MANY_ATTEMPTS: "Terlalu banyak percobaan PIN salah. Akses dikunci sementara, coba lagi 15 menit lagi.",
    BUSY: "Google Sheet sedang sibuk. Coba lagi beberapa detik lagi.",
    NOT_FOUND: "Data tidak ditemukan — mungkin sudah dihapus dari perangkat lain.",
    BAD_REQUEST: "Permintaan tidak valid. Muat ulang halaman lalu coba lagi.",
    NETWORK: "Tidak bisa terhubung ke Google Sheet. Periksa koneksi internet.",
    TIMEOUT: "Google Sheet terlalu lama merespons. Coba lagi.",
    SERVER: "Respons server tidak dikenali. Pastikan Code.gs terbaru sudah di-deploy ulang (Deploy › Manage deployments › New version).",
    UNKNOWN: "Terjadi kesalahan. Coba lagi."
  };

  const ENTITY_LABEL = { timeline: "tahapan", checklist: "tugas", budget: "pos anggaran", vendor: "vendor", gallery: "foto" };
  const PHOTO_HINT = "Bisa link gambar langsung, atau link share Google Drive (atur akses: \"Siapa saja yang memiliki link\"). Link Google Photos belum didukung.";

  const ICON_PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>'
  };
  const ICONS = {};
  Object.keys(ICON_PATHS).forEach(k => {
    ICONS[k] = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[k]}</svg>`;
  });

  /* ================= STATE ================= */
  let STATE = null;          // data yang sedang tampil (termasuk perubahan yang belum tersimpan)
  let serverState = null;    // data terakhir yang dikonfirmasi server
  let pin = "";
  let pendingWrites = 0;
  let writeChain = Promise.resolve();
  let reqSeq = 0;
  let appliedSeq = 0;
  let refreshing = false;
  let lastSyncAt = null;
  let syncMode = hasBackend ? "loading" : "demo";
  let appShown = false;
  let lightboxIndex = -1;
  let countdownTimer = null;
  let lastHeroPhoto = null;
  const filters = { checklist: "semua", vendor: "semua" };

  /* ================= UTIL ================= */
  function esc(value){
    return String(value === null || value === undefined ? "" : value)
      .replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
  }
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const pad = n => String(n).padStart(2, "0");
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
  const uniq = arr => {
    const seen = new Set();
    return arr.map(x => String(x || "").trim()).filter(x => {
      const key = x.toLowerCase();
      if (!x || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  function toNumber(v){
    if (typeof v === "number") return isFinite(v) ? v : 0;
    return Number(String(v || "").replace(/[^\d-]/g, "")) || 0;
  }
  function formatRupiah(n){ return "Rp " + Math.round(toNumber(n)).toLocaleString("id-ID"); }
  function rupiahShort(n){
    n = toNumber(n);
    const fmt = x => x.toLocaleString("id-ID", { maximumFractionDigits: 1 });
    if (n >= 1e9) return `Rp ${fmt(n / 1e9)} M`;
    if (n >= 1e6) return `Rp ${fmt(n / 1e6)} jt`;
    if (n >= 1e3) return `Rp ${fmt(n / 1e3)} rb`;
    return `Rp ${n}`;
  }

  /** Terima "2026-11-24", "2026-11-24 09:00:00", "2026-11-24T09:00" (waktu lokal) atau ISO dengan zona. */
  function parseDate(v){
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function formatDate(v, opts){
    const d = parseDate(v);
    if (!d) return String(v || "");
    return d.toLocaleDateString("id-ID", opts || { day: "numeric", month: "long", year: "numeric" });
  }
  function dayDiff(d){
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }
  function toInputDate(v){
    const d = parseDate(v);
    return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
  }
  function toInputDateTime(v){
    const d = parseDate(v);
    return d ? `${toInputDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  }

  /** Info tenggat: label & kelas warna (terlambat / dekat). */
  function dueInfo(value, done){
    const d = parseDate(value);
    if (!d) return null;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const label = formatDate(d, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
    if (done) return { cls: "is-muted", text: label };
    const n = dayDiff(d);
    if (n < 0) return { cls: "is-late", text: `${label} · terlambat ${-n} hari` };
    if (n === 0) return { cls: "is-soon", text: "Hari ini" };
    if (n === 1) return { cls: "is-soon", text: "Besok" };
    if (n <= 7) return { cls: "is-soon", text: `${label} · ${n} hari lagi` };
    return { cls: "", text: label };
  }

  function firstName(full){
    const words = String(full || "").trim().split(/\s+/).filter(Boolean);
    return words.find(w => !NAME_PREFIXES.includes(w.toLowerCase())) || words[0] || "";
  }

  function safeUrl(url){
    const s = String(url || "").trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }
  /** Link share Google Drive → link gambar yang bisa ditampilkan. */
  function driveFileId(url){
    const s = String(url || "");
    if (!/(drive|docs)\.google\.com|googleusercontent\.com\/d\//.test(s)) return null;
    const m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
    return m ? m[1] : null;
  }
  function imageSrc(url){
    const id = driveFileId(url);
    return id ? `https://lh3.googleusercontent.com/d/${id}` : safeUrl(url);
  }
  function imageFallback(url){
    const id = driveFileId(url);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : "";
  }

  /** Ambil nomor WhatsApp dari teks kontak (08xx / +62 / 62). */
  function waNumber(kontak){
    const m = String(kontak || "").match(/\+?\d[\d\s().-]{6,}\d/);
    if (!m) return null;
    let d = m[0].replace(/\D/g, "");
    if (d.startsWith("0")) d = "62" + d.slice(1);
    else if (d.startsWith("8")) d = "62" + d;
    return d.length >= 10 && d.length <= 15 ? d : null;
  }

  /* ================= PENYIMPANAN BROWSER ================= */
  function storageGet(kind, key){ try { return window[kind].getItem(key); } catch (e){ return null; } }
  function storageSet(kind, key, value){ try { window[kind].setItem(key, value); } catch (e){ /* penyimpanan diblokir */ } }
  function storageRemove(kind, key){ try { window[kind].removeItem(key); } catch (e){ /* penyimpanan diblokir */ } }

  // PIN disimpan di localStorage jika "Ingat di perangkat ini" dicentang, selain itu hanya untuk sesi ini.
  function getSavedPin(){ return storageGet("localStorage", KEY_PIN) || storageGet("sessionStorage", KEY_PIN); }
  function pinStorage(){ return storageGet("localStorage", KEY_PIN) !== null ? "localStorage" : "sessionStorage"; }
  function savePin(value, remember){
    storageRemove("localStorage", KEY_PIN);
    storageRemove("sessionStorage", KEY_PIN);
    storageSet(remember ? "localStorage" : "sessionStorage", KEY_PIN, value);
  }
  function clearSession(){
    ["localStorage", "sessionStorage"].forEach(kind => {
      storageRemove(kind, KEY_PIN);
      storageRemove(kind, KEY_CACHE);
    });
  }
  function readCache(){
    const raw = storageGet("localStorage", KEY_CACHE) || storageGet("sessionStorage", KEY_CACHE);
    try { return raw ? normalizeState(JSON.parse(raw)) : null; } catch (e){ return null; }
  }
  function writeCache(state){ if (hasBackend && state) storageSet(pinStorage(), KEY_CACHE, JSON.stringify(state)); }

  function loadDemo(){
    try {
      const raw = storageGet("localStorage", KEY_DEMO);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e){ /* data rusak → pakai data contoh */ }
    return normalizeState(Object.assign({ config: CONFIG.FALLBACK }, clone(DEMO_DATA)));
  }
  function saveDemo(){ storageSet("localStorage", KEY_DEMO, JSON.stringify(STATE)); }

  function normalizeState(data){
    data = data || {};
    const list = arr => (Array.isArray(arr) ? arr.filter(x => x && typeof x === "object") : []);
    const config = {};
    Object.keys(data.config || {}).forEach(k => {
      if (data.config[k] !== null && data.config[k] !== undefined) config[k] = data.config[k];
    });
    return {
      config: Object.assign({}, CONFIG.FALLBACK, config),
      timeline: list(data.timeline).map(s => Object.assign({}, s, { status: STATUS_TAHAP.includes(s.status) ? s.status : "Belum Mulai" })),
      checklist: list(data.checklist).map(c => Object.assign({}, c, { selesai: c.selesai === true || String(c.selesai).toLowerCase() === "true" })),
      budget: list(data.budget).map(b => Object.assign({}, b, { estimasi: toNumber(b.estimasi), aktual: toNumber(b.aktual) })),
      vendor: list(data.vendor).map(v => Object.assign({}, v, { status: STATUS_VENDOR.includes(v.status) ? v.status : "Dipertimbangkan" })),
      gallery: list(data.gallery)
    };
  }

  /* ================= JARINGAN ================= */
  function appError(code, detail){
    const err = new Error(detail || code);
    err.code = code;
    return err;
  }
  const errorMessage = err => ERRORS[err && err.code] || (err && err.message) || ERRORS.UNKNOWN;
  const isNetworkError = err => !!err && (err.code === "NETWORK" || err.code === "TIMEOUT");

  async function http(method, params){
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (controller) controller.abort(); }, REQUEST_TIMEOUT);
    try {
      let res;
      if (method === "GET"){
        const qs = new URLSearchParams(Object.assign({}, params, { _: Date.now() })).toString();
        res = await fetch(`${API_URL}${API_URL.includes("?") ? "&" : "?"}${qs}`, { signal: controller && controller.signal });
      } else {
        res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" }, // hindari preflight CORS di Apps Script
          body: JSON.stringify(params),
          signal: controller && controller.signal
        });
      }
      if (!res.ok) throw appError("NETWORK", `HTTP ${res.status}`);
      let json;
      try { json = await res.json(); } catch (e){ throw appError("SERVER"); }
      if (!json || typeof json.ok !== "boolean") throw appError("SERVER");
      if (!json.ok) throw appError(json.error || "UNKNOWN");
      return json.data;
    } catch (err){
      if (err && err.code) throw err;
      if (err && err.name === "AbortError") throw appError("TIMEOUT");
      throw appError("NETWORK", err && err.message);
    } finally {
      clearTimeout(timer);
    }
  }

  function applyServerState(data, seq){
    if (seq < appliedSeq) return; // respons lama datang terlambat → abaikan
    appliedSeq = seq;
    serverState = normalizeState(data);
    writeCache(serverState);
    lastSyncAt = new Date();
    syncMode = "ok";
    if (pendingWrites === 0){
      const changed = JSON.stringify(STATE) !== JSON.stringify(serverState);
      STATE = clone(serverState);
      if (changed) renderAll();
    }
    updateSync();
  }

  async function refresh(opts){
    opts = opts || {};
    if (!hasBackend){
      if (opts.manual) toast("Mode demo — data tersimpan di browser ini saja.", "info");
      return;
    }
    if (refreshing || pendingWrites > 0) return;
    refreshing = true;
    if (!opts.silent){
      syncMode = "loading";
      updateSync();
    }
    const seq = ++reqSeq;
    try {
      const data = await http("GET", { action: "all", pin });
      if (pendingWrites === 0) applyServerState(data, seq);
      if (syncMode === "loading") syncMode = "ok";
      if (opts.manual) toast("Data terbaru sudah dimuat.", "success");
    } catch (err){
      handleSyncError(err, { silent: opts.silent });
    } finally {
      refreshing = false;
      updateSync();
    }
  }

  function handleSyncError(err, opts){
    opts = opts || {};
    if (err && (err.code === "PIN_INVALID" || err.code === "PIN_NOT_SET")){
      lockApp(err.code === "PIN_INVALID" ? "PIN telah berubah. Masukkan PIN terbaru." : errorMessage(err));
      return;
    }
    syncMode = isNetworkError(err) ? "offline" : "error";
    updateSync();
    if (!opts.silent) toast((opts.prefix || "") + errorMessage(err), "error", 5000);
  }

  /**
   * Simpan perubahan: terapkan langsung di layar, lalu kirim ke server
   * secara berurutan (antrean) supaya tidak saling menimpa.
   */
  function commit(action, payload, opts){
    opts = opts || {};
    applyLocal(action, payload);
    renderAll();

    if (!hasBackend){
      saveDemo();
      if (opts.success) toast(opts.success, "success");
      return Promise.resolve(true);
    }

    pendingWrites++;
    updateSync();
    const job = writeChain.then(async () => {
      const seq = ++reqSeq;
      try {
        const data = await http("POST", Object.assign({ action, pin }, payload));
        pendingWrites--;
        applyServerState(data, seq);
        if (opts.success) toast(opts.success, "success");
        return true;
      } catch (err){
        pendingWrites--;
        if (pendingWrites === 0 && serverState){
          STATE = clone(serverState);
          renderAll();
        }
        handleSyncError(err, { prefix: "Gagal menyimpan. " });
        return false;
      } finally {
        updateSync();
      }
    });
    writeChain = job;
    return job;
  }

  function applyLocal(action, p){
    const list = p.entity ? STATE[p.entity] : null;
    const nextId = () => list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
    const mark = hasBackend ? { _pending: true } : {};
    switch (action){
      case "add":
        list.push(Object.assign({ id: nextId() }, p.data, mark));
        break;
      case "addMany":
        p.items.forEach(data => list.push(Object.assign({ id: nextId() }, data, mark)));
        break;
      case "update": {
        const item = list.find(x => Number(x.id) === Number(p.id));
        if (item) Object.assign(item, p.data);
        break;
      }
      case "delete":
        STATE[p.entity] = list.filter(x => Number(x.id) !== Number(p.id));
        break;
      case "updateConfig":
        Object.assign(STATE.config, p.data);
        break;
    }
  }

  function findItem(entity, id){
    return (STATE[entity] || []).find(x => Number(x.id) === Number(id)) || null;
  }

  /* ================= UI DASAR ================= */
  function injectIcons(root){
    $$("[data-icon]", root).forEach(el => {
      if (!el.firstElementChild) el.innerHTML = ICONS[el.dataset.icon] || "";
    });
  }

  function toast(message, type, ms){
    const wrap = $("#toasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = `toast toast-${type || "info"}`;
    el.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${esc(message)}</span>`;
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, ms || 3200);
  }

  function updateSync(){
    const btn = $("#syncBtn");
    if (!btn) return;
    const mode = pendingWrites > 0 ? "saving" : syncMode;
    const time = lastSyncAt ? lastSyncAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
    const labels = { ok: "Tersinkron", saving: "Menyimpan…", loading: "Memuat…", offline: "Offline", error: "Gagal sinkron", demo: "Mode demo" };
    btn.dataset.state = mode;
    $("#syncLabel").textContent = labels[mode];
    btn.title = hasBackend ? `${labels[mode]}${time ? ` · terakhir ${time}` : ""} — klik untuk memuat ulang` : "Mode demo — data hanya tersimpan di browser ini";
    btn.setAttribute("aria-label", btn.title);

    const footer = $("#syncStatus");
    if (!footer) return;
    if (!hasBackend) footer.textContent = "Mode demo — data tersimpan di browser ini saja. Hubungkan Google Sheet di js/data.js agar sinkron antar perangkat.";
    else if (mode === "offline") footer.textContent = `Offline — menampilkan data tersimpan${time ? ` (sinkron terakhir ${time})` : ""}.`;
    else if (mode === "error") footer.textContent = "Sinkronisasi bermasalah — klik indikator di atas untuk mencoba lagi.";
    else footer.textContent = `Data tersimpan di Google Sheet${time ? ` · sinkron terakhir pukul ${time}` : ""}.`;
  }

  /* ================= DIALOG ================= */
  function fieldHtml(f){
    const id = `df-${f.name}`;
    const req = f.required ? "required" : "";
    const val = f.value === null || f.value === undefined ? "" : f.value;
    const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "";
    let control;
    switch (f.type){
      case "textarea":
        control = `<textarea id="${id}" rows="3" maxlength="1000" ${req} ${ph}>${esc(val)}</textarea>`;
        break;
      case "select":
        control = `<select id="${id}">${f.options.map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
        break;
      case "currency": {
        const shown = val === "" ? "" : toNumber(val).toLocaleString("id-ID");
        control = `<div class="input-prefix"><span>Rp</span><input id="${id}" type="text" inputmode="numeric" autocomplete="off" data-currency value="${esc(shown)}" ${req} placeholder="0"></div>`;
        break;
      }
      default:
        control = `<input id="${id}" type="${f.type || "text"}" value="${esc(val)}" maxlength="${f.type === "url" ? 1000 : 300}" ${f.list ? `list="${f.list}"` : ""} ${req} ${ph}>`;
    }
    const optional = f.required || f.type === "select" ? "" : ' <span class="opt">(opsional)</span>';
    return `<div class="field${f.half ? " half" : ""}">
      <label for="${id}">${esc(f.label)}${optional}</label>
      ${control}
      ${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ""}
    </div>`;
  }

  /** Buka dialog. Mengembalikan objek nilai form, atau null jika dibatalkan. */
  function openDialog(opts){
    const dlg = $("#dialog");
    if (dlg.open) return Promise.resolve(null);
    const fields = opts.fields || [];
    $("#dialogTitle").textContent = opts.title;
    $("#dialogBody").innerHTML =
      (opts.message ? `<p class="dialog-message">${esc(opts.message)}</p>` : "") +
      (fields.length ? `<div class="field-grid">${fields.map(fieldHtml).join("")}</div>` : "");
    const ok = $("#dialogOk");
    ok.textContent = opts.submitLabel || "Simpan";
    ok.className = `btn ${opts.danger ? "btn-danger" : "btn-primary"}`;
    dlg.returnValue = "";

    return new Promise(resolve => {
      dlg.addEventListener("close", () => {
        document.body.classList.remove("no-scroll");
        if (dlg.returnValue !== "ok") return resolve(null);
        const out = {};
        fields.forEach(f => {
          const el = document.getElementById(`df-${f.name}`);
          if (!el) return;
          out[f.name] = f.type === "currency" ? toNumber(el.value) : el.value.trim();
        });
        resolve(out);
      }, { once: true });
      document.body.classList.add("no-scroll");
      dlg.showModal();
      const first = $("#dialogBody input, #dialogBody textarea, #dialogBody select");
      (first || ok).focus();
    });
  }

  /* ================= FORM DATA ================= */
  const FORM_FIELDS = {
    timeline: () => [
      { name: "tahap", label: "Nama tahap", required: true, half: true },
      { name: "namaAdat", label: "Nama adat", half: true, placeholder: "mis. Mappacci" },
      { name: "tanggal", label: "Tanggal", type: "date", half: true },
      { name: "status", label: "Status", type: "select", options: STATUS_TAHAP, half: true },
      { name: "catatan", label: "Catatan", type: "textarea" }
    ],
    checklist: () => [
      { name: "item", label: "Tugas", required: true },
      { name: "pic", label: "PIC / penanggung jawab", list: "picList", half: true },
      { name: "tenggat", label: "Tenggat", type: "date", half: true }
    ],
    budget: () => [
      { name: "kategori", label: "Kategori", required: true, list: "kategoriList", placeholder: "mis. Katering" },
      { name: "estimasi", label: "Estimasi biaya", type: "currency", required: true, half: true },
      { name: "aktual", label: "Sudah dibayar", type: "currency", half: true },
      { name: "catatan", label: "Catatan", type: "textarea", placeholder: "mis. DP 30% lunas, pelunasan H-14" }
    ],
    vendor: () => [
      { name: "nama", label: "Nama vendor", required: true },
      { name: "kategori", label: "Kategori", required: true, list: "kategoriList", half: true },
      { name: "status", label: "Status", type: "select", options: STATUS_VENDOR, half: true },
      { name: "kontak", label: "Kontak (WA/telepon)", type: "tel", half: true, placeholder: "08xx-xxxx-xxxx" },
      { name: "harga", label: "Harga / paket", half: true, placeholder: "mis. Rp 85.000/porsi" },
      { name: "catatan", label: "Catatan", type: "textarea" }
    ],
    gallery: () => [
      { name: "url", label: "Link foto", type: "url", required: true, hint: PHOTO_HINT, placeholder: "https://…" },
      { name: "caption", label: "Keterangan", placeholder: "mis. Foto prewedding di Pantai Losari" }
    ]
  };

  function formValue(field, item){
    if (!item) return field.type === "select" ? field.options[0] : "";
    const v = item[field.name];
    if (field.type === "date") return toInputDate(v);
    if (field.type === "currency") return toNumber(v);
    return v === null || v === undefined ? "" : String(v);
  }

  async function openEntityForm(entity, id){
    const item = id !== null && id !== undefined ? findItem(entity, id) : null;
    if (id !== null && id !== undefined && !item) return;
    const label = ENTITY_LABEL[entity];
    const fields = FORM_FIELDS[entity]().map(f => Object.assign({}, f, { value: formValue(f, item) }));
    const data = await openDialog({
      title: `${item ? "Ubah" : "Tambah"} ${label}`,
      fields,
      submitLabel: item ? "Simpan" : "Tambah"
    });
    if (!data) return;

    if (item){
      const changed = {};
      fields.forEach(f => { if (String(data[f.name]) !== String(f.value)) changed[f.name] = data[f.name]; });
      if (!Object.keys(changed).length) return;
      commit("update", { entity, id: item.id, data: changed }, { success: "Perubahan tersimpan." });
    } else {
      if (entity === "checklist") data.selesai = false;
      commit("add", { entity, data }, { success: `${cap(label)} ditambahkan.` });
    }
  }

  function itemName(entity, item){
    return item.item || item.nama || item.kategori || item.tahap || item.caption || ENTITY_LABEL[entity];
  }

  async function confirmDelete(entity, id){
    const item = findItem(entity, id);
    if (!item) return;
    const label = ENTITY_LABEL[entity];
    const ok = await openDialog({
      title: `Hapus ${label}?`,
      message: `"${itemName(entity, item)}" akan dihapus permanen${hasBackend ? " dari Google Sheet" : ""}. Tindakan ini tidak bisa dibatalkan.`,
      submitLabel: "Hapus",
      danger: true
    });
    if (!ok) return;
    commit("delete", { entity, id: item.id }, { success: `${cap(label)} dihapus.` });
  }

  async function openSettings(){
    const c = STATE.config;
    const data = await openDialog({
      title: "Pengaturan",
      message: hasBackend
        ? "Tersimpan ke tab Config di Google Sheet. PIN hanya bisa diubah langsung di Google Sheet."
        : "Mode demo — pengaturan hanya tersimpan di browser ini.",
      fields: [
        { name: "namaPria", label: "Nama mempelai pria", value: c.namaPria, required: true, half: true },
        { name: "namaWanita", label: "Nama mempelai wanita", value: c.namaWanita, required: true, half: true },
        { name: "tagline", label: "Tagline", value: c.tagline },
        { name: "tanggalResepsi", label: "Tanggal & jam resepsi", type: "datetime-local", value: toInputDateTime(c.tanggalResepsi), hint: "Dipakai untuk hitung mundur di bagian atas." },
        { name: "fotoHero", label: "Link foto berdua", type: "url", value: c.fotoHero, hint: PHOTO_HINT }
      ]
    });
    if (!data) return;
    if (data.tanggalResepsi) data.tanggalResepsi = data.tanggalResepsi.replace("T", " ") + ":00";
    const changed = {};
    Object.keys(data).forEach(k => {
      const before = k === "tanggalResepsi" ? toInputDateTime(c[k]) : String(c[k] || "");
      const after = k === "tanggalResepsi" ? toInputDateTime(data[k]) : data[k];
      if (before !== after) changed[k] = data[k];
    });
    if (!Object.keys(changed).length) return;
    commit("updateConfig", { data: changed }, { success: "Pengaturan tersimpan." });
  }

  async function loadTemplate(){
    const existing = new Set(STATE.checklist.map(c => String(c.item || "").trim().toLowerCase()));
    const missing = TEMPLATE.filter(t => !existing.has(t.toLowerCase()));
    if (!missing.length){
      toast("Semua tugas template sudah ada di checklist.", "info");
      return;
    }
    const ok = await openDialog({
      title: "Muat template checklist?",
      message: `${missing.length} tugas persiapan pernikahan adat Bugis akan ditambahkan. Tugas yang sudah ada tidak diduplikasi, dan semuanya bisa diubah atau dihapus kapan saja.`,
      submitLabel: "Tambahkan"
    });
    if (!ok) return;
    commit("addMany", {
      entity: "checklist",
      items: missing.map(item => ({ item, pic: "", tenggat: "", selesai: false }))
    }, { success: `${missing.length} tugas ditambahkan.` });
  }

  /* ================= RENDER: HERO ================= */
  function renderHero(){
    const c = STATE.config;
    const pria = String(c.namaPria || "").trim();
    const wanita = String(c.namaWanita || "").trim();
    $("#heroNames").innerHTML = pria && wanita
      ? `<span>${esc(pria)}</span><span class="amp">&amp;</span><span>${esc(wanita)}</span>`
      : `<span>${esc(pria || wanita)}</span>`;
    $("#heroTagline").textContent = c.tagline || "";
    $("#heroTagline").hidden = !c.tagline;

    const short = [firstName(pria), firstName(wanita)].filter(Boolean).join(" & ");
    document.title = short ? `${short} · Menuju Hari Bahagia` : "Menuju Hari Bahagia";
    $("#footerNames").textContent = short;

    const photo = imageSrc(c.fotoHero);
    const initials = [firstName(pria), firstName(wanita)].map(n => n.charAt(0).toUpperCase());
    const photoKey = `${photo}|${initials.join("")}`;
    if (photoKey !== lastHeroPhoto){
      lastHeroPhoto = photoKey;
      const holder = $("#heroPhoto");
      const monogram = `<span class="monogram" aria-hidden="true">${esc(initials[0] || "")}<span class="amp">&amp;</span>${esc(initials[1] || "")}</span>`;
      holder.classList.remove("is-broken");
      holder.innerHTML = (photo ? `<img src="${esc(photo)}" data-fallback="${esc(imageFallback(c.fotoHero))}" alt="Foto ${esc(short)}">` : "") + monogram;
    }
    renderCountdown();
  }

  function renderCountdown(){
    clearInterval(countdownTimer);
    const target = parseDate(STATE.config.tanggalResepsi);
    const box = $("#countdown");
    const done = $("#heroDone");
    const dateEl = $("#heroDate");
    if (!target){
      box.hidden = true;
      done.hidden = true;
      dateEl.textContent = "Tanggal resepsi belum diatur — atur lewat tombol Pengaturan di atas.";
      return;
    }
    const hasTime = target.getHours() !== 0 || target.getMinutes() !== 0;
    dateEl.textContent = formatDate(target, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
      (hasTime ? ` · pukul ${target.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "");

    const els = { d: $("#cdDays"), h: $("#cdHours"), m: $("#cdMinutes"), s: $("#cdSeconds") };
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0){
        box.hidden = true;
        done.hidden = false;
        clearInterval(countdownTimer);
        return;
      }
      box.hidden = false;
      done.hidden = true;
      els.d.textContent = pad(Math.floor(diff / 86400000));
      els.h.textContent = pad(Math.floor((diff % 86400000) / 3600000));
      els.m.textContent = pad(Math.floor((diff % 3600000) / 60000));
      els.s.textContent = pad(Math.floor((diff % 60000) / 1000));
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ================= RENDER: RINGKASAN ================= */
  function renderSummary(){
    const tl = STATE.timeline, ck = STATE.checklist, bg = STATE.budget, vd = STATE.vendor;
    const tDone = tl.filter(s => s.status === "Selesai").length;
    const next = tl.find(s => s.status !== "Selesai");
    const cDone = ck.filter(c => c.selesai).length;
    const est = bg.reduce((s, b) => s + b.estimasi, 0);
    const akt = bg.reduce((s, b) => s + b.aktual, 0);
    const deal = vd.filter(v => v.status === "Deal").length;
    const contacted = vd.filter(v => v.status === "Dihubungi").length;

    const cards = [
      {
        href: "#timeline", label: "Tahapan adat", value: `${tDone}/${tl.length}`, pct: pct(tDone, tl.length),
        note: !tl.length ? "Belum ada tahapan" : next ? `Berikutnya: ${next.namaAdat || next.tahap}` : "Semua tahapan selesai"
      },
      {
        href: "#checklist", label: "Checklist", value: `${pct(cDone, ck.length)}%`, pct: pct(cDone, ck.length),
        note: ck.length ? `${cDone} dari ${ck.length} tugas selesai` : "Belum ada tugas"
      },
      {
        href: "#budget", label: "Budget terpakai", value: est ? `${pct(akt, est)}%` : "–", pct: pct(akt, est), over: akt > est && est > 0,
        note: est ? `${rupiahShort(akt)} dari ${rupiahShort(est)}` : "Belum ada anggaran"
      },
      {
        href: "#vendor", label: "Vendor deal", value: `${deal}/${vd.length}`, pct: pct(deal, vd.length),
        note: vd.length ? `${contacted} sedang dihubungi` : "Belum ada vendor"
      }
    ];
    $("#stats").innerHTML = cards.map(c => `
      <a class="stat${c.over ? " is-over" : ""}" href="${c.href}">
        <span class="stat-label">${esc(c.label)}</span>
        <span class="stat-value">${esc(c.value)}</span>
        <span class="stat-meter"><span style="width:${Math.min(c.pct, 100)}%"></span></span>
        <span class="stat-note">${esc(c.note)}</span>
      </a>`).join("");

    // Agenda: tahapan & tugas yang belum selesai dan punya tanggal
    const items = [];
    tl.forEach(s => {
      const d = s.status !== "Selesai" && parseDate(s.tanggal);
      if (d) items.push({ date: d, title: s.namaAdat && s.namaAdat !== s.tahap ? `${s.tahap} · ${s.namaAdat}` : s.tahap, kind: "Tahapan", href: "#timeline" });
    });
    ck.forEach(c => {
      const d = !c.selesai && parseDate(c.tenggat);
      if (d) items.push({ date: d, title: c.item, kind: "Tugas", href: "#checklist", pic: c.pic });
    });
    items.sort((a, b) => a.date - b.date);

    const list = $("#agendaList");
    if (!items.length){
      list.innerHTML = `<li class="empty">Belum ada agenda bertanggal. Isi tanggal tahapan atau tenggat tugas agar muncul di sini.</li>`;
      return;
    }
    list.innerHTML = items.slice(0, 5).map(it => {
      const due = dueInfo(it.date, false);
      return `<li class="agenda-item">
        <div class="agenda-date"><strong>${it.date.getDate()}</strong><span>${esc(it.date.toLocaleDateString("id-ID", { month: "short" }))}</span></div>
        <div class="agenda-body">
          <a class="agenda-title" href="${it.href}">${esc(it.title)}</a>
          <div class="agenda-meta">
            <span class="tag is-muted">${it.kind}</span>
            ${it.pic ? `<span class="tag">${ICONS.user}${esc(it.pic)}</span>` : ""}
            <span class="tag ${due.cls}">${esc(due.text)}</span>
          </div>
        </div>
      </li>`;
    }).join("");
  }

  /* ================= RENDER: TIMELINE ================= */
  function statusSelect(entity, item, options){
    return `<select class="status-select is-${slug(item.status)}" data-action="status" data-entity="${entity}" data-id="${esc(item.id)}" aria-label="Status ${esc(itemName(entity, item))}" ${item._pending ? "disabled" : ""}>
      ${options.map(o => `<option ${o === item.status ? "selected" : ""}>${esc(o)}</option>`).join("")}
    </select>`;
  }

  function renderTimeline(){
    const tl = STATE.timeline;
    const wrap = $("#roadmap");
    const done = tl.filter(s => s.status === "Selesai").length;
    $("#timelineSub").textContent = tl.length ? `${done} dari ${tl.length} tahapan selesai` : "";
    if (!tl.length){
      wrap.innerHTML = `<li class="empty"><strong>Belum ada tahapan</strong>Tambahkan baris di tab Timeline pada Google Sheet.</li>`;
      return;
    }
    wrap.innerHTML = tl.map((s, i) => {
      const cls = s.status === "Selesai" ? "is-done" : s.status === "Berjalan" ? "is-progress" : "";
      return `<li class="stage ${cls}">
        <span class="stage-num" aria-hidden="true">${s.status === "Selesai" ? ICONS.check : i + 1}</span>
        <article class="stage-card">
          <div class="stage-top">
            <div>
              <h3 class="stage-name">${esc(s.tahap)}</h3>
              ${s.namaAdat && s.namaAdat !== s.tahap ? `<p class="stage-adat">${esc(s.namaAdat)}</p>` : ""}
            </div>
            <button type="button" class="icon-btn" data-action="edit" data-entity="timeline" data-id="${esc(s.id)}" aria-label="Ubah tahapan ${esc(s.tahap)}" ${s._pending ? "disabled" : ""}>${ICONS.edit}</button>
          </div>
          <p class="stage-date">${ICONS.calendar}${s.tanggal ? esc(formatDate(s.tanggal)) : "Tanggal belum ditentukan"}</p>
          ${s.catatan ? `<p class="stage-note">${esc(s.catatan)}</p>` : ""}
          ${statusSelect("timeline", s, STATUS_TAHAP)}
        </article>
      </li>`;
    }).join("");
  }

  /* ================= RENDER: CHECKLIST ================= */
  function renderChips(container, group, options){
    container.innerHTML = options.map(o => {
      const active = filters[group] === o.value;
      return `<button type="button" class="chip-btn${active ? " is-active" : ""}" data-action="filter" data-group="${group}" data-value="${esc(o.value)}" aria-pressed="${active}">
        ${esc(o.label)}<span class="count">${o.count}</span>
      </button>`;
    }).join("");
  }

  function renderChecklist(){
    const all = STATE.checklist;
    const done = all.filter(c => c.selesai).length;
    const percent = pct(done, all.length);
    $("#checklistProgressText").textContent = `${done} dari ${all.length} tugas selesai`;
    $("#checklistProgressPct").textContent = `${percent}%`;
    $("#checklistProgressFill").style.width = `${percent}%`;

    renderChips($("#checklistFilters"), "checklist", [
      { value: "semua", label: "Semua", count: all.length },
      { value: "belum", label: "Belum", count: all.length - done },
      { value: "selesai", label: "Selesai", count: done }
    ]);

    const existing = new Set(all.map(c => String(c.item || "").trim().toLowerCase()));
    $("#templateBtn").hidden = !TEMPLATE.some(t => !existing.has(t.toLowerCase()));

    let items = all.slice();
    if (filters.checklist === "belum") items = items.filter(c => !c.selesai);
    if (filters.checklist === "selesai") items = items.filter(c => c.selesai);
    // Belum selesai di atas; di dalamnya urut tenggat terdekat
    items.sort((a, b) => {
      if (a.selesai !== b.selesai) return a.selesai ? 1 : -1;
      const da = parseDate(a.tenggat), db = parseDate(b.tenggat);
      if (da && db) return da - db;
      if (da || db) return da ? -1 : 1;
      return Number(a.id) - Number(b.id);
    });

    const list = $("#checklistList");
    if (!all.length){
      list.innerHTML = `<li class="empty"><strong>Belum ada tugas</strong>Tulis tugas pertama di atas, atau mulai dari template persiapan adat Bugis.
        ${TEMPLATE.length ? `<br><button type="button" class="btn btn-soft btn-sm" data-action="template">${ICONS.sparkle}Muat template</button>` : ""}</li>`;
      return;
    }
    if (!items.length){
      list.innerHTML = `<li class="empty">Tidak ada tugas di filter ini.</li>`;
      return;
    }
    list.innerHTML = items.map(c => {
      const due = dueInfo(c.tenggat, c.selesai);
      const cls = [c.selesai ? "is-done" : "", c._pending ? "is-pending" : ""].filter(Boolean).join(" ");
      const dis = c._pending ? "disabled" : "";
      return `<li class="check-item ${cls}">
        <input type="checkbox" class="ci-check" id="ck-${esc(c.id)}" data-action="toggle" data-id="${esc(c.id)}" ${c.selesai ? "checked" : ""} ${dis}>
        <label class="ci-body" for="ck-${esc(c.id)}">
          <span class="ci-text">${esc(c.item)}</span>
          <span class="ci-meta">${c.pic ? `<span class="tag">${ICONS.user}${esc(c.pic)}</span>` : ""}${due ? `<span class="tag ${due.cls}">${ICONS.calendar}${esc(due.text)}</span>` : ""}</span>
        </label>
        <div class="ci-actions">
          <button type="button" class="icon-btn" data-action="edit" data-entity="checklist" data-id="${esc(c.id)}" aria-label="Ubah tugas" ${dis}>${ICONS.edit}</button>
          <button type="button" class="icon-btn danger" data-action="delete" data-entity="checklist" data-id="${esc(c.id)}" aria-label="Hapus tugas" ${dis}>${ICONS.trash}</button>
        </div>
      </li>`;
    }).join("");
  }

  /* ================= RENDER: BUDGET ================= */
  function renderBudget(){
    const rows = STATE.budget;
    const est = rows.reduce((s, b) => s + b.estimasi, 0);
    const akt = rows.reduce((s, b) => s + b.aktual, 0);
    const sisa = est - akt;
    const over = sisa < 0;
    const used = pct(akt, est);

    $("#budgetSummary").innerHTML = `
      <div class="bs-item"><span class="bs-label">Total estimasi</span><strong class="bs-value">${formatRupiah(est)}</strong></div>
      <div class="bs-item"><span class="bs-label">Sudah dibayar</span><strong class="bs-value">${formatRupiah(akt)}</strong></div>
      <div class="bs-item${over ? " is-over" : ""}"><span class="bs-label">${over ? "Melebihi estimasi" : "Sisa anggaran"}</span><strong class="bs-value">${formatRupiah(Math.abs(sisa))}</strong></div>`;
    const meter = $("#budgetMeter");
    meter.style.width = `${Math.min(used, 100)}%`;
    meter.classList.toggle("is-over", over);
    $("#budgetMeterText").textContent = est ? `${used}% dari total estimasi sudah dibayar` : "Tambahkan pos anggaran untuk mulai memantau pengeluaran.";
    $("#budgetCount").textContent = rows.length ? `${rows.length} pos anggaran` : "";

    const body = $("#budgetBody");
    if (!rows.length){
      body.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty"><strong>Belum ada pos anggaran</strong>Mulai dari pos besar seperti uang panai, venue, dan katering.</div></td></tr>`;
      $("#budgetFoot").innerHTML = "";
      return;
    }
    body.innerHTML = rows.map(b => {
      const s = b.estimasi - b.aktual;
      const dis = b._pending ? "disabled" : "";
      const cls = [s < 0 ? "is-over" : "", b._pending ? "is-pending" : ""].filter(Boolean).join(" ");
      return `<tr class="${cls}">
        <td class="cell-kat" data-label="Kategori"><strong>${esc(b.kategori)}</strong>${b.catatan ? `<small>${esc(b.catatan)}</small>` : ""}</td>
        <td class="num" data-label="Estimasi">${formatRupiah(b.estimasi)}</td>
        <td class="num" data-label="Dibayar">${formatRupiah(b.aktual)}</td>
        <td class="num cell-sisa" data-label="Sisa">${s < 0 ? "−" + formatRupiah(-s) : formatRupiah(s)}</td>
        <td class="cell-actions">
          <button type="button" class="icon-btn" data-action="edit" data-entity="budget" data-id="${esc(b.id)}" aria-label="Ubah ${esc(b.kategori)}" ${dis}>${ICONS.edit}</button>
          <button type="button" class="icon-btn danger" data-action="delete" data-entity="budget" data-id="${esc(b.id)}" aria-label="Hapus ${esc(b.kategori)}" ${dis}>${ICONS.trash}</button>
        </td>
      </tr>`;
    }).join("");
    $("#budgetFoot").innerHTML = `<tr>
      <td>Total</td>
      <td class="num">${formatRupiah(est)}</td>
      <td class="num">${formatRupiah(akt)}</td>
      <td class="num">${over ? "−" + formatRupiah(-sisa) : formatRupiah(sisa)}</td>
      <td></td>
    </tr>`;
  }

  /* ================= RENDER: VENDOR ================= */
  function renderVendor(){
    const all = STATE.vendor;
    renderChips($("#vendorFilters"), "vendor", [{ value: "semua", label: "Semua", count: all.length }]
      .concat(STATUS_VENDOR.map(s => ({ value: s, label: s, count: all.filter(v => v.status === s).length }))));

    const items = filters.vendor === "semua" ? all : all.filter(v => v.status === filters.vendor);
    const grid = $("#vendorGrid");
    if (!all.length){
      grid.innerHTML = `<div class="empty"><strong>Belum ada vendor</strong>Catat vendor yang sedang dipertimbangkan agar mudah dibandingkan berdua.</div>`;
      return;
    }
    if (!items.length){
      grid.innerHTML = `<div class="empty">Tidak ada vendor dengan status ini.</div>`;
      return;
    }
    grid.innerHTML = items.map(v => {
      const wa = waNumber(v.kontak);
      const dis = v._pending ? "disabled" : "";
      const waText = encodeURIComponent(`Halo ${v.nama}, saya ingin bertanya mengenai layanan ${v.kategori || ""} untuk acara pernikahan kami.`);
      return `<article class="vendor-card${v._pending ? " is-pending" : ""}">
        <div class="vc-head">
          <div>
            <h3>${esc(v.nama)}</h3>
            ${v.kategori ? `<span class="tag">${esc(v.kategori)}</span>` : ""}
          </div>
          <div class="vc-actions">
            <button type="button" class="icon-btn" data-action="edit" data-entity="vendor" data-id="${esc(v.id)}" aria-label="Ubah ${esc(v.nama)}" ${dis}>${ICONS.edit}</button>
            <button type="button" class="icon-btn danger" data-action="delete" data-entity="vendor" data-id="${esc(v.id)}" aria-label="Hapus ${esc(v.nama)}" ${dis}>${ICONS.trash}</button>
          </div>
        </div>
        ${v.harga || v.kontak ? `<dl class="vc-meta">
          ${v.harga ? `<div><dt>Harga</dt><dd>${esc(v.harga)}</dd></div>` : ""}
          ${v.kontak ? `<div><dt>Kontak</dt><dd>${esc(v.kontak)}</dd></div>` : ""}
        </dl>` : ""}
        ${v.catatan ? `<p class="vc-note">${esc(v.catatan)}</p>` : ""}
        <div class="vc-foot">
          ${statusSelect("vendor", v, STATUS_VENDOR)}
          ${wa ? `<a class="btn btn-wa btn-sm" href="https://wa.me/${wa}?text=${waText}" target="_blank" rel="noopener">${ICONS.chat}WhatsApp</a>
                  <a class="icon-btn" href="tel:+${wa}" aria-label="Telepon ${esc(v.nama)}">${ICONS.phone}</a>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  /* ================= RENDER: GALERI ================= */
  function renderGallery(){
    const items = STATE.gallery;
    const grid = $("#galleryGrid");
    $("#galleryCount").textContent = items.length ? `${items.length} foto · klik untuk memperbesar` : "";
    if (!items.length){
      grid.innerHTML = `<div class="empty"><strong>Belum ada foto</strong>Simpan momen lamaran, prewedding, atau inspirasi dekorasi di sini.</div>`;
      return;
    }
    grid.innerHTML = items.map((g, i) => `
      <button type="button" class="gallery-item" data-action="open-photo" data-index="${i}" data-img-holder aria-label="Lihat foto${g.caption ? ": " + esc(g.caption) : ""}">
        <img src="${esc(imageSrc(g.url))}" data-fallback="${esc(imageFallback(g.url))}" alt="${esc(g.caption || "Foto")}" loading="lazy">
        ${g.caption ? `<span class="gi-caption">${esc(g.caption)}</span>` : ""}
      </button>`).join("");
  }

  /* ================= LIGHTBOX ================= */
  function openLightbox(index){
    lightboxIndex = index;
    renderLightbox();
    $("#lightbox").hidden = false;
    document.body.classList.add("no-scroll");
    $("#lightbox .lb-close").focus();
  }
  function renderLightbox(){
    const g = STATE.gallery[lightboxIndex];
    if (!g){ closeLightbox(); return; }
    const img = $("#lightboxImg");
    $("#lightboxFigure").classList.remove("is-broken");
    delete img.dataset.triedFallback;
    img.dataset.fallback = imageFallback(g.url);
    img.src = imageSrc(g.url);
    img.alt = g.caption || "Foto";
    $("#lightboxCaption").textContent = g.caption || "";
    const n = STATE.gallery.length;
    $("#lightboxCounter").textContent = n > 1 ? `${lightboxIndex + 1} / ${n}` : "";
    $("#lightbox .lb-prev").hidden = n < 2;
    $("#lightbox .lb-next").hidden = n < 2;
    $("#lightboxOpen").href = safeUrl(g.url) || "#";
    $$("#lightbox [data-action=lb-edit], #lightbox [data-action=lb-delete]").forEach(b => { b.disabled = !!g._pending; });
  }
  function closeLightbox(){
    const box = $("#lightbox");
    if (box.hidden) return;
    box.hidden = true;
    $("#lightboxImg").removeAttribute("src");
    lightboxIndex = -1;
    document.body.classList.remove("no-scroll");
  }
  function stepLightbox(delta){
    const n = STATE.gallery.length;
    if (n < 2) return;
    lightboxIndex = (lightboxIndex + delta + n) % n;
    renderLightbox();
  }

  /* ================= RENDER: LAINNYA ================= */
  function renderDatalists(){
    const kategori = uniq(KATEGORI.concat(STATE.budget.map(b => b.kategori), STATE.vendor.map(v => v.kategori)));
    $("#kategoriList").innerHTML = kategori.map(k => `<option value="${esc(k)}"></option>`).join("");
    const pics = uniq([firstName(STATE.config.namaPria), firstName(STATE.config.namaWanita), "Berdua", "Keluarga"].concat(STATE.checklist.map(c => c.pic)));
    $("#picList").innerHTML = pics.map(p => `<option value="${esc(p)}"></option>`).join("");
  }

  function renderAll(){
    if (!STATE || !appShown) return;
    renderHero();
    renderSummary();
    renderTimeline();
    renderChecklist();
    renderBudget();
    renderVendor();
    renderGallery();
    renderDatalists();
    updateSync();
    if (lightboxIndex > -1) renderLightbox();
  }

  /* ================= EVENT ================= */
  function onClick(e){
    if (e.target.closest("[data-dialog-close]")){
      $("#dialog").close("cancel");
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const entity = el.dataset.entity;
    const id = el.dataset.id !== undefined ? Number(el.dataset.id) : null;

    switch (el.dataset.action){
      case "add": openEntityForm(entity); break;
      case "edit": openEntityForm(entity, id); break;
      case "delete": confirmDelete(entity, id); break;
      case "template": loadTemplate(); break;
      case "settings": openSettings(); break;
      case "refresh": refresh({ manual: true }); break;
      case "lock":
        if (pendingWrites > 0){ toast("Tunggu sebentar, perubahan masih disimpan…", "info"); break; }
        lockApp("Website sudah dikunci. Masukkan PIN untuk membuka kembali.", "info");
        break;
      case "filter":
        filters[el.dataset.group] = el.dataset.value;
        if (el.dataset.group === "checklist") renderChecklist(); else renderVendor();
        break;
      case "open-photo": openLightbox(Number(el.dataset.index)); break;
      case "lb-close": closeLightbox(); break;
      case "lb-prev": stepLightbox(-1); break;
      case "lb-next": stepLightbox(1); break;
      case "lb-edit":
      case "lb-delete": {
        const g = STATE.gallery[lightboxIndex];
        closeLightbox();
        if (!g) break;
        if (el.dataset.action === "lb-edit") openEntityForm("gallery", g.id);
        else confirmDelete("gallery", g.id);
        break;
      }
    }
  }

  function onChange(e){
    const el = e.target;
    if (!el.dataset || !el.dataset.action) return;
    if (el.dataset.action === "toggle"){
      commit("update", { entity: "checklist", id: Number(el.dataset.id), data: { selesai: el.checked } });
      if (el.checked && STATE.checklist.length > 1 && STATE.checklist.every(c => c.selesai)){
        toast("Semua tugas selesai! Barakallah 🎉", "success", 4000);
      }
    } else if (el.dataset.action === "status"){
      commit("update", { entity: el.dataset.entity, id: Number(el.dataset.id), data: { status: el.value } });
    }
  }

  function onInput(e){
    const el = e.target;
    if (!el.matches || !el.matches("[data-currency]")) return;
    const digits = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    el.value = digits ? Number(digits).toLocaleString("id-ID") : "";
  }

  function onImageError(e){
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.getAttribute("src")) return;
    const fallback = img.dataset.fallback;
    if (fallback && !img.dataset.triedFallback){
      img.dataset.triedFallback = "1";
      img.src = fallback;
      return;
    }
    const holder = img.closest("[data-img-holder]");
    if (holder) holder.classList.add("is-broken");
  }

  function onKeydown(e){
    if ($("#lightbox").hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") stepLightbox(-1);
    else if (e.key === "ArrowRight") stepLightbox(1);
  }

  function onQuickAdd(e){
    e.preventDefault();
    const item = $("#checklistInput").value.trim();
    if (!item){ $("#checklistInput").focus(); return; }
    commit("add", {
      entity: "checklist",
      data: { item, pic: $("#checklistPic").value.trim(), tenggat: $("#checklistDue").value, selesai: false }
    });
    e.target.reset();
    if (filters.checklist === "selesai"){ filters.checklist = "semua"; renderChecklist(); }
    $("#checklistInput").focus();
  }

  function initScrollSpy(){
    if (!("IntersectionObserver" in window)) return;
    const tabs = $("#tabs");
    const links = $$("a", tabs);
    const byId = new Map(links.map(a => [a.getAttribute("href").slice(1), a]));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const active = byId.get(entry.target.id);
        links.forEach(a => {
          a.classList.toggle("active", a === active);
          if (a === active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        });
        if (active) tabs.scrollTo({ left: active.offsetLeft - tabs.clientWidth / 2 + active.clientWidth / 2, behavior: "smooth" });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    byId.forEach((a, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
  }

  function bindUI(){
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("error", onImageError, true);
    document.addEventListener("keydown", onKeydown);
    $("#checklistForm").addEventListener("submit", onQuickAdd);

    window.addEventListener("beforeunload", e => {
      if (pendingWrites > 0){ e.preventDefault(); e.returnValue = ""; }
    });

    if (hasBackend){
      // Ambil perubahan dari perangkat pasangan secara berkala
      setInterval(() => {
        if (document.visibilityState === "visible" && !$("#dialog").open) refresh({ silent: true });
      }, AUTO_REFRESH_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && (!lastSyncAt || Date.now() - lastSyncAt > 15000)) refresh({ silent: true });
      });
      window.addEventListener("online", () => refresh({ silent: true }));
    }
  }

  function spawnPetals(){
    const wrap = $("#petals");
    if (!wrap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#C98F8A", "#D9B276", "#E7C6BE"];
    const count = window.innerWidth < 640 ? 8 : 14;
    for (let i = 0; i < count; i++){
      const petal = document.createElement("div");
      const size = 10 + Math.random() * 10;
      petal.className = "petal";
      petal.style.left = Math.random() * 100 + "vw";
      petal.style.width = size + "px";
      petal.style.height = size + "px";
      petal.style.setProperty("--drift", (Math.random() * 120 - 60) + "px");
      petal.style.animationDuration = 10 + Math.random() * 8 + "s";
      petal.style.animationDelay = Math.random() * 12 + "s";
      petal.innerHTML = `<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 0 C14 4 20 6 10 20 C0 6 6 4 10 0 Z" fill="${colors[i % colors.length]}"/></svg>`;
      wrap.appendChild(petal);
    }
  }

  function showApp(){
    if (appShown) return;
    appShown = true;
    const gate = $("#pinGate");
    if (gate) gate.remove();
    $("#app").hidden = false;
    injectIcons(document);
    bindUI();
    renderAll();
    spawnPetals();
    initScrollSpy();
  }

  function lockApp(message, type){
    clearSession();
    if (message) storageSet("sessionStorage", KEY_GATE_MSG, JSON.stringify({ message, type: type || "error" }));
    window.location.reload();
  }

  /* ================= PIN GATE ================= */
  function showGateError(message, type){
    const el = $("#pinError");
    el.textContent = message;
    el.hidden = false;
    el.classList.toggle("is-info", type === "info");
    if (type === "info") return;
    const card = $("#pinCard");
    card.classList.remove("shake");
    void card.offsetWidth; // restart animasi
    card.classList.add("shake");
  }

  function setGateBusy(busy){
    const btn = $("#pinSubmit");
    if (!btn) return;
    btn.disabled = busy;
    $("#pinInput").disabled = busy;
    btn.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span>Memeriksa…' : "Buka";
  }

  async function login(value, remember){
    setGateBusy(true);
    try {
      if (!hasBackend){
        if (value !== FALLBACK_PIN) throw appError("PIN_INVALID");
        STATE = loadDemo();
      } else {
        const seq = ++reqSeq;
        try {
          const data = await http("GET", { action: "all", pin: value });
          STATE = normalizeState(data);
          serverState = clone(STATE);
          appliedSeq = seq;
          lastSyncAt = new Date();
          syncMode = "ok";
        } catch (err){
          // Google Sheet tidak bisa dihubungi: PIN cadangan membuka data tersimpan terakhir
          if (!isNetworkError(err) || !FALLBACK_PIN || value !== FALLBACK_PIN) throw err;
          STATE = readCache() || normalizeState({ config: CONFIG.FALLBACK });
          serverState = clone(STATE);
          syncMode = "offline";
          setTimeout(() => toast("Google Sheet tidak bisa dihubungi. Menampilkan data tersimpan terakhir.", "error", 6000), 600);
        }
      }
      pin = value;
      savePin(value, remember);
      writeCache(serverState);
      setGateBusy(false);
      showApp();
    } catch (err){
      setGateBusy(false);
      if (err && (err.code === "PIN_INVALID" || err.code === "PIN_NOT_SET")) clearSession();
      showGateError(errorMessage(err));
      const input = $("#pinInput");
      input.value = "";
      input.focus();
    }
  }

  function initGate(){
    const form = $("#pinForm");
    const input = $("#pinInput");
    const toggle = $("#pinToggle");
    injectIcons($("#pinGate"));

    const flash = storageGet("sessionStorage", KEY_GATE_MSG);
    if (flash){
      storageRemove("sessionStorage", KEY_GATE_MSG);
      try {
        const f = JSON.parse(flash);
        showGateError(f.message, f.type);
      } catch (e){ /* format lama → abaikan */ }
    }
    if (!hasBackend){
      $("#pinMode").textContent = "Mode demo — data tersimpan di browser ini saja.";
      $("#pinMode").hidden = false;
    }

    form.addEventListener("submit", e => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value){ input.focus(); return; }
      login(value, $("#pinRemember").checked);
    });
    input.addEventListener("input", () => { $("#pinError").hidden = true; });
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "Sembunyikan PIN" : "Tampilkan PIN");
      input.focus();
    });

    const saved = getSavedPin();
    if (saved){
      const remembered = storageGet("localStorage", KEY_PIN) !== null;
      $("#pinRemember").checked = remembered;
      if (!hasBackend){
        if (saved === FALLBACK_PIN){
          pin = saved;
          STATE = loadDemo();
          showApp();
          return;
        }
        clearSession();
      } else {
        const cached = readCache();
        if (cached){
          // Tampilkan data tersimpan seketika, lalu perbarui dari Google Sheet
          pin = saved;
          STATE = cached;
          serverState = clone(cached);
          showApp();
          refresh({ silent: true });
          return;
        }
        login(saved, remembered);
        return;
      }
    }
    input.focus();
  }

  document.addEventListener("DOMContentLoaded", initGate);
})();
