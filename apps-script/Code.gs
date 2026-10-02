/**
 * BACKEND GOOGLE APPS SCRIPT — Website Persiapan Pernikahan (v2)
 * ----------------------------------------------------------------
 * Cara pakai singkat (detail lengkap ada di README.md):
 * 1. Buka Google Sheet > Extensions > Apps Script, hapus isi default,
 *    lalu tempel seluruh isi file ini.
 * 2. Jalankan fungsi setupSheet() sekali. Fungsi ini membuat tab, header
 *    dan data awal, serta menambahkan kolom baru pada sheet lama.
 *    Aman dijalankan ulang — data yang sudah ada tidak diubah.
 * 3. (Sheet lama saja, sekali) jalankan sesuaikanTahapanAdat() untuk
 *    merapikan urutan tahapan adat di tab Timeline.
 * 4. Deploy > New deployment > Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Salin URL Web App, tempel ke CONFIG.APPS_SCRIPT_URL di js/data.js.
 *
 * PENTING: setiap kali isi file ini diubah, buka
 *   Deploy > Manage deployments > ✏️ (Edit) > Version: "New version" > Deploy
 * agar perubahan ikut aktif di URL yang sama.
 *
 * Keamanan: setiap permintaan wajib menyertakan PIN yang cocok dengan
 * baris "PIN" di tab Config. PIN tidak pernah dikirim balik ke browser.
 * Cek cepat deployment: buka <URL Web App>?action=ping di browser.
 */

const API_VERSION = 2;
const CONFIG_SHEET = "Config";

/** Key di tab Config -> nama field di website (PIN sengaja tidak termasuk). */
const CONFIG_KEYS = {
  NamaPria: "namaPria",
  NamaWanita: "namaWanita",
  Tagline: "tagline",
  TanggalResepsi: "tanggalResepsi",
  FotoHero: "fotoHero"
};

/** Data yang bisa dibaca/diubah website: field website -> header kolom di sheet. */
const ENTITIES = {
  timeline: { sheet: "Timeline", fields: { tahap: "Tahap", namaAdat: "NamaAdat", tanggal: "Tanggal", status: "Status", catatan: "Catatan" } },
  checklist: { sheet: "Checklist", fields: { item: "Item", selesai: "Selesai", pic: "PIC", tenggat: "Tenggat" } },
  budget: { sheet: "Budget", fields: { kategori: "Kategori", estimasi: "Estimasi", aktual: "Aktual", catatan: "Catatan" } },
  vendor: { sheet: "Vendor", fields: { nama: "Nama", kategori: "Kategori", kontak: "Kontak", harga: "Harga", status: "Status", catatan: "Catatan" } },
  gallery: { sheet: "Gallery", fields: { url: "URL", caption: "Caption" } }
};

/** Tipe khusus per field; field lain diperlakukan sebagai teks. */
const FIELD_TYPES = { selesai: "bool", estimasi: "number", aktual: "number", tanggal: "date", tenggat: "date" };

/** Format sel per tipe. Teks dipaksa "plain text" supaya nomor HP tidak
 *  kehilangan angka 0 dan isian berawalan "=" tidak dijalankan sebagai rumus. */
const NUMBER_FORMATS = { text: "@", number: "#,##0", date: "dd/mm/yyyy", id: "0" };

/** Urutan tahapan adat Bugis yang dipakai setupSheet() dan sesuaikanTahapanAdat(). */
const TAHAPAN_ADAT = [
  { tahap: "Lamaran", namaAdat: "Mappettuada" },          // menyepakati uang panai & tanggal
  { tahap: "Seserahan", namaAdat: "Mappaenre Balanca" },  // mengantar uang panai & erang-erang
  { tahap: "Malam Pacar", namaAdat: "Mappacci" },         // malam sebelum akad
  { tahap: "Akad", namaAdat: "Akad Nikah" },
  { tahap: "Resepsi", namaAdat: "Tudang Botting" }        // bersanding di pelaminan
];

