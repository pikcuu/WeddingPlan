/* ==========================================================
   PENGATURAN UTAMA
   1. Ganti APPS_SCRIPT_URL setelah kamu deploy Google Apps Script
      (lihat README.md bagian "Hubungkan ke Google Sheet").
   2. Selama APPS_SCRIPT_URL masih kosong, situs berjalan dengan
      DEMO_DATA di bawah ini (tersimpan sementara di browser saja).
   3. FALLBACK_PIN dipakai hanya jika Google Sheet belum terhubung.
      Setelah terhubung, PIN diambil dari sheet "Config".
   ========================================================== */

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxvqXknGZZ_nbWVPyBbn9nCcDlwKuaj1jvT6wSniopPzQR1Jt5UqDhPZ_k-V5LOk2eF/exec", // contoh: "https://script.google.com/macros/s/XXXXX/exec"
  FALLBACK_PIN: "2402",
  FALLBACK: {
    namaPria: "Moh Taufik Hidayat",
    namaWanita: "Nurul Muayanah",
    tagline: "Merangkai adat Bugis, dari Mapettuada menuju Resepsi.",
    tanggalResepsi: "2026-11-24T09:00:00",
    fotoHero: ""
  }
};

/* Data contoh — tampil sebelum Google Sheet terhubung, supaya kamu
   bisa langsung melihat tampilan akhir situsnya. */
const DEMO_DATA = {
  timeline: [
    { id: 1, tahap: "Lamaran", namaAdat: "Mapettuada", tanggal: "", status: "Selesai", catatan: "Keluarga besar sudah bertemu dan menyepakati rencana." },
    { id: 2, tahap: "Seserahan", namaAdat: "Mappacci", tanggal: "", status: "Berjalan", catatan: "Menyiapkan daftar seserahan dan busana adat." },
    { id: 3, tahap: "Akad", namaAdat: "Akad Nikah", tanggal: "", status: "Belum Mulai", catatan: "" },
    { id: 4, tahap: "Resepsi", namaAdat: "Resepsi", tanggal: "", status: "Belum Mulai", catatan: "" }
  ],
  checklist: [
    { id: 1, item: "Survei gedung resepsi", selesai: true, pic: "Berdua" },
    { id: 2, item: "Pilih vendor katering", selesai: false, pic: "" },
    { id: 3, item: "Siapkan seserahan Mappacci", selesai: false, pic: "" }
  ],
  budget: [
    { id: 1, kategori: "Venue", estimasi: 25000000, aktual: 0, catatan: "" },
    { id: 2, kategori: "Katering", estimasi: 18000000, aktual: 0, catatan: "" }
  ],
  vendor: [
    { id: 1, nama: "Contoh Katering Bugis", kategori: "Katering", kontak: "08xxxxxxxxxx", harga: "Rp 85.000/porsi", status: "Dipertimbangkan" }
  ],
  gallery: []
};
