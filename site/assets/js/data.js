/**
 * assets/js/data.js — Pernah di Sini
 * Loader kecil untuk data statis di data/*.json.
 *
 * Dipakai oleh halaman-halaman di pages/ (angkatan, galeri, pesan) — semua
 * path di bawah relatif ke '../data/' karena struktur foldernya:
 *   pages/angkatan.html  →  ../data/students.json
 *
 * Data diambil lewat fetch() — konsekuensinya: situs harus di-serve lewat
 * http(s) (Vercel, atau server lokal seperti `python -m http.server` /
 * `vercel dev` / `npx serve`). Buka file HTML langsung dari disk (file://)
 * tidak akan berhasil memuat data, karena browser memblokir fetch() ke
 * file lokal atas alasan keamanan.
 */
async function loadJSON(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error(`[loadJSON] Gagal memuat ${path}:`, e.message);
        return null;
    }
}

async function loadStudents() {
    return (await loadJSON('../data/students.json')) || [];
}

async function loadMessages() {
    return (await loadJSON('../data/messages.json')) || [];
}

// gallery.json berisi { admin: [...], user: [...] } — satu file untuk
// dua sumber foto (dokumentasi resmi + kiriman teman-teman).
async function loadGallery() {
    return (await loadJSON('../data/gallery.json')) || { admin: [], user: [] };
}