const MAX_TEXT_LENGTH = 2000;
const MAX_BATCH = 100;
const MAX_PIN_FAILS = 15;           // percobaan PIN salah sebelum dikunci sementara
const PIN_LOCK_SECONDS = 15 * 60;

/* ================= ENDPOINT ================= */
function doGet(e){
  return handle_(() => {
    const p = (e && e.parameter) || {};
    const action = p.action || "ping";
    if (action === "ping") return { app: "wedding-plan", version: API_VERSION };
    checkPin_(p.pin);
    if (action === "all") return getAllData_();
    fail_("BAD_REQUEST");
  });
}

function doPost(e){
  return handle_(() => {
    let body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    } catch (err){
      fail_("BAD_REQUEST");
    }
    checkPin_(body.pin);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_("BUSY");
    try {
      switch (body.action){
        case "add": appendRows_(entity_(body.entity), [body.data]); break;
        case "addMany": appendRows_(entity_(body.entity), body.items); break;
        case "update": updateRow_(entity_(body.entity), body.id, body.data); break;
        case "delete": deleteRow_(entity_(body.entity), body.id); break;
        case "updateConfig": updateConfig_(body.data); break;
        default: fail_("BAD_REQUEST");
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return getAllData_();
  });
}

/** Semua respons berbentuk { ok: true, data } atau { ok: false, error }. */
function handle_(fn){
  try {
    return jsonOut_({ ok: true, data: fn() });
  } catch (err){
    const message = String((err && err.message) || err);
    if (!/^[A-Z_]+$/.test(message)) console.error(err);
    return jsonOut_({ ok: false, error: message });
  }
}

function jsonOut_(obj){
  // Catatan: Apps Script tidak mendukung header kustom (mis. CORS);
  // Web App "Anyone" sudah otomatis bisa diakses lintas domain.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code){
  throw new Error(code);
}

/* ================= PIN ================= */
function checkPin_(pin){
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("pinFails") || 0);
  if (fails >= MAX_PIN_FAILS) fail_("TOO_MANY_ATTEMPTS");

  const real = normalizePin_(readPin_());
  if (!real) fail_("PIN_NOT_SET");
  if (normalizePin_(pin) !== real){
    cache.put("pinFails", String(fails + 1), PIN_LOCK_SECONDS);
    fail_("PIN_INVALID");
  }
}

/** Sheet sering mengubah "0812" menjadi angka 812 — samakan keduanya. */
function normalizePin_(value){
  let s = String(value === null || value === undefined ? "" : value).trim();
  if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return s;
}

function readPin_(){
  const row = readConfigRows_().find(r => r.key.toUpperCase() === "PIN");
  return row ? row.value : "";
}

/* ================= CONFIG ================= */
function readConfigRows_(){
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues()
    .map((r, i) => ({ key: String(r[0]).trim(), value: r[1], row: i + 1 }))
    .filter(r => r.key && r.key.toLowerCase() !== "key");
}

function configFieldFor_(key){
  const match = Object.keys(CONFIG_KEYS).find(k => k.toLowerCase() === String(key).toLowerCase());
  return match ? CONFIG_KEYS[match] : null;
}

function readPublicConfig_(){
  const cfg = {};
  readConfigRows_().forEach(r => {
    const field = configFieldFor_(r.key);
    if (!field) return;
    if (r.value instanceof Date) cfg[field] = r.value.toISOString();
    else cfg[field] = r.value === null ? "" : r.value;
  });
  return cfg;
}

