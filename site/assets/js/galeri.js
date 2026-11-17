/**
 * galeri.js — Pernah di Sini
 * Galeri foto: admin gallery + kiriman user.
 *
 * Versi STATIS — situs tidak punya database. Foto yang sudah ada dibaca
 * dari data/gallery.json (snapshot, lihat export-data.html). Kirim foto
 * BARU diarahkan ke WA/email admin lewat assets/js/submit.js (pakai Web
 * Share API kalau browser dukung) — bukan tersimpan otomatis, harus
 * di-moderasi manual (lihat moderasi.html) sebelum masuk ke gallery.json.
 *
 * Dihapus dari versi live: kuota upload, form upload langsung ke Supabase,
 * ProfileModal/UserMemory (nggak perlu sesi persisten untuk kirim sekali
 * lewat WA/email), like/reaksi/lapor pada foto lama, sistem tanggal-penutupan.
 *
 * DIPERTAHANKAN dari versi live (murni frontend, nggak butuh backend):
 * masonry grid + resizeGridItem, modal viewer zoom/pan/swipe, transisi
 * slide antar foto, back-button HP nutup modal (bukan pindah halaman),
 * nav arrow auto-hide, filter kategori & jurusan, badge reaksi (angka final).
 */

// ── STATE ─────────────────────────────────────────────────
let adminPhotos = [], userPhotos = [];
let currentAdminPage = 1, currentUserPage = 1;
let currentAdminCategory = 'all', currentAdminJurusan = 'all', currentUserCategory = 'all';
let currentModalPhotoList = [], currentModalPhotoIndex = 0, currentModalType = 'user';
let _webpSupported = null;
let _galleryCache = null; // { admin: [...], user: [...] } — diisi sekali oleh _ensureGalleryLoaded()

const PER_PAGE = 10;


// ── DETEKSI DUKUNGAN WEBP ─────────────────────────────────
function isWebPSupported() {
    if (_webpSupported !== null) return _webpSupported;
    const c = document.createElement('canvas');
    c.width = c.height = 1; c.getContext('2d');
    _webpSupported = c.toDataURL('image/webp').indexOf('image/webp') === 5;
    return _webpSupported;
}


// ── ZOOM STATE ────────────────────────────────────────────
const _z = {
    scale: 1, tx: 0, ty: 0,
    MIN: 1, MAX: 5,
    dragging: false,
    startX: 0, startY: 0,
    startTx: 0, startTy: 0,
    lastTap: 0,
    pinchDist: 0,
    pinchMidX: 0, pinchMidY: 0,
    hintTimer: null,
    swipeStartX: 0, swipeStartY: 0,
    swipeLastX: 0,
    isSwipe: false,
};

function _zoomReset() {
    _z.scale = 1; _z.tx = 0; _z.ty = 0;
    _z.dragging = false;
    _applyZoom(true);
}

function _applyZoom(animate = false) {
    const img = document.getElementById('modal-image');
    const con = document.getElementById('modal-img-container');
    const ind = document.getElementById('zoom-indicator');
    if (!img || !con) return;

    if (animate) img.classList.remove('is-interacting');
    else         img.classList.add('is-interacting');

    img.style.transform     = `translate(${_z.tx}px, ${_z.ty}px) scale(${_z.scale})`;
    img.style.transformOrigin = '0 0';

    if (_z.scale > 1) img.style.cursor = _z.dragging ? 'grabbing' : 'grab';
    else              img.style.cursor = 'zoom-in';

    if (ind) {
        const pct = Math.round(_z.scale * 100) + '%';
        ind.textContent = pct;
        if (_z.scale > 1) ind.classList.add('visible');
        else              ind.classList.remove('visible');
    }
}

function _zoomAt(f, sx, sy) {
    const img = document.getElementById('modal-img-container');
    if (!img) return;
    const rect    = img.getBoundingClientRect();
    const px      = sx - rect.left;
    const py      = sy - rect.top;
    const newScale = Math.max(_z.MIN, Math.min(_z.MAX, _z.scale * f));
    if (newScale === _z.scale) return;

    _z.tx    = px - (px - _z.tx) * (newScale / _z.scale);
    _z.ty    = py - (py - _z.ty) * (newScale / _z.scale);
    _z.scale = newScale;
    _clampPan();
    _applyZoom(false);
}

