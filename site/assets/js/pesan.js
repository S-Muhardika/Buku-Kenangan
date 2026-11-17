/**
 * pesan.js — Pernah di Sini
 * Halaman Pesan.
 *
 * Versi STATIS — situs tidak punya database. Pesan yang sudah ada dibaca
 * dari data/messages.json (snapshot, lihat export-data.html). Kirim pesan
 * BARU diarahkan ke WA/email admin lewat assets/js/submit.js — bukan
 * tersimpan otomatis, harus di-moderasi manual (lihat moderasi.html)
 * sebelum masuk ke messages.json.
 *
 * Dihapus dari versi live: filter kata kasar (moderasi sekarang manual
 * oleh admin), kuota & jam malam, ProfileModal/UserMemory, like/reaksi/
 * lapor pada pesan lama (semuanya nulis ke Supabase), sistem tanggal-
 * penutupan.
 *
 * Fix kecil dari versi live: updateFilterCounts() dulu menghitung badge
 * jumlah dari hasil yang SUDAH difilter, jadi begitu satu jurusan diklik,
 * badge jurusan lain ikut kebaca 0. Sekarang selalu dihitung dari seluruh
 * data pesan, independen dari filter yang aktif.
 *
 * Fix (audit): filter tombol "Guru" dulu ngecek m.jurusan === 'Guru',
 * padahal role tersimpan di field peran (jurusan-nya null buat Guru) —
 * jadi pesan guru nggak pernah muncul walau ada datanya. Sekarang ngecek
 * m.peran, di loadPesan() maupun updateFilterCounts(). Cabang filter
 * "Lainnya" (jurusan === 'Anonim') juga dibuang, dead code — nggak ada
 * tombolnya di pesan.html dan 'Anonim' memang bukan nilai jurusan.
 */

// ── INIT ──
let _messagesCache = null;

document.addEventListener('DOMContentLoaded', async () => {
    setupFilterButtons();
    bindCharCount();
    bindPeranToggle();
    bindPhotoPicker();
    document.getElementById('messages-list').innerHTML =
        `<div class="messages-loading">Memuat…</div>`;
    _messagesCache = await loadMessages();
    loadPesan('semua');
});


// ════════════════════════════════
// LOAD & RENDER PESAN
// ════════════════════════════════

let currentFilter = 'semua';

function loadPesan(filterJurusan = 'semua') {
    currentFilter = filterJurusan;
    const container = document.getElementById('messages-list');
    if (!container) return;

    const all = _messagesCache || [];
    const messages = filterJurusan === 'semua' ? all : all.filter(m => {
        if (filterJurusan === 'Guru') return m.peran === 'Guru';
        return m.jurusan === filterJurusan;
    });

    if (!messages.length) {
        container.innerHTML = `
            <div class="messages-empty">
                <div class="messages-empty-quote">"Belum ada pesan untuk filter ini."</div>
                <div class="messages-empty-rule"></div>
            </div>`;
        updateFilterCounts();
        return;
    }

    container.innerHTML = messages.map(m => buildCard(m)).join('');
    updateFilterCounts();
}

function buildCard(m) {
    const timeAgo = formatTimeAgo(m.created_at);

    const reaksiBadges = Object.entries(m.reaksi || {})
        .filter(([,c]) => c > 0)
        .map(([e,c]) => `<span class="reaction-count" style="cursor:default">${e} ${c}</span>`)
        .join('');

    const metaLabel = m.peran || (m.jurusan ? getJurusanLabel(m.jurusan) : '');

    return `
        <div class="message-card" id="msg-card-${m.id}">
            <div class="message-header">
                <div class="msg-identity">
                    <div class="msg-avatar">${escHtml(m.nama.charAt(0).toUpperCase())}</div>
                    <div>
                        <div class="message-author">${escHtml(m.nama)}</div>
                        <div class="message-meta">${escHtml(metaLabel)}</div>
                    </div>
                </div>
                <span class="message-time">${timeAgo}</span>
            </div>

            <div class="message-text">${escHtml(m.isi)}</div>

            <div class="message-actions">
                <span class="action-btn" style="cursor:default">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
                         stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <span class="like-count">${m.likes || 0}</span>
                </span>

                <div class="reaction-pills">${reaksiBadges}</div>
            </div>
        </div>`;
}