function updateConfig_(data){
  if (!data || typeof data !== "object") fail_("BAD_REQUEST");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  if (!sheet) fail_("Tab Config tidak ditemukan. Jalankan setupSheet() terlebih dahulu.");
  const rows = readConfigRows_();

  Object.keys(CONFIG_KEYS).forEach(key => {
    const field = CONFIG_KEYS[key];
    if (!Object.prototype.hasOwnProperty.call(data, field)) return;
    const existing = rows.find(r => r.key.toLowerCase() === key.toLowerCase());
    let rowNumber = existing ? existing.row : -1;
    if (rowNumber < 0){
      rowNumber = sheet.getLastRow() + 1;
      sheet.getRange(rowNumber, 1).setValue(key);
    }
    const cell = sheet.getRange(rowNumber, 2);
    const raw = String(data[field] === null || data[field] === undefined ? "" : data[field]).trim().slice(0, MAX_TEXT_LENGTH);
    if (field === "tanggalResepsi" && /^\d{4}-\d{2}-\d{2}/.test(raw)){
      // "2026-11-24 09:00:00" dibaca Sheet sebagai tanggal (zona waktu spreadsheet)
      cell.setNumberFormat("dd/mm/yyyy hh:mm").setValue(raw.replace("T", " "));
    } else {
      cell.setNumberFormat(NUMBER_FORMATS.text).setValue(raw);
    }
  });
}

/* ================= BACA DATA ================= */
function getAllData_(){
  const out = { config: readPublicConfig_() };
  Object.keys(ENTITIES).forEach(name => { out[name] = readEntity_(ENTITIES[name]); });
  return out;
}

function entity_(name){
  if (!Object.prototype.hasOwnProperty.call(ENTITIES, name)) fail_("BAD_REQUEST");
  return ENTITIES[name];
}

function isEmptyRow_(row){
  // FALSE dianggap kosong: kolom checkbox yang sudah disiapkan sampai bawah
  return row.every(c => c === "" || c === null || c === false);
}

function readEntity_(def){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(def.sheet);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const tz = ss.getSpreadsheetTimeZone();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const fieldByHeader = { id: "id" };
  Object.keys(def.fields).forEach(f => { fieldByHeader[def.fields[f].toLowerCase()] = f; });

  const items = [];
  const withoutId = [];
  for (let r = 1; r < values.length; r++){
    const row = values[r];
    if (isEmptyRow_(row)) continue;
    const obj = {};
    headers.forEach((h, i) => {
      const field = fieldByHeader[h];
      if (field) obj[field] = fromCell_(field, row[i], tz);
    });
    if (!(obj.id > 0)) withoutId.push({ obj, rowNumber: r + 1 });
    items.push(obj);
  }

  // Baris yang diketik manual di Sheet tanpa ID diberi ID otomatis
  const idCol = headers.indexOf("id") + 1;
  if (withoutId.length && idCol > 0){
    let next = items.reduce((m, o) => Math.max(m, o.id > 0 ? o.id : 0), 0) + 1;
    withoutId.forEach(x => {
      x.obj.id = next;
      sheet.getRange(x.rowNumber, idCol).setValue(next);
      next++;
    });
  }
  return items;
}

