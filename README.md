# Website Persiapan Pernikahan (Adat Bugis)

Website privat untuk berdua, menampilkan hero countdown, roadmap 4 tahap
adat Bugis (Mapettuada → Mappacci → Akad → Resepsi), checklist kolaboratif,
budget tracker, daftar vendor, dan galeri foto. Data disimpan di Google
Sheet supaya bisa diupdate dari HP masing-masing, hosting gratis di GitHub
Pages.

Struktur file:
```
wedding-site/
├─ index.html
├─ css/style.css
├─ js/data.js        <- pengaturan URL Apps Script, PIN cadangan, data demo
├─ js/script.js
├─ apps-script/Code.gs  <- kode backend, ditempel ke Google Apps Script
└─ README.md
```

Situs ini **bisa langsung dibuka dan dicoba** tanpa setup apa pun — ia akan
jalan dalam "mode demo" (data tersimpan di browser HP/laptop masing-masing,
tidak sinkron). Ikuti langkah di bawah untuk menyambungkannya ke Google
Sheet agar data benar-benar sinkron antar device.

---

## 1. Siapkan Google Sheet

1. Buat Google Sheet baru (spreadsheet kosong), beri nama misalnya
   **"Data Pernikahan"**.
2. Buka menu **Extensions > Apps Script**.
3. Hapus semua kode default di editor, lalu salin-tempel seluruh isi file
   `apps-script/Code.gs` dari folder ini ke sana.
4. Simpan (ikon disket / Ctrl+S), beri nama project misalnya "API Pernikahan".
5. Di dropdown fungsi (di sebelah tombol Run/Jalankan), pilih fungsi
   **`setupSheet`**, lalu klik **Run**.
   - Saat pertama kali dijalankan, Google akan meminta izin akses ke
     spreadsheet-mu — klik **Continue/Lanjutkan**, pilih akunmu, lalu
     **Allow/Izinkan** (klik "Advanced" > "Go to project (unsafe)" jika
     muncul peringatan — ini normal untuk skrip milikmu sendiri).
   - Setelah selesai, cek spreadsheet-mu: seharusnya sudah muncul 6 tab
     (Config, Timeline, Checklist, Budget, Vendor, Gallery) berisi data awal.
6. Buka tab **Config**, sesuaikan isinya:
   - `PIN` — ganti dengan PIN rahasia kalian berdua (bebas, misal tanggal
     jadian, 4–8 digit).
   - `NamaPria`, `NamaWanita` — nama yang tampil di hero.
   - `Tagline` — kalimat singkat di bawah nama.
   - `TanggalResepsi` — isi tanggal & jam resepsi (format tanggal Sheet,
     mis. `12/12/2026 09:00:00`), ini yang dipakai untuk hitung mundur.
   - `FotoHero` — tempel link gambar foto berdua (lihat catatan foto di
     bawah).
7. Tab **Timeline** sudah berisi 4 baris (Lamaran/Mapettuada, dst). Kamu
   bisa isi kolom `Tanggal` dan `Catatan` sesuai rencana kalian; kolom
   `Status` akan otomatis terupdate dari website saat kalian menekan
   dropdown status di situs.
8. Tab Checklist/Budget/Vendor/Gallery boleh dikosongkan — isinya akan
   terisi otomatis lewat form di website.

### Soal foto (hero & galeri)
Google Apps Script tidak menerima upload file dari form biasa, jadi cara
termudah: upload foto ke **Google Drive**, klik kanan > **Share > Anyone
with the link**, lalu ubah link `.../view?usp=sharing` menjadi format
`https://drive.google.com/uc?export=view&id=FILE_ID` (FILE_ID diambil dari
URL aslinya), lalu tempel link itu ke kolom FotoHero atau ke form galeri.
Alternatif lain: unggah ke [imgur.com](https://imgur.com) dan pakai
link gambar langsungnya.

---

## 2. Deploy Apps Script sebagai Web App

1. Masih di editor Apps Script, klik **Deploy > New deployment**.
2. Klik ikon gear ⚙️ di samping "Select type", pilih **Web app**.
3. Isi:
   - Description: bebas, mis. "API Website Pernikahan"
   - Execute as: **Me (emailmu)**
   - Who has access: **Anyone**
4. Klik **Deploy**, lalu **Authorize access** jika diminta (sama seperti
   langkah izin sebelumnya).
5. Setelah selesai, salin **Web app URL** yang muncul (formatnya
   `https://script.google.com/macros/s/AKfycb..../exec`).

> Catatan: setiap kali kamu mengubah isi `Code.gs`, kamu perlu **Deploy >
> Manage deployments > (ikon pensil) > New version > Deploy** supaya
> perubahan ikut ter-update di URL yang sama.

---

## 3. Sambungkan website ke Apps Script

1. Buka file `js/data.js`.
2. Isi `APPS_SCRIPT_URL` dengan URL yang kamu salin di langkah sebelumnya:
   ```js
   const CONFIG = {
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb..../exec",
     ...
   };
   ```
3. Simpan file. Website sekarang akan membaca & menulis langsung ke
   Google Sheet-mu, dari device mana pun.

---

## 4. Hosting gratis di GitHub Pages

1. Buat repository baru di GitHub, misalnya `wedding-site` (bisa **Private**
   — GitHub Pages tetap bisa dipakai untuk repo private jika akun kalian
   punya GitHub Pro/edu; kalau ingin gratis penuh tanpa syarat, pakai repo
   **Public** — ingat, isi repo publik bisa dilihat siapa saja walau
   situsnya sendiri tetap terkunci PIN).
2. Upload semua isi folder `wedding-site/` (index.html, css/, js/,
   apps-script/, README.md) ke root repository tersebut.
3. Buka **Settings > Pages** pada repo.
4. Di bagian **Source**, pilih branch `main` dan folder `/ (root)`, lalu
   **Save**.
5. Tunggu 1–2 menit, GitHub akan memberi URL seperti
   `https://username.github.io/wedding-site/` — itulah link situs kalian.

---

## 5. Tentang keamanan PIN

PIN di situs ini adalah pengaman sederhana (mencegah orang iseng yang
menemukan link secara tidak sengaja), **bukan** sistem login yang benar-benar
aman — karena situsnya statis (GitHub Pages) tanpa server login sungguhan.
Siapa pun yang tahu URL Apps Script secara teknis tetap bisa mengakses data
mentahnya. Untuk kebutuhan pribadi seperti ini biasanya sudah cukup aman
selama link tidak disebar; jangan gunakan PIN atau situs ini untuk
menyimpan data yang benar-benar sensitif (mis. nomor rekening, dokumen
resmi).

---

## 6. Kustomisasi lanjutan

- **Warna & font**: semua ada di `css/style.css`, bagian `:root { ... }`
  paling atas (dusty pink, cream, gold).
- **Tahap timeline**: tambah/ubah baris di tab **Timeline** pada Google
  Sheet (kolom ID harus angka unik).
- **PIN cadangan** (dipakai kalau internet ke Google Sheet lagi bermasalah):
  ubah `FALLBACK_PIN` di `js/data.js`.

Selamat mempersiapkan hari bahagianya! 🌸