function _clampPan() {
    const con = document.getElementById('modal-img-container');
    const img = document.getElementById('modal-image');
    if (!con || !img) return;

    if (_z.scale <= 1) { _z.tx = 0; _z.ty = 0; return; }

    const cW = con.clientWidth, cH = con.clientHeight;
    const iW = img.naturalWidth  || img.clientWidth;
    const iH = img.naturalHeight || img.clientHeight;

    const ratio   = Math.min(cW / iW, cH / iH);
    const rendW   = iW * ratio;
    const rendH   = iH * ratio;
    const baseOffX = (cW - rendW) / 2;
    const baseOffY = (cH - rendH) / 2;

    const scaledW = rendW * _z.scale;
    const scaledH = rendH * _z.scale;

    const txMin = Math.min(0, cW - scaledW - baseOffX * (_z.scale - 1));
    const txMax = Math.max(0, baseOffX * (_z.scale - 1));
    const tyMin = Math.min(0, cH - scaledH - baseOffY * (_z.scale - 1));
    const tyMax = Math.max(0, baseOffY * (_z.scale - 1));

    _z.tx = Math.max(txMin, Math.min(txMax, _z.tx));
    _z.ty = Math.max(tyMin, Math.min(tyMax, _z.ty));
}

function _scheduleHideHint() {
    const hint = document.getElementById('modal-zoom-hint');
    if (!hint) return;
    clearTimeout(_z.hintTimer);
    _z.hintTimer = setTimeout(() => hint.classList.add('hidden'), 3000);
}


// ── EVENT LISTENERS ZOOM ──────────────────────────────────
function _attachZoomListeners() {
    const con = document.getElementById('modal-img-container');
    const img = document.getElementById('modal-image');
    if (!con || !img) return;

    con._onWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        _zoomAt(factor, e.clientX, e.clientY);
    };
    con.addEventListener('wheel', con._onWheel, { passive: false });

    con._onDblClick = (e) => {
        e.stopPropagation();
        if (_z.scale > 1) _zoomReset();
        else              _zoomAt(2.5, e.clientX, e.clientY);
    };
    con.addEventListener('dblclick', con._onDblClick);

    con._onMouseDown = (e) => {
        if (_z.scale <= 1) return;
        e.preventDefault();
        _z.dragging = true;
        _z.startX = e.clientX; _z.startY = e.clientY;
        _z.startTx = _z.tx; _z.startTy = _z.ty;
        img.classList.add('is-interacting');
        img.style.cursor = 'grabbing';
    };
    con.addEventListener('mousedown', con._onMouseDown);

    con._onMouseMove = (e) => {
        if (!_z.dragging) return;
        _z.tx = _z.startTx + (e.clientX - _z.startX);
        _z.ty = _z.startTy + (e.clientY - _z.startY);
        _clampPan();
        _applyZoom(false);
    };
    window.addEventListener('mousemove', con._onMouseMove);

    con._onMouseUp = () => {
        if (!_z.dragging) return;
        _z.dragging = false;
        _applyZoom(false);
    };
    window.addEventListener('mouseup', con._onMouseUp);

    con._onTouchStart = (e) => {
        if (e.touches.length === 1) {
            const now = Date.now();
            const t   = e.touches[0];
            if (now - _z.lastTap < 300) {
                e.preventDefault();
                _z.scale > 1 ? _zoomReset() : _zoomAt(2.5, t.clientX, t.clientY);
            }
            _z.lastTap = now;
            _z.swipeStartX = t.clientX; _z.swipeStartY = t.clientY;
            _z.swipeLastX  = t.clientX;
            _z.isSwipe     = false;
            if (_z.scale > 1) {
                _z.dragging = true;
                _z.startX = t.clientX; _z.startY = t.clientY;
                _z.startTx = _z.tx; _z.startTy = _z.ty;
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            _z.dragging = false; _z.isSwipe = false;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            _z.pinchDist = Math.hypot(dx, dy);
            _z.pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            _z.pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
        img.classList.add('is-interacting');
    };
    con.addEventListener('touchstart', con._onTouchStart, { passive: false });

    con._onTouchMove = (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.hypot(dx, dy);
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const factor = dist / (_z.pinchDist || dist);
            _z.pinchDist = dist; _z.pinchMidX = midX; _z.pinchMidY = midY;
            _zoomAt(factor, midX, midY);
        } else if (e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - _z.swipeStartX;
            const dy = t.clientY - _z.swipeStartY;
            _z.swipeLastX = t.clientX;
            if (_z.scale <= 1) {
                if (!_z.isSwipe && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) _z.isSwipe = true;
                if (_z.isSwipe) e.preventDefault();
            } else if (_z.dragging) {
                e.preventDefault();
                _z.tx = _z.startTx + dx; _z.ty = _z.startTy + dy;
                _clampPan();
                _applyZoom(false);
            }
        }
    };
    con.addEventListener('touchmove', con._onTouchMove, { passive: false });

    con._onTouchEnd = () => {
        if (_z.scale <= 1 && _z.isSwipe) {
            const dist = _z.swipeLastX - _z.swipeStartX;
            if (Math.abs(dist) > 55) navigatePhoto(dist < 0 ? 1 : -1);
        }
        _z.dragging = false; _z.pinchDist = 0; _z.isSwipe = false;
    };
    con.addEventListener('touchend', con._onTouchEnd);

    con._onKey = (e) => {
        if (e.key === 'Escape')    { closePhotoModal(); return; }
        if (e.key === '+' || e.key === '=') _zoomAt(1.25, window.innerWidth/2, window.innerHeight/2);
        if (e.key === '-')          _zoomAt(1/1.25, window.innerWidth/2, window.innerHeight/2);
        if (e.key === '0')          _zoomReset();
        if (e.key === 'ArrowLeft')  navigatePhoto(-1);
        if (e.key === 'ArrowRight') navigatePhoto(1);
    };
    window.addEventListener('keydown', con._onKey);
}

