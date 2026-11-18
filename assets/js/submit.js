/**
 * assets/js/submit.js — Pernah di Sini
 * Logic "kirim" untuk situs statis: tidak ada database, jadi kiriman
 * diarahkan ke WhatsApp/email admin (SUBMIT_CONFIG di submit-config.js),
 * lalu admin moderasi manual lewat moderasi.html sebelum masuk ke situs.
 */

function _waLink(text) {
    return `https://wa.me/${SUBMIT_CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
function _mailLink(subject, body) {
    return `mailto:${SUBMIT_CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function _configReady() {
    return !SUBMIT_CONFIG.whatsappNumber.startsWith('GANTI') &&
           !SUBMIT_CONFIG.email.startsWith('GANTI');
}


// ════════════════════════════════
// INTI HANDOFF — dipakai submitMessageHandoff & submitPhotoHandoff.
// `file` opsional: kalau ada, coba Web Share API dulu (bisa bawa file,
// didukung sebagian besar browser mobile — BELUM didukung sebagian besar
// browser desktop); kalau nggak ada/nggak didukung, fallback ke WA/email
// cuma teks (wa.me/mailto: nggak bisa bawa lampiran), minta user attach manual.
// Return true kalau user benar-benar lanjut ke WA/email/share, false kalau
// batal atau config belum siap — pemanggil pakai ini buat tahu boleh
// bersihkan/tutup form atau tidak (jangan buang isian kalau belum terkirim).
// ════════════════════════════════
async function _sendHandoff(text, file, emailSubject) {
    if (!_configReady()) {
        showToast('Situs belum dikonfigurasi admin — lihat submit-config.js', 4000);
        return false;
    }

    if (file && navigator.canShare) {
        try {
            // `title` sengaja nggak diikutkan — beberapa browser/WebView jadi
            // nolak canShare() pas files+title digabung, padahal files+text
            // doang didukung. Judulnya udah ada di `text` juga, jadi aman dibuang.
            const shareData = { files: [file], text };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return true; // berhasil dibagikan lewat share sheet OS (WA/Email/dll)
            }
        } catch (e) {
            if (e.name === 'AbortError') return false; // user batal — jangan lanjut ke fallback
            console.warn('[_sendHandoff] Web Share gagal, pakai fallback:', e.message);
        }
    }

    // Sampai sini berarti Web Share nggak kepake (nggak didukung / gagal) —
    // wa.me & mailto: cuma bisa bawa teks, jadi fotonya PASTI nggak ke-attach
    // otomatis. Peringatan ini HARUS tampil sebelum WA/email kebuka, bukan
    // sesudahnya (toast abis window.open sering kelewat, HP udah pindah app).
    const teks = file
        ? text + '\n\n(Lampirkan foto secara manual ya — browser ini belum bisa kirim otomatis)'
        : text;
    const warning = file
        ? '⚠️ Foto TIDAK ikut otomatis di jalur ini — nanti kamu perlu lampirkan sendiri dari galeri HP-mu.'
        : null;
    const sent = await new Promise((resolve) => {
        _openHandoffChoice(
            () => { window.open(_waLink(teks), '_blank'); resolve(true); },
            () => { window.location.href = _mailLink(emailSubject, teks); resolve(true); },
            () => resolve(false),
            warning
        );
    });
    return sent;
}


// ════════════════════════════════
// KIRIM PESAN — teks, dengan foto opsional (lihat _sendHandoff di atas)
// ════════════════════════════════
async function submitMessageHandoff(nama, peran, jurusan, isi, file = null) {
    const teks =
`Pesan Kenangan — Pernah di Sini

Nama: ${nama}
Peran/Jurusan: ${peran}${jurusan ? ' · ' + jurusan : ''}

Pesan:
${isi}`;
    return _sendHandoff(teks, file, 'Pesan Kenangan dari ' + nama);
}


// ════════════════════════════════
// KIRIM FOTO — judul + foto (wajib ada file)
// ════════════════════════════════
async function submitPhotoHandoff(file, title, nama) {
    const caption = `Foto Kenangan — Pernah di Sini\nJudul: ${title}\nDari: ${nama || 'Anonim'}`;
    return _sendHandoff(caption, file, 'Foto Kenangan dari ' + (nama || 'Anonim'));
}


// ════════════════════════════════
// PILIHAN WA / EMAIL — dialog kecil, bukan langsung nebak salah satu
// ════════════════════════════════
function _openHandoffChoice(onWa, onEmail, onCancel, warning = null) {
    const existing = document.getElementById('handoff-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'handoff-overlay';
    overlay.className = 'handoff-overlay';
    overlay.innerHTML = `
        <div class="handoff-box" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
            <div class="handoff-title" id="handoff-title">Kirim lewat mana?</div>
            <p class="handoff-sub">Kiriman kamu akan direview dulu oleh admin sebelum tampil di situs.</p>
            ${warning ? `<p class="handoff-warning">${escHtml(warning)}</p>` : ''}
            <button class="handoff-btn handoff-wa" id="handoff-wa">💬 WhatsApp</button>
            <button class="handoff-btn handoff-email" id="handoff-email">✉️ Email</button>
            <button class="handoff-cancel" id="handoff-cancel">Batal</button>
        </div>`;
    document.body.appendChild(overlay);

    const cleanup = (cb) => {
        overlay.remove();
        document.removeEventListener('keydown', onKeydown);
        cb?.();
    };
    const onKeydown = (e) => { if (e.key === 'Escape') cleanup(onCancel); };

    document.getElementById('handoff-wa').onclick = () => cleanup(onWa);
    document.getElementById('handoff-email').onclick = () => cleanup(onEmail);
    document.getElementById('handoff-cancel').onclick = () => cleanup(onCancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(onCancel); });
    document.addEventListener('keydown', onKeydown);
    document.getElementById('handoff-wa').focus();
}
