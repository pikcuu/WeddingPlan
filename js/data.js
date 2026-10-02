/* ==========================================================
   PENGATURAN UTAMA
   1. Ganti APPS_SCRIPT_URL setelah kamu deploy Google Apps Script
      (lihat README.md bagian "Hubungkan ke Google Sheet").
   2. Selama APPS_SCRIPT_URL masih kosong, situs berjalan dalam
      mode demo dengan DEMO_DATA di bawah (tersimpan di browser saja).
   3. FALLBACK_PIN dipakai di mode demo, atau saat Google Sheet tidak
      bisa dihubungi (website menampilkan data tersimpan terakhir).
      Setelah terhubung, PIN asli diambil dari tab "Config" di Sheet.
   ========================================================== */

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxvqXknGZZ_nbWVPyBbn9nCcDlwKuaj1jvT6wSniopPzQR1Jt5UqDhPZ_k-V5LOk2eF/exec", // contoh: "https://script.google.com/macros/s/XXXXX/exec"
  FALLBACK_PIN: "2402",
  FALLBACK: {
    namaPria: "Moh Taufik Hidayat",
    namaWanita: "Nurul Muayanah",
    tagline: "Merangkai adat Bugis, dari Mappettuada menuju Resepsi.",
    tanggalResepsi: "2026-11-24T09:00:00",
    fotoHero: ""
  }
};

/* Saran kategori — muncul otomatis saat mengetik kategori budget/vendor.
   Bebas ditambah atau diubah. */
const KATEGORI_SARAN = [
  "Uang Panai",
  "Mahar",
  "Erang-erang (Seserahan)",
  "Venue / Gedung",
  "Katering",
  "Dekorasi & Pelaminan",
  "Busana Adat",
  "Rias Pengantin (MUA)",
  "Dokumentasi (Foto & Video)",
  "Undangan",
  "Souvenir",
  "Hiburan & Musik",
  "MC",
  "Perlengkapan Mappacci",
  "Administrasi KUA",
  "Transportasi",
  "Lain-lain"
];

/* Template checklist — bisa dimuat sekali klik dari bagian Checklist.
   Tugas yang sudah ada tidak akan diduplikasi. */
const CHECKLIST_TEMPLATE = [
  "Sepakati uang panai & mahar bersama keluarga",
  "Tentukan tanggal akad & resepsi",
  "Susun anggaran & sumber dana pernikahan",
  "Urus surat pengantar nikah dari kelurahan",
  "Cek kesehatan pra-nikah di puskesmas",
  "Daftar nikah ke KUA (paling lambat 10 hari kerja sebelum akad)",
  "Booking gedung / lokasi resepsi",
  "Pilih & booking katering (termasuk test food)",
  "Pilih dekorasi & pelaminan adat Bugis",
  "Siapkan busana adat (Baju Bodo & Jas Tutu)",
  "Booking MUA / rias pengantin adat",
  "Booking fotografer & videografer",
  "Siapkan erang-erang (seserahan)",
  "Siapkan perlengkapan Mappacci",
  "Tentukan penghulu, saksi & pembaca doa",
  "Booking MC & hiburan",
  "Susun daftar tamu undangan",
  "Cetak & sebar undangan (fisik/digital)",
  "Pesan souvenir",
  "Siapkan cincin & mahar",
  "Fitting busana terakhir",
  "Susun rundown acara & bagi tugas keluarga",
  "Konfirmasi ulang semua vendor H-7"
];

/* Data contoh — tampil di mode demo (sebelum Google Sheet terhubung),
   supaya kamu bisa langsung melihat tampilan akhir situsnya. */
const DEMO_DATA = {
  timeline: [
    { id: 1, tahap: "Lamaran", namaAdat: "Mappettuada", tanggal: "", status: "Selesai", catatan: "Keluarga besar sudah bertemu dan menyepakati uang panai serta tanggal." },
    { id: 2, tahap: "Seserahan", namaAdat: "Mappaenre Balanca", tanggal: "", status: "Berjalan", catatan: "Mengantar uang panai dan erang-erang ke keluarga mempelai wanita." },
    { id: 3, tahap: "Malam Pacar", namaAdat: "Mappacci", tanggal: "", status: "Belum Mulai", catatan: "Malam sebelum akad, pemberkatan dengan daun pacci." },
    { id: 4, tahap: "Akad", namaAdat: "Akad Nikah", tanggal: "", status: "Belum Mulai", catatan: "" },
    { id: 5, tahap: "Resepsi", namaAdat: "Tudang Botting", tanggal: "", status: "Belum Mulai", catatan: "" }
  ],
  checklist: [
    { id: 1, item: "Survei gedung resepsi", selesai: true, pic: "Berdua", tenggat: "" },
    { id: 2, item: "Pilih vendor katering", selesai: false, pic: "", tenggat: "" },
    { id: 3, item: "Siapkan seserahan Mappacci", selesai: false, pic: "", tenggat: "" }
  ],
  budget: [
    { id: 1, kategori: "Venue / Gedung", estimasi: 25000000, aktual: 0, catatan: "" },
    { id: 2, kategori: "Katering", estimasi: 18000000, aktual: 0, catatan: "" }
  ],
  vendor: [
    { id: 1, nama: "Contoh Katering Bugis", kategori: "Katering", kontak: "08xxxxxxxxxx", harga: "Rp 85.000/porsi", status: "Dipertimbangkan", catatan: "" }
  ],
  gallery: []
};