function fromCell_(field, value, tz){
  if (field === "id") return Number(value) || 0;
  const type = FIELD_TYPES[field] || "text";
  if (type === "bool") return value === true || String(value).toUpperCase() === "TRUE";
  if (type === "number") return Number(value) || 0;
  if (value instanceof Date){
    return Utilities.formatDate(value, tz, type === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm:ss");
  }
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : value;
}

/* ================= TULIS DATA ================= */
function toCell_(field, value){
  const type = FIELD_TYPES[field] || "text";
  if (type === "bool") return value === true || String(value).toLowerCase() === "true";
  if (type === "number") return Math.max(0, Math.round(Number(value) || 0));
  if (value === null || value === undefined) return "";
  const s = String(value).trim().slice(0, MAX_TEXT_LENGTH);
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  return s;
}

function formatFor_(field){
  const type = FIELD_TYPES[field] || "text";
  return type === "bool" ? null : NUMBER_FORMATS[type];
}

function getSheet_(def){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(def.sheet);
  if (!sheet){
    sheet = ss.insertSheet(def.sheet);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Pastikan semua header ada (kolom baru ditambahkan di kanan). Mengembalikan header lowercase. */
function ensureColumns_(sheet, def){
  const lastCol = sheet.getLastColumn();
  const current = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim()) : [];
  const lower = current.map(h => h.toLowerCase());
  const wanted = ["ID"].concat(Object.keys(def.fields).map(f => def.fields[f]));
  const missing = wanted.filter(h => lower.indexOf(h.toLowerCase()) === -1);
  if (!missing.length) return lower;

  const start = current.some(Boolean) ? current.length + 1 : 1;
  sheet.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight("bold");
  return (start === 1 ? [] : lower).concat(missing.map(h => h.toLowerCase()));
}

function findRow_(sheet, headers, id){
  const idCol = headers.indexOf("id") + 1;
  const last = sheet.getLastRow();
  if (idCol < 1 || last < 2) return -1;
  const ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++){
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}

function appendRows_(def, items){
  if (!Array.isArray(items) || !items.length || items.length > MAX_BATCH) fail_("BAD_REQUEST");
  const sheet = getSheet_(def);
  const headers = ensureColumns_(sheet, def);
  const values = sheet.getDataRange().getValues();
  const idIndex = headers.indexOf("id");

  let lastContentRow = 1;
  let nextId = 1;
  for (let r = 1; r < values.length; r++){
    if (!isEmptyRow_(values[r])) lastContentRow = r + 1;
    nextId = Math.max(nextId, (Number(values[r][idIndex]) || 0) + 1);
  }

  const fieldByHeader = {};
  Object.keys(def.fields).forEach(f => { fieldByHeader[def.fields[f].toLowerCase()] = f; });

  const rows = items.map(data => {
    if (!data || typeof data !== "object") fail_("BAD_REQUEST");
    const id = nextId++;
    return headers.map(h => {
      if (h === "id") return id;
      const field = fieldByHeader[h];
      return field ? toCell_(field, data[field]) : "";
    });
  });

  const startRow = lastContentRow + 1;
  headers.forEach((h, i) => {
    const fmt = h === "id" ? NUMBER_FORMATS.id : (fieldByHeader[h] ? formatFor_(fieldByHeader[h]) : null);
    if (fmt) sheet.getRange(startRow, i + 1, rows.length, 1).setNumberFormat(fmt);
  });
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
}

function updateRow_(def, id, data){
  if (!data || typeof data !== "object") fail_("BAD_REQUEST");
  const sheet = getSheet_(def);
  const headers = ensureColumns_(sheet, def);
  const row = findRow_(sheet, headers, id);
  if (row < 0) fail_("NOT_FOUND");

  Object.keys(data).forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(def.fields, field)) return;
    const col = headers.indexOf(def.fields[field].toLowerCase()) + 1;
    if (col < 1) return;
    const cell = sheet.getRange(row, col);
    const fmt = formatFor_(field);
    if (fmt) cell.setNumberFormat(fmt);
    cell.setValue(toCell_(field, data[field]));
  });
}

function deleteRow_(def, id){
  const sheet = getSheet_(def);
  const headers = ensureColumns_(sheet, def);
  const row = findRow_(sheet, headers, id);
  if (row > 0) sheet.deleteRow(row); // sudah terhapus dari perangkat lain = tidak apa-apa
}

/* ================= SETUP ================= */
/**
 * Jalankan fungsi ini dari editor Apps Script (pilih setupSheet lalu
 * klik Run). Membuat tab, header, data awal, dan menambahkan kolom baru
 * pada sheet lama. Aman dijalankan ulang — tidak menimpa data yang ada.
 */
