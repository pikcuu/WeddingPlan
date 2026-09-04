(function(){
  "use strict";

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const hasBackend = !!(CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL.trim());
  const LOCAL_KEY = "wedding_demo_state_v1";

  let STATE = null; // {config, timeline, checklist, budget, vendor, gallery}

  /* ================= PETALS (background animation) ================= */
  function spawnPetals(){
    const wrap = $("#petals");
    if (!wrap) return;
    const colors = ["#C98F8A", "#D9B276", "#E7C6BE"];
    const count = window.innerWidth < 640 ? 10 : 18;
    for (let i = 0; i < count; i++){
      const petal = document.createElement("div");
      petal.className = "petal";
      const size = 10 + Math.random() * 10;
      const left = Math.random() * 100;
      const duration = 9 + Math.random() * 8;
      const delay = Math.random() * 12;
      const drift = (Math.random() * 120 - 60) + "px";
      const color = colors[i % colors.length];
      petal.style.left = left + "vw";
      petal.style.width = size + "px";
      petal.style.height = size + "px";
      petal.style.setProperty("--drift", drift);
      petal.style.animationDuration = duration + "s";
      petal.style.animationDelay = delay + "s";
      petal.innerHTML = `<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 0 C14 4 20 6 10 20 C0 6 6 4 10 0 Z" fill="${color}"/></svg>`;
      wrap.appendChild(petal);
    }
  }

  /* ================= PIN GATE ================= */
  function initPinGate(){
    const gate = $("#pinGate");
    const app = $("#app");
    const form = $("#pinForm");
    const input = $("#pinInput");
    const error = $("#pinError");

    if (sessionStorage.getItem("wedding_unlocked") === "1"){
      unlock();
      return;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pin = input.value.trim();
      if (!pin) return;
      const ok = await verifyPin(pin);
      if (ok){
        sessionStorage.setItem("wedding_unlocked", "1");
        unlock();
      } else {
        error.hidden = false;
        input.value = "";
        input.focus();
      }
    });

    function unlock(){
      gate.remove();
      app.hidden = false;
      spawnPetals();
      boot();
    }
  }

  async function verifyPin(pin){
    if (!hasBackend){
      return pin === CONFIG.FALLBACK_PIN;
    }
    try {
      const url = `${CONFIG.APPS_SCRIPT_URL}?action=verifyPin&pin=${encodeURIComponent(pin)}`;
      const res = await fetch(url);
      const data = await res.json();
      return !!data.ok;
    } catch (err){
      console.error("Gagal memeriksa PIN, memakai PIN cadangan:", err);
      return pin === CONFIG.FALLBACK_PIN;
    }
  }

  /* ================= DATA LOAD / SAVE ================= */
  async function loadState(){
    if (hasBackend){
      try {
        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=all`);
        const data = await res.json();
        setSyncStatus("Tersinkron dengan Google Sheet ✓");
        return normalizeState(data);
      } catch (err){
        console.error("Gagal memuat dari Google Sheet, memakai data lokal:", err);
        setSyncStatus("Gagal tersambung ke Google Sheet — menampilkan data cadangan.");
        return loadLocal();
      }
    }
    setSyncStatus("Mode demo — data tersimpan di browser ini saja. Hubungkan Google Sheet di js/data.js untuk sinkron antar perangkat.");
    return loadLocal();
  }

  function loadLocal(){
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (err){ /* ignore */ }
    return normalizeState({ config: CONFIG.FALLBACK, ...JSON.parse(JSON.stringify(DEMO_DATA)) });
  }

  function saveLocal(){
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(STATE)); } catch (err){ /* ignore */ }
  }

  function normalizeState(data){
    return {
      config: Object.assign({}, CONFIG.FALLBACK, data.config || {}),
      timeline: data.timeline || [],
      checklist: data.checklist || [],
      budget: data.budget || [],
      vendor: data.vendor || [],
      gallery: data.gallery || []
    };
  }

  function setSyncStatus(text){
    const el = $("#syncStatus");
    if (el) el.textContent = text;
  }

  // action: string, payload: object -> returns updated state (local mutation or backend round-trip)
  async function apiPost(action, payload){
    if (hasBackend){
      try {
        const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
          body: JSON.stringify(Object.assign({ action }, payload))
        });
        const data = await res.json();
        STATE = normalizeState(data);
        setSyncStatus("Tersinkron dengan Google Sheet ✓");
      } catch (err){
        console.error("Gagal menyimpan ke Google Sheet:", err);
        setSyncStatus("Perubahan belum tersimpan ke Google Sheet (cek koneksi).");
      }
    } else {
      mutateLocal(action, payload);
      saveLocal();
    }
    renderAll();
  }

  // local demo-mode mutation, mirrors what Code.gs does server-side
  function mutateLocal(action, p){
    const nextId = (arr) => (arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1);
    switch (action){
      case "updateTimeline": {
        const stage = STATE.timeline.find(s => s.id === p.id);
        if (stage) stage.status = p.status;
        break;
      }
      case "addChecklistItem":
        STATE.checklist.push({ id: nextId(STATE.checklist), item: p.item, selesai: false, pic: p.pic || "" });
        break;
      case "toggleChecklistItem": {
        const it = STATE.checklist.find(c => c.id === p.id);
        if (it) it.selesai = p.selesai;
        break;
      }
      case "deleteChecklistItem":
        STATE.checklist = STATE.checklist.filter(c => c.id !== p.id);
        break;
      case "addBudgetItem":
        STATE.budget.push({ id: nextId(STATE.budget), kategori: p.kategori, estimasi: p.estimasi, aktual: p.aktual || 0, catatan: p.catatan || "" });
        break;
      case "deleteBudgetItem":
        STATE.budget = STATE.budget.filter(b => b.id !== p.id);
        break;
      case "addVendor":
        STATE.vendor.push({ id: nextId(STATE.vendor), nama: p.nama, kategori: p.kategori, kontak: p.kontak || "", harga: p.harga || "", status: p.status || "Dipertimbangkan" });
        break;
      case "updateVendorStatus": {
        const v = STATE.vendor.find(v => v.id === p.id);
        if (v) v.status = p.status;
        break;
      }
      case "deleteVendor":
        STATE.vendor = STATE.vendor.filter(v => v.id !== p.id);
        break;
      case "addGalleryPhoto":
        STATE.gallery.push({ id: nextId(STATE.gallery), url: p.url, caption: p.caption || "" });
        break;
      case "deleteGalleryPhoto":
        STATE.gallery = STATE.gallery.filter(g => g.id !== p.id);
        break;
    }
  }

  /* ================= RENDER: HERO ================= */
  let countdownTimer = null;
  function renderHero(){
    const c = STATE.config;
    $("#heroNames").textContent = `${c.namaPria} & ${c.namaWanita}`;
    if (c.tagline) $("#heroTagline").textContent = c.tagline;
    if (c.fotoHero){
      $("#heroPhoto").style.backgroundImage = `url("${c.fotoHero}")`;
    }
    const target = c.tanggalResepsi ? new Date(c.tanggalResepsi) : null;
    if (target && !isNaN(target)){
      $("#heroDate").textContent = target.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      startCountdown(target);
    } else {
      $("#heroDate").textContent = "Tanggal resepsi belum diatur";
    }
  }

  function startCountdown(target){
    if (countdownTimer) clearInterval(countdownTimer);
    function tick(){
      const diff = target.getTime() - Date.now();
      const clamp = Math.max(diff, 0);
      const d = Math.floor(clamp / 86400000);
      const h = Math.floor((clamp % 86400000) / 3600000);
      const m = Math.floor((clamp % 3600000) / 60000);
      const s = Math.floor((clamp % 60000) / 1000);
      $("#cdDays").textContent = String(d).padStart(2, "0");
      $("#cdHours").textContent = String(h).padStart(2, "0");
      $("#cdMinutes").textContent = String(m).padStart(2, "0");
      $("#cdSeconds").textContent = String(s).padStart(2, "0");
      if (diff <= 0) clearInterval(countdownTimer);
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ================= RENDER: TIMELINE ================= */
  const STATUS_OPTIONS = ["Belum Mulai", "Berjalan", "Selesai"];
  function statusClass(status){
    if (status === "Selesai") return "done";
    if (status === "Berjalan") return "progress";
    return "";
  }
  function badgeClass(status){
    if (status === "Selesai") return "selesai";
    if (status === "Berjalan") return "berjalan";
    return "belum";
  }

  function renderTimeline(){
    const wrap = $("#roadmap");
    wrap.innerHTML = "";
    STATE.timeline.forEach(stage => {
      const li = document.createElement("li");
      li.className = `stage ${statusClass(stage.status)}`;
      li.innerHTML = `
        <div class="stage-card">
          <div class="stage-top">
            <span class="stage-name">${escapeHtml(stage.tahap)}</span>
            <span class="stage-adat">${escapeHtml(stage.namaAdat || "")}</span>
          </div>
          ${stage.tanggal ? `<p class="stage-date">${escapeHtml(stage.tanggal)}</p>` : ""}
          ${stage.catatan ? `<p class="stage-note">${escapeHtml(stage.catatan)}</p>` : ""}
          <div class="status-row">
            <select class="status-select" data-id="${stage.id}">
              ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === stage.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            <span class="status-badge ${badgeClass(stage.status)}">${escapeHtml(stage.status)}</span>
          </div>
        </div>`;
      wrap.appendChild(li);
    });
    $$(".status-select", wrap).forEach(sel => {
      sel.addEventListener("change", () => {
        apiPost("updateTimeline", { id: Number(sel.dataset.id), status: sel.value });
      });
    });
  }

  /* ================= RENDER: CHECKLIST ================= */
  function renderChecklist(){
    const list = $("#checklistList");
    list.innerHTML = "";
    STATE.checklist.forEach(item => {
      const li = document.createElement("li");
      li.className = `check-item ${item.selesai ? "done" : ""}`;
      li.innerHTML = `
        <input type="checkbox" ${item.selesai ? "checked" : ""} data-id="${item.id}">
        <span class="ci-text">${escapeHtml(item.item)}</span>
        ${item.pic ? `<span class="ci-pic">${escapeHtml(item.pic)}</span>` : ""}
        <button class="icon-btn" data-del="${item.id}" aria-label="Hapus">✕</button>`;
      list.appendChild(li);
    });
    $$("input[type=checkbox]", list).forEach(cb => {
      cb.addEventListener("change", () => {
        apiPost("toggleChecklistItem", { id: Number(cb.dataset.id), selesai: cb.checked });
      });
    });
    $$("[data-del]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        apiPost("deleteChecklistItem", { id: Number(btn.dataset.del) });
      });
    });
    const total = STATE.checklist.length;
    const done = STATE.checklist.filter(c => c.selesai).length;
    $("#checklistProgressText").textContent = `${done} dari ${total} selesai`;
    $("#checklistProgressFill").style.width = total ? `${(done / total) * 100}%` : "0%";
  }

  /* ================= RENDER: BUDGET ================= */
  function formatRupiah(n){
    return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
  }
  function renderBudget(){
    const body = $("#budgetBody");
    body.innerHTML = "";
    let totalEstimasi = 0, totalAktual = 0;
    STATE.budget.forEach(row => {
      totalEstimasi += Number(row.estimasi) || 0;
      totalAktual += Number(row.aktual) || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.kategori)}</td>
        <td>${formatRupiah(row.estimasi)}</td>
        <td>${formatRupiah(row.aktual)}</td>
        <td>${escapeHtml(row.catatan || "")}</td>
        <td><button class="icon-btn" data-del="${row.id}" aria-label="Hapus">✕</button></td>`;
      body.appendChild(tr);
    });
    $("#budgetTotalEstimasi").textContent = formatRupiah(totalEstimasi);
    $("#budgetTotalAktual").textContent = formatRupiah(totalAktual);
    $("#budgetSisa").textContent = `Sisa: ${formatRupiah(totalEstimasi - totalAktual)}`;
    $$("[data-del]", body).forEach(btn => {
      btn.addEventListener("click", () => apiPost("deleteBudgetItem", { id: Number(btn.dataset.del) }));
    });
  }

  /* ================= RENDER: VENDOR ================= */
  function renderVendor(){
    const grid = $("#vendorGrid");
    grid.innerHTML = "";
    STATE.vendor.forEach(v => {
      const card = document.createElement("div");
      card.className = "vendor-card";
      card.innerHTML = `
        <h3>${escapeHtml(v.nama)}</h3>
        <span class="vendor-cat">${escapeHtml(v.kategori)}</span>
        <p class="vendor-meta">
          ${v.kontak ? escapeHtml(v.kontak) + "<br>" : ""}
          ${v.harga ? escapeHtml(v.harga) : ""}
        </p>
        <select class="status-select" data-id="${v.id}">
          <option ${v.status === "Dipertimbangkan" ? "selected" : ""}>Dipertimbangkan</option>
          <option ${v.status === "Dihubungi" ? "selected" : ""}>Dihubungi</option>
          <option ${v.status === "Deal" ? "selected" : ""}>Deal</option>
        </select>
        <button class="icon-btn" data-del="${v.id}" aria-label="Hapus">✕ Hapus</button>`;
      grid.appendChild(card);
    });
    $$(".status-select", grid).forEach(sel => {
      sel.addEventListener("change", () => apiPost("updateVendorStatus", { id: Number(sel.dataset.id), status: sel.value }));
    });
    $$("[data-del]", grid).forEach(btn => {
      btn.addEventListener("click", () => apiPost("deleteVendor", { id: Number(btn.dataset.del) }));
    });
  }

  /* ================= RENDER: GALLERY ================= */
  function renderGallery(){
    const grid = $("#galleryGrid");
    grid.innerHTML = "";
    STATE.gallery.forEach(g => {
      const div = document.createElement("div");
      div.className = "gallery-item";
      div.innerHTML = `<img src="${escapeAttr(g.url)}" alt="${escapeAttr(g.caption || "Foto")}" loading="lazy">`;
      div.addEventListener("click", () => openLightbox(g.url, g.caption));
      grid.appendChild(div);
    });
  }

  function openLightbox(url, caption){
    $("#lightboxImg").src = url;
    $("#lightboxCaption").textContent = caption || "";
    $("#lightbox").hidden = false;
  }
  function closeLightbox(){
    $("#lightbox").hidden = true;
    $("#lightboxImg").src = "";
  }

  /* ================= HELPERS ================= */
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
  }
  function escapeAttr(str){ return escapeHtml(str); }

  function renderAll(){
    renderHero();
    renderTimeline();
    renderChecklist();
    renderBudget();
    renderVendor();
    renderGallery();
  }

  /* ================= FORM BINDINGS ================= */
  function bindForms(){
    $("#checklistForm").addEventListener("submit", e => {
      e.preventDefault();
      const item = $("#checklistInput").value.trim();
      const pic = $("#checklistPic").value.trim();
      if (!item) return;
      apiPost("addChecklistItem", { item, pic });
      e.target.reset();
    });

    $("#budgetForm").addEventListener("submit", e => {
      e.preventDefault();
      const kategori = $("#budgetKategori").value.trim();
      const estimasi = Number($("#budgetEstimasi").value) || 0;
      const aktual = Number($("#budgetAktual").value) || 0;
      const catatan = $("#budgetCatatan").value.trim();
      if (!kategori) return;
      apiPost("addBudgetItem", { kategori, estimasi, aktual, catatan });
      e.target.reset();
    });

    $("#vendorForm").addEventListener("submit", e => {
      e.preventDefault();
      const nama = $("#vendorNama").value.trim();
      const kategori = $("#vendorKategori").value.trim();
      const kontak = $("#vendorKontak").value.trim();
      const harga = $("#vendorHarga").value.trim();
      const status = $("#vendorStatus").value;
      if (!nama || !kategori) return;
      apiPost("addVendor", { nama, kategori, kontak, harga, status });
      e.target.reset();
    });

    $("#galleryForm").addEventListener("submit", e => {
      e.preventDefault();
      const url = $("#galleryUrl").value.trim();
      const caption = $("#galleryCaption").value.trim();
      if (!url) return;
      apiPost("addGalleryPhoto", { url, caption });
      e.target.reset();
    });

    $("#lightboxClose").addEventListener("click", closeLightbox);
    $("#lightbox").addEventListener("click", e => { if (e.target.id === "lightbox") closeLightbox(); });
  }

  /* ================= BOOT ================= */
  async function boot(){
    bindForms();
    STATE = await loadState();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", initPinGate);
})();