// ════════════════════════════════
// FORM KIRIM PESAN → handoff WA/email (lihat submit.js)
// ════════════════════════════════
function bindCharCount() {
    const field = document.getElementById('msg-text');
    const count = document.getElementById('char-count');
    if (!field || !count) return;
    field.addEventListener('input', () => { count.textContent = field.value.length; });
}

function bindPeranToggle() {
    const peran = document.getElementById('msg-peran');
    const jurusanField = document.getElementById('msg-jurusan-field');
    if (!peran || !jurusanField) return;
    peran.addEventListener('change', () => {
        jurusanField.style.display = peran.value === 'Siswa' ? '' : 'none';
    });
}

// Foto opsional buat pesan — Web Share API bisa bawa file+teks sekaligus
// (lihat _sendHandoff di submit.js), kalau browser nggak dukung tetap
// jalan sebagai teks saja seperti sebelumnya.
let _msgPhotoFile = null;

function bindPhotoPicker() {
    const pickBtn = document.getElementById('msg-photo-pick-btn');
    const fileInput = document.getElementById('msg-photo-file');
    const preview = document.getElementById('msg-photo-preview');
    const removeBtn = document.getElementById('msg-photo-remove-btn');
    if (!pickBtn || !fileInput || !preview || !removeBtn) return;

    pickBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        _msgPhotoFile = file;
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        removeBtn.style.display = 'flex';
    });
    removeBtn.addEventListener('click', clearMsgPhoto);
}

function clearMsgPhoto() {
    _msgPhotoFile = null;
    const fileInput = document.getElementById('msg-photo-file');
    const preview = document.getElementById('msg-photo-preview');
    const removeBtn = document.getElementById('msg-photo-remove-btn');
    if (fileInput) fileInput.value = '';
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (removeBtn) removeBtn.style.display = 'none';
}

async function handleSubmitPesan() {
    const nama    = document.getElementById('msg-nama').value.trim();
    const peran   = document.getElementById('msg-peran').value;
    const jurusan = peran === 'Siswa' ? document.getElementById('msg-jurusan').value : '';
    const isi     = document.getElementById('msg-text').value.trim();

    if (!nama)           { showToast('Isi namamu dulu ya'); return; }
    if (isi.length < 3)  { showToast('Pesannya kependekan'); return; }

    // Foto nggak di-reset kalau kiriman batal/gagal (sama kayak form foto
    // di Galeri) — cuma dibersihkan kalau beneran lanjut terkirim.
    const sent = await submitMessageHandoff(nama, peran, jurusan, isi, _msgPhotoFile);
    if (sent) clearMsgPhoto();
}
window.handleSubmitPesan = handleSubmitPesan;


// ════════════════════════════════
// FILTER JURUSAN
// ════════════════════════════════
function setupFilterButtons() {
    document.querySelectorAll('[data-jurusan]').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('[data-jurusan]').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
            loadPesan(this.dataset.jurusan);
        });
    });
}

// Selalu dihitung dari _messagesCache penuh (bukan hasil yang sudah
// difilter) — lihat catatan fix di header file.
function updateFilterCounts() {
    const all = _messagesCache || [];
    const counts = { semua: all.length };
    all.forEach(m => {
        if (m.peran === 'Guru') { counts.Guru = (counts.Guru || 0) + 1; return; }
        if (m.jurusan) counts[m.jurusan] = (counts[m.jurusan] || 0) + 1;
    });
    document.querySelectorAll('[data-jurusan] .count-badge').forEach(badge => {
        const key = badge.closest('[data-jurusan]').dataset.jurusan;
        badge.textContent = counts[key] || 0;
    });
}

// escHtml(), formatTimeAgo(), showToast() tersedia global dari utils.js.