function _detachZoomListeners() {
    const con = document.getElementById('modal-img-container');
    if (!con) return;
    if (con._onWheel)      con.removeEventListener('wheel', con._onWheel);
    if (con._onDblClick)   con.removeEventListener('dblclick', con._onDblClick);
    if (con._onMouseDown)  con.removeEventListener('mousedown', con._onMouseDown);
    if (con._onMouseMove)  window.removeEventListener('mousemove', con._onMouseMove);
    if (con._onMouseUp)    window.removeEventListener('mouseup', con._onMouseUp);
    if (con._onTouchStart) con.removeEventListener('touchstart', con._onTouchStart);
    if (con._onTouchMove)  con.removeEventListener('touchmove', con._onTouchMove);
    if (con._onTouchEnd)   con.removeEventListener('touchend', con._onTouchEnd);
    if (con._onKey)        window.removeEventListener('keydown', con._onKey);
}


// ── MODAL FOTO — back-button (history) + auto-hide nav ────
let _navHideTimer = null;
function _scheduleHideNav() {
    const nav = document.querySelector('.modal-nav-row');
    if (!nav) return;
    nav.classList.remove('hidden');
    clearTimeout(_navHideTimer);
    _navHideTimer = setTimeout(() => nav.classList.add('hidden'), 2500);
}

function openPhotoModal() {
    document.getElementById('photo-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ pdsModal: 'photo' }, '');
    _zoomReset();
    _attachZoomListeners();
    _scheduleHideHint();
    _scheduleHideNav();

    const con = document.getElementById('modal-img-container');
    if (con) {
        con._showNav = () => _scheduleHideNav();
        con.addEventListener('click', con._showNav);
        con.addEventListener('touchstart', con._showNav, { passive: true });
    }
}

function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    const img = document.getElementById('modal-image');
    if (img) img.src = '';
    _detachZoomListeners();
    _zoomReset();
    clearTimeout(_z.hintTimer);
    const hint = document.getElementById('modal-zoom-hint');
    if (hint) hint.classList.remove('hidden');
    if (history.state?.pdsModal === 'photo') history.back();
}
window.closePhotoModal = closePhotoModal;

