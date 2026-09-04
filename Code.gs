/**
 * BACKEND GOOGLE APPS SCRIPT — Website Persiapan Pernikahan
 * ----------------------------------------------------------
 * Cara pakai singkat (detail lengkap ada di README.md):
 * 1. Buat Google Sheet baru dengan 6 tab (nama harus persis sama):
 *      Config | Timeline | Checklist | Budget | Vendor | Gallery
 * 2. Buka Extensions > Apps Script pada sheet tersebut, hapus isi
 *    default, lalu tempel seluruh isi file ini.
 * 3. Jalankan fungsi setupSheet() sekali (lihat README) untuk
 *    membuat header & data awal secara otomatis.
 * 4. Deploy > New deployment > Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Salin URL Web App yang muncul, tempel ke CONFIG.APPS_SCRIPT_URL
 *    di file js/data.js pada situs.
 */

const SHEET_NAMES = {
  config: "Config",
  timeline: "Timeline",
  checklist: "Checklist",
  budget: "Budget",
  vendor: "Vendor",
  gallery: "Gallery"
};

function getSheet_(name){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet tidak ditemukan: " + name);
  return sheet;
}

function sheetToObjects_(name){
  const sheet = getSheet_(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1).filter(r => r.join("") !== "");
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[toCamel_(h)] = row[i]; });
    return obj;
  });
}

function toCamel_(h){
  const map = {
    "ID": "id", "Tahap": "tahap", "NamaAdat": "namaAdat", "Tanggal": "tanggal",
    "Status": "status", "Catatan": "catatan", "Item": "item", "Selesai": "selesai",
    "PIC": "pic", "Kategori": "kategori", "Estimasi": "estimasi", "Aktual": "aktual",
    "Nama": "nama", "Kontak": "kontak", "Harga": "harga", "URL": "url", "Caption": "caption",
    "Key": "key", "Value": "value"
  };
  return map[h] || h.charAt(0).toLowerCase() + h.slice(1);
}

function readConfig_(){
  const rows = sheetToObjects_(SHEET_NAMES.config); // rows of {key, value}
  const cfg = {};
  rows.forEach(r => {
    const key = String(r.key || "").trim();
    if (!key) return;
    if (key === "TanggalResepsi" && r.value instanceof Date){
      cfg.tanggalResepsi = r.value.toISOString();
    } else {
      const camel = key.charAt(0).toLowerCase() + key.slice(1);
      cfg[camel] = r.value;
    }
  });
  return cfg;
}

function getAllData_(){
  return {
    config: readConfig_(),
    timeline: sheetToObjects_(SHEET_NAMES.timeline),
    checklist: sheetToObjects_(SHEET_NAMES.checklist).map(c => ({ ...c, selesai: c.selesai === true || c.selesai === "TRUE" })),
    budget: sheetToObjects_(SHEET_NAMES.budget),
    vendor: sheetToObjects_(SHEET_NAMES.vendor),
    gallery: sheetToObjects_(SHEET_NAMES.gallery)
  };
}

function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= doGet ================= */
function doGet(e){
  const action = (e.parameter.action || "all");
  if (action === "verifyPin"){
    const cfg = readConfig_();
    const pin = String(e.parameter.pin || "");
    return jsonOut_({ ok: pin === String(cfg.pin || "") });
  }
  return jsonOut_(getAllData_());
}

