# Pernah di Sini

> *"yang tersisa bukan siapa yang paling terlihat, tapi siapa yang pernah ada."*

Buku kenangan digital angkatan 2026 — SMK Negeri 3 Tapung Hulu.

url : https://bukukenangan.vercel.app/

---

## Tentang

**Pernah di Sini** adalah buku kenangan berbasis web untuk angkatan 2023–2026 SMKN 3 Tapung Hulu — ruang untuk menyimpan nama, foto, dan pesan sebelum semuanya benar-benar berpisah.

**Status: statis, tanpa database.** Situs ini HTML/CSS/JS murni — tidak ada Supabase atau backend apa pun lagi. Semua yang sudah ditulis dibaca dari file JSON yang dibundel di repo. Pesan/foto **baru** masih bisa dikirim, tapi lewat WhatsApp/email ke admin (bukan tersimpan otomatis) — admin review lalu tempel manual. Detail alurnya di bagian [Moderasi](#moderasi) di bawah.

Sebelumnya situs ini pakai [Supabase](https://supabase.com) sebagai backend live untuk semua fitur interaktif, di-deploy ke Vercel. Kode versi itu masih ada di `legacy-live-version/` sebagai referensi.

---

## Struktur File

```
├── index.html                    # Sampul (satu-satunya halaman di root)
├── 404.html
├── README.md
│
├── assets/
│   ├── css/
│   │   └── style.css              # Semua styling
│   ├── js/
│   │   ├── utils.js                # escHtml, formatTimeAgo, page transition, dll
│   │   ├── data.js                 # Loader data/*.json (fetch)
│   │   ├── submit-config.js        # ⚠️ ISI nomor WA & email admin di sini
│   │   ├── submit.js               # Logic kirim → handoff WA/email
│   │   ├── galeri.js
│   │   └── pesan.js
│   └── images/
│       ├── gallery/                 # Foto hasil moderasi (lihat moderasi.html)
│       └── misc/
│           └── og.jpg
│
├── data/
│   ├── students.json
│   ├── messages.json
│   └── gallery.json                 # { admin: [...], user: [...] }
│
├── pages/
│   ├── pembuka.html
│   ├── angkatan.html
│   ├── galeri.html
│   ├── pesan.html
│   └── pustaka.html
│
├── export-data.html                 # Tool sekali-pakai: Supabase lama → data/*.json
├── download-photos.html             # Tool sekali-pakai: download foto lama dari Supabase Storage → lokal
├── moderasi.html                    # Tool: tempel pesan/foto baru ke data/*.json
│
└── legacy-live-version/             # Kode versi live (Supabase) — arsip referensi
```

---

## Setup Lokal

Data sekarang JSON murni yang diambil lewat `fetch()`, jadi situs **harus dibuka lewat server**, bukan `file://` langsung.

```bash
git clone https://github.com/SMKN3TPH/Perpisahan.git
cd Perpisahan
python3 -m http.server 8000
# buka http://localhost:8000
```

Atau deploy ke Vercel seperti biasa — otomatis jalan karena sudah lewat https.

---

## Sebelum Deploy — Wajib Diisi

Buka `assets/js/submit-config.js`, isi dua nilai ini:

```js
const SUBMIT_CONFIG = {
  whatsappNumber: '6281234567890',   // nomor WA admin, format 62xxx
  email: 'admin@contoh.com',          // email admin
};
```

Tanpa ini, tombol "Kirim Pesan"/"Kirim Foto" akan menampilkan pesan error.

---

## Moderasi

Situs statis = tidak ada database yang otomatis menyimpan kiriman. Alurnya:

1. **Pengunjung kirim** — isi form di halaman Pesan/Galeri → situs membuka WhatsApp atau email ke admin dengan isi pesan sudah terformat rapi (untuk foto: browser yang mendukung Web Share API akan melampirkan filenya langsung; kalau tidak, pengunjung diminta lampirkan manual).
2. **Admin terima & review** — via WhatsApp/email seperti biasa. Di sinilah moderasi terjadi.
3. **Admin tempel ke situs** — buka `moderasi.html` di browser:
   - Tab **Tambah Pesan**: muat `data/messages.json` yang ada, isi form dari pesan yang masuk, klik tambah, lalu download & timpa file lama.
   - Tab **Tambah Foto**: sama, tapi tiap foto juga otomatis men-download ulang file gambarnya (sudah diganti nama) — pindahkan ke `assets/images/gallery/`.
4. **Commit & push** — Vercel otomatis re-deploy.

**Soal foto lama vs baru:** foto hasil export dari Supabase (lewat `export-data.html`) masih menunjuk ke URL Supabase Storage — bucket-nya harus tetap ada & public. Foto **baru** dari `moderasi.html` sepenuhnya lokal di `assets/images/gallery/`, tidak bergantung ke mana pun.

---

## Lepas Total dari Supabase (termasuk foto lama)

Data teks (`data/*.json`) sudah 100% lepas dari Supabase — pause atau tidak, tidak berpengaruh. Tapi foto **lama** (hasil `export-data.html`) masih di-load dari Supabase Storage, dan **Storage ikut tidak bisa diakses saat project di-pause**, bukan cuma saat dihapus. Kalau tujuannya benar-benar menghindari dampak pause sepenuhnya, foto lama juga perlu dipindah lokal:

1. Buka `download-photos.html` di browser (butuh internet, dan Supabase belum di-pause saat ini).
2. Klik **"Mulai Download & Bundling"** — semua foto di-download, di-bundling jadi `gallery-photos-bundle.zip` (bisa beberapa menit tergantung jumlah foto).
3. Extract, pindahkan isi folder `gallery-photos/` ke `assets/images/gallery/`.
4. Timpa `data/gallery.json` dengan `gallery.json` dari dalam zip (path foto di dalamnya sudah otomatis diarahkan ke lokal).
5. Commit & push. Setelah ini, project Supabase-nya boleh di-pause atau bahkan dihapus — situs tidak terpengaruh sama sekali lagi.

---

## Catatan Konversi

Beberapa hal yang berubah/ditemukan saat situs ini diubah jadi statis:

- Kode jurusan yang benar adalah **`MPLB`** (bukan `MP`) — sudah dikonsistenkan di semua file termasuk satu tombol filter di `pesan.html` yang sebelumnya masih pakai `MP`.
- `legacy-live-version/admin.html` sempat kehilangan `<script src="utils.js">` + `<script src="supabase.js">`, dan salah satu link mengarah ke `gallery.html` (harusnya `galeri.html`) — sudah diperbaiki, plus 2 patch escaping (`image_url`) untuk celah XSS di panel moderasi.
- Fitur ProfileModal/UserMemory (identitas tersimpan lintas sesi) tidak dipertahankan — form kirim sekarang minta nama/peran/jurusan langsung tiap kali, karena kirim lewat WA/email tidak butuh sesi persisten.
- Fitur murni frontend dari versi live (transisi slide antar foto, tombol back HP menutup modal alih-alih pindah halaman, panah navigasi auto-hide, resize grid masonry) semuanya dipertahankan — tidak berkaitan dengan database sama sekali.

---

## Lisensi

**Bukan template siap-pakai.** Repo ini isinya data asli 68 siswa (nama lengkap) di `data/students.json`, plus nama guru dan struktur jurusan SMKN 3 Tapung Hulu yang nempel di banyak tempat — bukan cuma di file data, tapi juga di kode (`JURUSAN_LIST` di `utils.js`, filter di `galeri.js`/`pesan.js`, dropdown di beberapa halaman). Jangan diupload ke tempat publik lain atau dibagikan ke pihak luar apa adanya — itu sama dengan menyebarkan data pribadi orang tanpa izin mereka.

Kalau ada sekolah lain yang mau bikin situs serupa: pola arsitekturnya (statis + kirim lewat WA/email + moderasi manual) boleh dijadikan referensi/inspirasi, tapi bukan dengan fork/clone langsung — mulai dari kosong, ganti semua data & konfigurasi jurusan sesuai sekolah masing-masing.

Konten (teks, nama siswa, foto) milik angkatan 2026 SMKN 3 Tapung Hulu.

---

<p align="center">
  Angkatan 2023 – 2026 &nbsp;·&nbsp; SMK Negeri 3 Tapung Hulu<br>
  <em>Nggak selalu kompak. Tapi pernah ada.</em>
</p>