function _closePhotoModalFromBack() {
    const modal = document.getElementById('photo-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    const img = document.getElementById('modal-image');
    if (img) img.src = '';
    _detachZoomListeners();
    _zoomReset();
    clearTimeout(_z.hintTimer);
    clearTimeout(_navHideTimer);
    const hint = document.getElementById('modal-zoom-hint');
    if (hint) hint.classList.remove('hidden');
    const nav = document.querySelector('.modal-nav-row');
    if (nav) nav.classList.remove('hidden');
    const con = document.getElementById('modal-img-container');
    if (con?._showNav) {
        con.removeEventListener('click', con._showNav);
        con.removeEventListener('touchstart', con._showNav);
    }
}

window.addEventListener('popstate', () => {
    if (document.getElementById('photo-modal')?.classList.contains('open')) {
        _closePhotoModalFromBack();
    }
});

function closePhotoModalOnOverlay(e) {
    if (e.target === document.getElementById('photo-modal')) closePhotoModal();
}
window.closePhotoModalOnOverlay = closePhotoModalOnOverlay;


// ── MODAL CONTENT BUILDERS — badge reaksi angka final ─────
function _buildReactionBadges(reaksi) {
    return Object.entries(reaksi || {})
        .filter(([, c]) => c > 0)
        .map(([e, c]) => `<span class="modal-react-badge" style="cursor:default">${e} ${c}</span>`)
        .join('');
}

function buildAdminModalInfo(photo) {
    const badges = _buildReactionBadges(photo.reaksi);
    return `
        <div class="modal-info-left">
            <div class="modal-info-title">${escHtml(photo.title || '')}</div>
            <div class="modal-info-sub">${escHtml(photo.category || '')}</div>
        </div>
        <div class="modal-info-right">
            ${badges ? `<div class="modal-react-badges">${badges}</div>` : ''}
        </div>`;
}

function buildUserModalInfo(photo) {
    const badges = _buildReactionBadges(photo.reaksi);
    return `
        <div class="modal-info-left">
            <div class="modal-info-title">${escHtml(photo.title || '')}</div>
            <div class="modal-info-sub">
                <span class="modal-info-user">${escHtml(photo.username || 'Anonim')}</span>
                <span class="modal-info-time">${formatTimeAgo(photo.created_at)}</span>
                <span class="modal-info-views">👁 ${photo.views_count || 0}</span>
            </div>
        </div>
        <div class="modal-info-right">
            <span class="modal-like-btn" style="cursor:default">❤️ <span>${photo.likes_count || 0}</span></span>
            ${badges ? `<div class="modal-react-badges">${badges}</div>` : ''}
        </div>`;
}

function updateNavButtons() {
    const p = document.getElementById('modal-prev'), n = document.getElementById('modal-next');
    if (p) p.style.visibility = currentModalPhotoIndex > 0 ? 'visible' : 'hidden';
    if (n) n.style.visibility = currentModalPhotoIndex < currentModalPhotoList.length - 1 ? 'visible' : 'hidden';
}

// Transisi slide antar foto — dipertahankan dari versi live
function _setModal(photo, dir = 0) {
    const con  = document.getElementById('modal-img-container');
    const img  = document.getElementById('modal-image');
    const info = document.getElementById('modal-info');
    if (!img || !con) return;

    if (dir !== 0 && img.src) {
        const outX = dir < 0 ? '40px' : '-40px';
        img.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        img.style.opacity    = '0';
        img.style.transform  = `translateX(${outX})`;
    }

    con.classList.add('img-loading');

    setTimeout(() => {
        const url = (currentModalType === 'admin' ? photo.photo_url : photo.image_url) || '';
        img.style.transition = 'none';
        img.style.opacity    = '0';
        img.style.transform  = dir !== 0 ? `translateX(${dir > 0 ? '40px' : '-40px'})` : 'translateX(0)';

        img.onload = () => {
            con.classList.remove('img-loading');
            img.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
            img.style.opacity    = '1';
            img.style.transform  = 'translateX(0)';
        };
        img.onerror = () => {
            con.classList.remove('img-loading');
            img.style.opacity = '1';
        };
        img.src = url;
    }, dir !== 0 ? 160 : 0);

    if (info) info.innerHTML = currentModalType === 'admin' ? buildAdminModalInfo(photo) : buildUserModalInfo(photo);
}

function openAdminModal(photoId) {
    const photo = adminPhotos.find(p => p.id === photoId);
    if (!photo) return;
    currentModalPhotoList  = adminPhotos;
    currentModalPhotoIndex = adminPhotos.findIndex(p => p.id === photoId);
    currentModalType       = 'admin';
    _setModal(photo);
    openPhotoModal();
    updateNavButtons();
}
window.openAdminModal = openAdminModal;

function openUserModal(photoId) {
    const photo = userPhotos.find(p => p.id === photoId);
    if (!photo) return;
    currentModalPhotoList  = userPhotos;
    currentModalPhotoIndex = userPhotos.findIndex(p => p.id === photoId);
    currentModalType       = 'user';
    _setModal(photo);
    openPhotoModal();
    updateNavButtons();
}
window.openUserModal = openUserModal;

function navigatePhoto(dir) {
    const newIdx = currentModalPhotoIndex + dir;
    if (newIdx < 0 || newIdx >= currentModalPhotoList.length) return;
    currentModalPhotoIndex = newIdx;
    const photo = currentModalPhotoList[newIdx];
    if (!photo) return;
    _zoomReset();
    _setModal(photo, dir);
    updateNavButtons();
    _scheduleHideNav();
}
window.navigatePhoto = navigatePhoto;


// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    renderSkeleton(document.getElementById('admin-photo-grid'), 6);
    renderSkeleton(document.getElementById('user-photo-grid'), 4);
    await _ensureGalleryLoaded();
    loadAdminGallery();
    loadUserGallery();
    setupAdminFilters();
    setupUserFilters();
    updateAdminJurusanCounts();
});