/* ================= doPost ================= */
function doPost(e){
  const body = JSON.parse(e.postData.contents || "{}");
  const action = body.action;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (action){
      case "updateTimeline": updateTimeline_(body); break;
      case "addChecklistItem": addChecklistItem_(body); break;
      case "toggleChecklistItem": toggleChecklistItem_(body); break;
      case "deleteChecklistItem": deleteRowById_(SHEET_NAMES.checklist, body.id); break;
      case "addBudgetItem": addBudgetItem_(body); break;
      case "deleteBudgetItem": deleteRowById_(SHEET_NAMES.budget, body.id); break;
      case "addVendor": addVendor_(body); break;
      case "updateVendorStatus": updateVendorStatus_(body); break;
      case "deleteVendor": deleteRowById_(SHEET_NAMES.vendor, body.id); break;
      case "addGalleryPhoto": addGalleryPhoto_(body); break;
      case "deleteGalleryPhoto": deleteRowById_(SHEET_NAMES.gallery, body.id); break;
      default: throw new Error("Aksi tidak dikenali: " + action);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonOut_(getAllData_());
}

/* ================= HELPERS: generic row ops ================= */
function nextId_(sheetName){
  const rows = sheetToObjects_(sheetName);
  const ids = rows.map(r => Number(r.id) || 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function findRowIndexById_(sheet, id){
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++){
    if (Number(values[i][0]) === Number(id)) return i + 1; // 1-indexed row number
  }
  return -1;
}

function deleteRowById_(sheetName, id){
  const sheet = getSheet_(sheetName);
  const rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex > -1) sheet.deleteRow(rowIndex);
}

/* ================= HELPERS: specific ops ================= */
function updateTimeline_(body){
  const sheet = getSheet_(SHEET_NAMES.timeline);
  const rowIndex = findRowIndexById_(sheet, body.id);
  if (rowIndex > -1){
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusCol = headers.indexOf("Status") + 1;
    if (statusCol > 0) sheet.getRange(rowIndex, statusCol).setValue(body.status);
  }
}

function addChecklistItem_(body){
  const sheet = getSheet_(SHEET_NAMES.checklist);
  sheet.appendRow([nextId_(SHEET_NAMES.checklist), body.item, false, body.pic || ""]);
}

function toggleChecklistItem_(body){
  const sheet = getSheet_(SHEET_NAMES.checklist);
  const rowIndex = findRowIndexById_(sheet, body.id);
  if (rowIndex > -1){
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = headers.indexOf("Selesai") + 1;
    if (col > 0) sheet.getRange(rowIndex, col).setValue(!!body.selesai);
  }
}

function addBudgetItem_(body){
  const sheet = getSheet_(SHEET_NAMES.budget);
  sheet.appendRow([nextId_(SHEET_NAMES.budget), body.kategori, Number(body.estimasi) || 0, Number(body.aktual) || 0, body.catatan || ""]);
}

function addVendor_(body){
  const sheet = getSheet_(SHEET_NAMES.vendor);
  sheet.appendRow([nextId_(SHEET_NAMES.vendor), body.nama, body.kategori, body.kontak || "", body.harga || "", body.status || "Dipertimbangkan"]);
}

function updateVendorStatus_(body){
  const sheet = getSheet_(SHEET_NAMES.vendor);
  const rowIndex = findRowIndexById_(sheet, body.id);
  if (rowIndex > -1){
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = headers.indexOf("Status") + 1;
    if (col > 0) sheet.getRange(rowIndex, col).setValue(body.status);
  }
}

function addGalleryPhoto_(body){
  const sheet = getSheet_(SHEET_NAMES.gallery);
  sheet.appendRow([nextId_(SHEET_NAMES.gallery), body.url, body.caption || ""]);
}

/**
 * Jalankan fungsi ini SEKALI dari editor Apps Script (pilih setupSheet
 * lalu klik Run) untuk membuat semua tab, header, dan data contoh.
 * Aman dijalankan ulang — tidak akan menduplikasi tab yang sudah ada.
 */
function setupSheet(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function ensureSheet(name, headerRow){
    let sheet = ss.getSheetByName(name);
    if (!sheet){
      sheet = ss.insertSheet(name);
      sheet.appendRow(headerRow);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  ensureSheet(SHEET_NAMES.config, ["Key", "Value"]);
  ensureSheet(SHEET_NAMES.timeline, ["ID", "Tahap", "NamaAdat", "Tanggal", "Status", "Catatan"]);
  ensureSheet(SHEET_NAMES.checklist, ["ID", "Item", "Selesai", "PIC"]);
  ensureSheet(SHEET_NAMES.budget, ["ID", "Kategori", "Estimasi", "Aktual", "Catatan"]);
  ensureSheet(SHEET_NAMES.vendor, ["ID", "Nama", "Kategori", "Kontak", "Harga", "Status"]);
  ensureSheet(SHEET_NAMES.gallery, ["ID", "URL", "Caption"]);

  const configSheet = ss.getSheetByName(SHEET_NAMES.config);
  if (configSheet.getLastRow() < 2){
    configSheet.getRange(2, 1, 7, 2).setValues([
      ["PIN", "141172"],
      ["NamaPria", "Nama Mempelai Pria"],
      ["NamaWanita", "Nama Mempelai Wanita"],
      ["Tagline", "Merangkai adat Bugis, dari Mapettuada menuju Resepsi."],
      ["TanggalResepsi", new Date("2026-12-12T09:00:00")],
      ["FotoHero", ""],
      ["", ""]
    ]);
  }

  const timelineSheet = ss.getSheetByName(SHEET_NAMES.timeline);
  if (timelineSheet.getLastRow() < 2){
    timelineSheet.getRange(2, 1, 4, 6).setValues([
      [1, "Lamaran", "Mapettuada", "", "Belum Mulai", ""],
      [2, "Seserahan", "Mappacci", "", "Belum Mulai", ""],
      [3, "Akad", "Akad Nikah", "", "Belum Mulai", ""],
      [4, "Resepsi", "Resepsi", "", "Belum Mulai", ""]
    ]);
  }

  SpreadsheetApp.getUi().alert("Setup selesai! Sheet siap dipakai. Lanjutkan ke langkah Deploy > New deployment.");
}