function setupSheet(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let config = ss.getSheetByName(CONFIG_SHEET);
  if (!config) config = ss.insertSheet(CONFIG_SHEET);
  if (config.getLastRow() < 1){
    config.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]).setFontWeight("bold");
    config.setFrozenRows(1);
  }
  const existingKeys = readConfigRows_().map(r => r.key.toLowerCase());
  const defaults = [
    ["PIN", "141172"],
    ["NamaPria", "Nama Mempelai Pria"],
    ["NamaWanita", "Nama Mempelai Wanita"],
    ["Tagline", "Merangkai adat Bugis, dari Mappettuada menuju Resepsi."],
    ["TanggalResepsi", "2026-12-12 09:00:00"],
    ["FotoHero", ""]
  ];
  defaults.forEach(([key, value]) => {
    if (existingKeys.indexOf(key.toLowerCase()) > -1) return;
    const row = config.getLastRow() + 1;
    config.getRange(row, 1).setValue(key);
    const cell = config.getRange(row, 2);
    if (key === "TanggalResepsi") cell.setNumberFormat("dd/mm/yyyy hh:mm").setValue(value);
    else cell.setNumberFormat(NUMBER_FORMATS.text).setValue(value);
  });

  Object.keys(ENTITIES).forEach(name => {
    const sheet = getSheet_(ENTITIES[name]);
    ensureColumns_(sheet, ENTITIES[name]);
    sheet.setFrozenRows(1);
  });

  const timeline = ss.getSheetByName(ENTITIES.timeline.sheet);
  if (timeline.getLastRow() < 2){
    appendRows_(ENTITIES.timeline, TAHAPAN_ADAT.map(s => ({ tahap: s.tahap, namaAdat: s.namaAdat, status: "Belum Mulai" })));
  }

  notify_("Setup selesai! Sheet siap dipakai. Lanjutkan ke Deploy (atau Manage deployments > New version jika sudah pernah deploy).");
}

/**
 * Jalankan SEKALI dari editor Apps Script (pilih sesuaikanTahapanAdat lalu
 * klik Run) untuk merapikan tab Timeline sesuai TAHAPAN_ADAT:
 * Seserahan (Mappaenre Balanca) dan Malam Pacar (Mappacci) menjadi dua
 * tahapan terpisah. Tahapan dicocokkan berdasarkan kolom "Tahap"; status,
 * tanggal, dan catatan yang sudah diisi tetap dipertahankan. Tahapan lain
 * buatanmu sendiri dipindah ke urutan paling akhir.
 * Aman dijalankan ulang — tidak membuat duplikat.
 */
function sesuaikanTahapanAdat(){
  const def = ENTITIES.timeline;
  const sheet = getSheet_(def);
  const headers = ensureColumns_(sheet, def);
  const iId = headers.indexOf("id");
  const iTahap = headers.indexOf("tahap");
  const iAdat = headers.indexOf("namaadat");
  const iStatus = headers.indexOf("status");
  const width = headers.length;
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, width).getValues().filter(r => !isEmptyRow_(r))
    : [];

  let nextId = rows.reduce((m, r) => Math.max(m, Number(r[iId]) || 0), 0) + 1;
  const used = new Set();
  const added = [];
  const result = TAHAPAN_ADAT.map(stage => {
    const idx = rows.findIndex((r, i) => !used.has(i) && String(r[iTahap]).trim().toLowerCase() === stage.tahap.toLowerCase());
    let row;
    if (idx > -1){
      used.add(idx);
      row = rows[idx].slice();
    } else {
      row = new Array(width).fill("");
      row[iId] = nextId++;
      row[iStatus] = "Belum Mulai";
      added.push(stage.tahap);
    }
    row[iTahap] = stage.tahap;
    row[iAdat] = stage.namaAdat;
    return row;
  });
  rows.forEach((r, i) => { if (!used.has(i)) result.push(r); });

  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  sheet.getRange(2, 1, result.length, width).setValues(result);

  // Seragamkan ejaan "Mappettuada" pada tagline
  const config = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  const tagline = readConfigRows_().find(r => r.key.toLowerCase() === "tagline");
  let taglineFixed = false;
  if (config && tagline && typeof tagline.value === "string" && tagline.value.indexOf("Mapettuada") > -1){
    config.getRange(tagline.row, 2).setValue(tagline.value.replace(/Mapettuada/g, "Mappettuada"));
    taglineFixed = true;
  }

  notify_("Tahapan adat sudah disesuaikan:\n" +
    result.map((r, i) => `${i + 1}. ${r[iTahap]}${r[iAdat] && r[iAdat] !== r[iTahap] ? " — " + r[iAdat] : ""}`).join("\n") +
    (added.length ? `\n\nTahapan baru: ${added.join(", ")}.` : "") +
    (taglineFixed ? "\nEjaan tagline diperbaiki menjadi \"Mappettuada\"." : ""));
}

function notify_(message){
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err){
    Logger.log(message);
  }
}