// ── LOAD & RENDER ─────────────────────────────────────────
async function _ensureGalleryLoaded() {
    if (_galleryCache) return _galleryCache;
    _galleryCache = await loadGallery();
    return _galleryCache;
}

function loadAdminGallery(category = 'all', jurusan = 'all') {
    const all = _galleryCache?.admin || [];
    adminPhotos = all.filter(p =>
        (category === 'all' || p.category === category) &&
        (jurusan  === 'all' || p.jurusan  === jurusan)
    );
    currentAdminPage = 1;
    renderAdminGallery();
}

function loadUserGallery(category = 'all') {
    const all = _galleryCache?.user || [];
    userPhotos = category === 'all' ? all.slice() : all.filter(p => p.category === category);
    currentUserPage = 1;
    renderUserGallery();
}

function renderSkeleton(grid, n) {
    if (!grid) return;
    grid.innerHTML = Array(n).fill(`
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden;animation:shimmer 1.4s infinite">
            <div style="aspect-ratio:4/3;background:var(--bg-hover)"></div>
            <div style="padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px">
                <div style="height:9px;width:70%;background:var(--bg-hover);border-radius:2px"></div>
                <div style="height:8px;width:40%;background:var(--bg-hover);border-radius:2px"></div>
            </div>
        </div>`).join('');
}

function _imgEl(src, alt, index = 0) {
    const isWebp = src && src.toLowerCase().includes('.webp');
    if (isWebp && !isWebPSupported()) {
        return `<div class="img-placeholder img-no-webp" title="${escHtml(alt)}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Format tidak didukung</span>
        </div>`;
    }
    // Cuma beberapa foto pertama yang eager (buat LCP) — sisanya lazy,
    // dulu semua foto (bisa puluhan, rata-rata ratusan KB) ditarik sekaligus walau belum keliatan di layar.
    const loadingAttr = index < 4 ? 'eager' : 'lazy';
    return `<img src="${escHtml(src)}" alt="${escHtml(alt)}"
                 loading="${loadingAttr}"
                 decoding="async"
                 onload="resizeGridItem(this.closest('.photo-item'))"
                 onerror="this.parentElement.classList.add('img-error');resizeGridItem(this.closest('.photo-item'));this.remove()">`;
}

function buildBadges(reaksi) {
    return Object.entries(reaksi || {}).filter(([,c]) => c > 0)
        .map(([e, c]) => `<span class="reaction-badge" style="cursor:default">${e} ${c}</span>`).join('');
}


// ════════════════════════════════
// GRID MASONRY RESIZE — dipertahankan dari versi live
// ════════════════════════════════
function resizeGridItem(item) {
    if (!item) return;
    const grid = item.closest('.photo-grid');
    if (!grid) return;
    const rowH = parseInt(getComputedStyle(grid).gridAutoRows) || 8;
    item.style.gridRowEnd = '';
    const h = item.getBoundingClientRect().height;
    if (h > 0) item.style.gridRowEnd = `span ${Math.ceil(h / rowH)}`;
}

function resizeAllGridItems(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.querySelectorAll('.photo-item').forEach(item => {
        const img = item.querySelector('img');
        if (img && img.complete && img.naturalHeight > 0) resizeGridItem(item);
    });
    [100, 400, 900, 1800].forEach(delay => {
        setTimeout(() => {
            grid.querySelectorAll('.photo-item').forEach(item => resizeGridItem(item));
        }, delay);
    });
}


function renderAdminGallery() {
    const grid = document.getElementById('admin-photo-grid');
    if (!grid) return;
    const toShow = adminPhotos.slice(0, currentAdminPage * PER_PAGE);

    if (!toShow.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Belum ada foto untuk filter ini.</div>`;
        updateLoadMore('load-more-admin', 0, 1);
        return;
    }

    grid.innerHTML = toShow.map((photo, i) => `
        <div class="photo-item">
            <div class="photo-img-wrap" onclick="openAdminModal(${photo.id})">
                ${_imgEl(photo.photo_url, photo.title, i)}
                ${photo.category ? `<span class="photo-cat-badge">${escHtml(photo.category)}</span>` : ''}
            </div>
            <div class="photo-info">
                <div class="photo-info-main" onclick="openAdminModal(${photo.id})" style="cursor:pointer">
                    <div class="photo-info-title">${escHtml(photo.title || '')}</div>
                </div>
                <div class="photo-actions-row">
                    <div class="photo-reactions" id="reactions-admin-${photo.id}">
                        ${buildBadges(photo.reaksi || {})}
                    </div>
                </div>
            </div>
        </div>`).join('');

    updateLoadMore('load-more-admin', adminPhotos.length, currentAdminPage);
    resizeAllGridItems('admin-photo-grid');
}

function renderUserGallery() {
    const grid = document.getElementById('user-photo-grid');
    if (!grid) return;
    const toShow = userPhotos.slice(0, currentUserPage * PER_PAGE);

    if (!toShow.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted);font-size:13px">Belum ada foto kiriman untuk filter ini.</div>`;
        updateLoadMore('load-more-user', 0, 1);
        return;
    }

    grid.innerHTML = toShow.map((photo, i) => `
        <div class="photo-item">
            <div class="photo-img-wrap" onclick="openUserModal(${photo.id})">
                ${_imgEl(photo.image_url, photo.title, i)}
                ${photo.category ? `<span class="photo-cat-badge">${escHtml(photo.category)}</span>` : ''}
            </div>
            <div class="photo-info">
                <div class="photo-info-main" onclick="openUserModal(${photo.id})" style="cursor:pointer">
                    <div class="photo-info-title">${escHtml(photo.title || '')}</div>
                    <div class="photo-info-meta">
                        <span class="photo-username">${escHtml(photo.username || 'Anonim')}</span>
                        <span class="photo-time">${formatTimeAgo(photo.created_at)}</span>
                    </div>
                </div>
                <div class="photo-actions-row">
                    <span class="photo-like-btn" style="cursor:default">❤️ <span>${photo.likes_count || 0}</span></span>
                    <div class="photo-reactions" id="reactions-user-${photo.id}">
                        ${buildBadges(photo.reaksi || {})}
                    </div>
                </div>
            </div>
        </div>`).join('');

    updateLoadMore('load-more-user', userPhotos.length, currentUserPage);
    resizeAllGridItems('user-photo-grid');
}

function updateLoadMore(btnId, total, page) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.style.display = total > page * PER_PAGE ? 'block' : 'none';
}
window.loadMoreAdmin = () => { currentAdminPage++; renderAdminGallery(); };
window.loadMoreUser  = () => { currentUserPage++;  renderUserGallery(); };


// ── FILTER ────────────────────────────────────────────────
function setupAdminFilters() {
    const catBtns = document.querySelectorAll('.admin-category-filter-btn');
    catBtns.forEach(btn => btn.addEventListener('click', function () {
        catBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        currentAdminCategory = this.dataset.category;
        loadAdminGallery(currentAdminCategory, currentAdminJurusan);
    }));

    const cards = document.querySelectorAll('#admin-jurusan-filter-container .jurusan-card');
    cards.forEach(card => card.addEventListener('click', function () {
        cards.forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        currentAdminJurusan = this.dataset.jurusan;
        loadAdminGallery(currentAdminCategory, currentAdminJurusan);
    }));
}

function setupUserFilters() {
    const btns = document.querySelectorAll('.user-category-filter-btn');
    btns.forEach(btn => btn.addEventListener('click', function () {
        btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        currentUserCategory = this.dataset.category;
        loadUserGallery(currentUserCategory);
    }));
}


// ── JURUSAN COUNT ─────────────────────────────────────────
function updateAdminJurusanCounts() {
    const all = _galleryCache?.admin || [];
    const counts = { _total: all.length };
    JURUSAN_LIST.forEach(j => { counts[j] = all.filter(p => p.jurusan === j).length; });

    JURUSAN_LIST.forEach(j => {
        const el = document.getElementById(`admin-count-${j.toLowerCase()}`);
        if (el) el.textContent = `${counts[j] ?? 0} foto`;
    });
    const allEl = document.getElementById('admin-count-all');
    if (allEl) allEl.textContent = `${counts._total ?? 0} foto`;
}


// ── KIRIM FOTO — handoff WA/email (lihat submit.js) ────────
let _submitFotoFile = null;

function openSubmitFotoModal() {
    document.getElementById('submit-foto-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}
window.openSubmitFotoModal = openSubmitFotoModal;

function closeSubmitFotoModal() {
    document.getElementById('submit-foto-modal')?.classList.remove('open');
    document.body.style.overflow = '';
    _submitFotoFile = null;
    const preview = document.getElementById('submit-foto-preview');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    ['submit-foto-title', 'submit-foto-nama'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const fileInput = document.getElementById('submit-foto-file');
    if (fileInput) fileInput.value = '';
    const da = document.getElementById('submit-drag-drop-area');
    if (da) da.style.display = '';
}
window.closeSubmitFotoModal = closeSubmitFotoModal;

document.addEventListener('DOMContentLoaded', () => {
    const selectBtn = document.getElementById('submit-select-file-btn');
    const fileInput = document.getElementById('submit-foto-file');
    const dropArea  = document.getElementById('submit-drag-drop-area');
    const preview   = document.getElementById('submit-foto-preview');
    if (!selectBtn || !fileInput) return;

    const handleFile = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        _submitFotoFile = file;
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        dropArea.style.display = 'none';
    };

    selectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

    ['dragover', 'dragleave', 'drop'].forEach(evt => dropArea.addEventListener(evt, e => e.preventDefault()));
    dropArea.addEventListener('dragover',  () => dropArea.classList.add('drag-over'));
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', (e) => {
        dropArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) { fileInput.files = e.dataTransfer.files; handleFile(file); }
    });
});

async function handleSubmitFoto() {
    const title = document.getElementById('submit-foto-title').value.trim();
    const nama  = document.getElementById('submit-foto-nama').value.trim();

    if (!_submitFotoFile) { showToast('Pilih foto dulu ya'); return; }
    if (!title)           { showToast('Isi judul fotonya dulu'); return; }

    // Form cuma ditutup & dibersihkan kalau kiriman beneran lanjut ke WA/email —
    // dulu modal ketutup juga pas user pencet Batal atau config belum disetel,
    // jadi foto+judul+nama yang udah diisi ilang padahal belum terkirim ke mana pun.
    const sent = await submitPhotoHandoff(_submitFotoFile, title, nama);
    if (sent) closeSubmitFotoModal();
}
window.handleSubmitFoto = handleSubmitFoto;


// ── HELPERS ───────────────────────────────────────────────
// escHtml(), formatTimeAgo(), showToast() tersedia global dari utils.js.
