// =====================
// SUPABASE CLIENT
// =====================
let db = null;
try {
    if (window.supabase) {
        const { createClient } = window.supabase;
        db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn('Supabase client init failed:', e);
}

// =====================
// UTILITY
// =====================
function countStatuses(units) {
    const counts = { available: 0, taken: 0, reserved: 0 };
    units.forEach(u => counts[u.status]++);
    return counts;
}

function renderLegend(counts) {
    return `
        <div class="legend-item">
            <span class="legend-dot available"></span>
            <span>Available: <span class="legend-count">${counts.available}</span></span>
        </div>
        <div class="legend-item">
            <span class="legend-dot taken"></span>
            <span>Taken: <span class="legend-count">${counts.taken}</span></span>
        </div>
        <div class="legend-item">
            <span class="legend-dot reserved"></span>
            <span>Reserved: <span class="legend-count">${counts.reserved}</span></span>
        </div>
    `;
}

function getAllUnits(building) {
    return building.floors.flatMap(f => f.units);
}

function normPhone(s) {
    return String(s || '').replace(/[\s\-\(\)\+\.]/g, '');
}

function mobileToEmail(mobile) {
    return normPhone(mobile) + '@tenant.bw';
}

function escHtml(str) {
    return String(str || '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
}

// =====================
// LANDING PAGE
// =====================
function initLandingPage(data) {
    const grid = document.getElementById('buildings-grid');
    if (!grid) return;

    grid.innerHTML = data.buildings.map((building, i) => {
        const allUnits = getAllUnits(building);
        const counts = countStatuses(allUnits);
        const totalUnits = allUnits.length;
        return `
            <a href="building.html?id=${i}" class="building-card">
                <h3>${building.name}</h3>
                <p class="building-subtitle">${building.floors.length} Floors &middot; ${totalUnits} Units</p>
                <div class="legend">${renderLegend(counts)}</div>
            </a>
        `;
    }).join('');
}

// =====================
// BUILDING / FLOOR VIEW
// =====================
let allUnitsMap = {};

async function initBuildingPage(data) {
    const diagram = document.getElementById('building-diagram');
    if (!diagram) return;

    const params = new URLSearchParams(window.location.search);
    const buildingId = parseInt(params.get('id'), 10);
    const building = data.buildings[buildingId];

    if (!building) {
        diagram.innerHTML = '<p>Building not found.</p>';
        return;
    }

    document.getElementById('building-name').textContent = building.name;
    document.title = `${building.name} — Bayport West`;

    const allUnits = getAllUnits(building);
    const allUnitIds = allUnits.map(u => u.id);

    // Fetch Supabase data: unit details + registered tenants (graceful fallback if unavailable)
    let detailsMap = {};
    let registeredUnits = new Set();
    if (db) {
        try {
            const [detailsRes, tenantsRes] = await Promise.all([
                db.from('unit_details').select('*').in('unit_id', allUnitIds),
                db.from('tenants').select('unit_id').in('unit_id', allUnitIds)
            ]);
            (detailsRes.data || []).forEach(d => { detailsMap[d.unit_id] = d; });
            registeredUnits = new Set((tenantsRes.data || []).map(t => t.unit_id));
        } catch (e) {
            console.warn('Supabase queries failed, using local data only:', e);
        }
    }

    allUnits.forEach(u => {
        const d = detailsMap[u.id];
        if (d) {
            if (d.owner != null) u.owner = d.owner;
            if (d.rent_price != null) u.rent_price = d.rent_price;
            if (d.unit_type) u.unit_type = d.unit_type;
            if (d.photos && d.photos.length) u.photos = d.photos;
            if (d.video) u.video = d.video;
        }
        u.hasTenant = registeredUnits.has(u.id);
        allUnitsMap[u.id] = u;
    });

    // Building-wide legend
    document.getElementById('building-legend').innerHTML = renderLegend(countStatuses(allUnits));

    // Render floors (top first)
    const floorsReversed = [...building.floors].reverse();
    let html = `<div class="bldg-rooftop">${building.name}</div>`;

    html += floorsReversed.map(floor => {
        const fc = countStatuses(floor.units);
        const unitsHtml = floor.units.map(unit => `
            <div class="bldg-unit ${unit.status}" data-uid="${unit.id}" title="Unit ${unit.unit_number} — ${unit.status}">
                ${unit.unit_number}
            </div>
        `).join('');

        return `
            <div class="bldg-floor">
                <div class="bldg-floor-avail">
                    <div class="fav available">&#9679; ${fc.available}</div>
                    <div class="fav taken">&#9679; ${fc.taken}</div>
                    <div class="fav reserved">&#9679; ${fc.reserved}</div>
                </div>
                <div class="bldg-floor-label">F${floor.floor_number}</div>
                <div class="bldg-floor-units">${unitsHtml}</div>
            </div>
        `;
    }).join('');

    html += `<div class="bldg-ground">GROUND</div>`;
    diagram.innerHTML = html;

    diagram.addEventListener('click', e => {
        const unitEl = e.target.closest('.bldg-unit');
        if (!unitEl) return;
        openUnitModal(allUnitsMap[parseInt(unitEl.dataset.uid, 10)]);
    });
}

// =====================
// MODAL ORCHESTRATION
// =====================
let currentUnit = null;
let pendingMobile = null;

async function openUnitModal(unit) {
    if (!unit) return;
    currentUnit = unit;
    pendingMobile = null;

    document.getElementById('unit-modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Check for an active Supabase session for this unit
    let authedForUnit = false;
    if (db) {
        try {
            const { data: { user } } = await db.auth.getUser();
            authedForUnit = !!(user && Number(user.user_metadata?.unit_id) === unit.id);
        } catch (e) { /* no session */ }
    }
    renderModalState(authedForUnit ? 'edit' : 'view');
}

function closeUnitModal() {
    document.getElementById('unit-modal').classList.remove('open');
    document.body.style.overflow = '';
    currentUnit = null;
    pendingMobile = null;
}

function renderModalState(state) {
    const content = document.getElementById('unit-modal-content');
    const builders = {
        view: buildViewHTML,
        login: buildLoginHTML,
        'set-password': buildSetPasswordHTML,
        password: buildPasswordHTML,
        edit: buildEditHTML,
    };
    content.innerHTML = (builders[state] || buildViewHTML)();
    setTimeout(() => content.querySelector('input')?.focus(), 60);
}

// ── View ──────────────────────────────────────────────────────
function buildViewHTML() {
    const u = currentUnit;
    const statusLabels = { available: 'Available', taken: 'Taken', reserved: 'Reserved' };
    const label = statusLabels[u.status] || u.status;

    const typeRow = u.unit_type ? `<div class="umd-row"><span class="umd-label">Type</span><span class="umd-value">${escHtml(u.unit_type)}</span></div>` : '';
    const priceRow = u.rent_price ? `<div class="umd-row"><span class="umd-label">Asking Rent</span><span class="umd-value umd-price">₱${u.rent_price.toLocaleString('en-PH')}/mo</span></div>` : '';
    const ownerRow = u.owner ? `<div class="umd-row"><span class="umd-label">Owner</span><span class="umd-value">${escHtml(u.owner)}</span></div>` : '';

    const photosHtml = u.photos && u.photos.length
        ? `<div class="umd-section-title">Photos</div>
           <div class="umd-photos">${u.photos.map((p, i) => `<img src="${escHtml(p)}" alt="Photo ${i + 1}" loading="lazy" onclick="openLightboxPhoto('${escHtml(p)}')">`).join('')}</div>`
        : '';

    const videoHtml = u.video
        ? `<div class="umd-section-title">Video</div>
           <div class="umd-video"><video src="${escHtml(u.video)}" controls onclick="event.preventDefault(); openLightboxVideo('${escHtml(u.video)}')"></video></div>`
        : '';

    const editBtn = u.hasTenant
        ? `<button class="umd-edit-btn" onclick="renderModalState('login')">Login to Edit</button>`
        : '';

    return `
        <div class="umd-header">
            <div class="umd-unit-num">Unit ${escHtml(u.unit_number)}</div>
            <span class="umd-badge ${u.status}">${label}</span>
        </div>
        <div class="umd-details">${typeRow}${priceRow}${ownerRow}</div>
        ${photosHtml}${videoHtml}
        ${editBtn}
    `;
}

// ── Login (mobile entry) ──────────────────────────────────────
function buildLoginHTML() {
    return `
        <button class="umd-back-btn" onclick="renderModalState('view')">&#8592; Back</button>
        <div class="umd-form-title">Login to edit Unit ${escHtml(currentUnit.unit_number)}</div>
        <p class="umd-form-sub">Enter the mobile number registered for this unit.</p>
        <div class="umd-form-group">
            <label class="umd-field-label">Mobile Number</label>
            <input type="tel" id="f-mobile" class="umd-input" placeholder="e.g. 501-555-1001"
                   onkeydown="if(event.key==='Enter') submitMobile()">
        </div>
        <div class="umd-form-error" id="login-error"></div>
        <button class="umd-submit-btn" onclick="submitMobile()">Continue &#8594;</button>
    `;
}

async function submitMobile() {
    const val = document.getElementById('f-mobile').value.trim();
    if (!val) { showErr('login-error', 'Please enter your mobile number.'); return; }

    const btn = document.querySelector('#unit-modal-content .umd-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    if (!db) { showErr('login-error', 'Service unavailable. Please try again later.'); btn.disabled = false; btn.textContent = 'Continue →'; return; }

    // Verify mobile is registered for THIS unit in Supabase
    const { data: tenant } = await db.from('tenants')
        .select('unit_id')
        .eq('mobile', normPhone(val))
        .eq('unit_id', currentUnit.id)
        .maybeSingle();

    if (!tenant) {
        showErr('login-error', 'This number is not registered for this unit.');
        btn.disabled = false;
        btn.textContent = 'Continue →';
        return;
    }

    // Check if this mobile has already created an account (profile exists)
    const { data: profile } = await db.from('profiles')
        .select('id')
        .eq('mobile', normPhone(val))
        .maybeSingle();

    pendingMobile = val;
    renderModalState(profile ? 'password' : 'set-password');
}

// ── Set password (first login) ────────────────────────────────
function buildSetPasswordHTML() {
    return `
        <button class="umd-back-btn" onclick="renderModalState('login')">&#8592; Back</button>
        <div class="umd-form-title">Create your password</div>
        <p class="umd-form-sub">First time logging in — set a secure password for your account.</p>
        <div class="umd-form-group">
            <label class="umd-field-label">New Password</label>
            <input type="password" id="f-pw1" class="umd-input" placeholder="At least 6 characters"
                   onkeydown="if(event.key==='Enter') document.getElementById('f-pw2').focus()">
        </div>
        <div class="umd-form-group">
            <label class="umd-field-label">Confirm Password</label>
            <input type="password" id="f-pw2" class="umd-input" placeholder="Repeat password"
                   onkeydown="if(event.key==='Enter') submitSetPassword()">
        </div>
        <div class="umd-form-error" id="setpw-error"></div>
        <button class="umd-submit-btn" onclick="submitSetPassword()">Set Password</button>
    `;
}

async function submitSetPassword() {
    const pw1 = document.getElementById('f-pw1').value;
    const pw2 = document.getElementById('f-pw2').value;
    if (pw1.length < 6) { showErr('setpw-error', 'Password must be at least 6 characters.'); return; }
    if (pw1 !== pw2) { showErr('setpw-error', 'Passwords do not match.'); return; }

    const btn = document.querySelector('#unit-modal-content .umd-submit-btn');
    btn.disabled = true; btn.textContent = 'Creating account...';

    const { error } = await db.auth.signUp({
        email: mobileToEmail(pendingMobile),
        password: pw1,
        options: { data: { unit_id: currentUnit.id, mobile: normPhone(pendingMobile) } }
    });

    if (error) {
        showErr('setpw-error', error.message);
        btn.disabled = false; btn.textContent = 'Set Password';
        return;
    }
    renderModalState('edit');
}

// ── Password (returning login) ────────────────────────────────
function buildPasswordHTML() {
    return `
        <button class="umd-back-btn" onclick="renderModalState('login')">&#8592; Back</button>
        <div class="umd-form-title">Welcome back</div>
        <p class="umd-form-sub">Enter your password to edit Unit ${escHtml(currentUnit.unit_number)}.</p>
        <div class="umd-form-group">
            <label class="umd-field-label">Password</label>
            <input type="password" id="f-pw" class="umd-input" placeholder="Your password"
                   onkeydown="if(event.key==='Enter') submitPassword()">
        </div>
        <div class="umd-form-error" id="pw-error"></div>
        <button class="umd-submit-btn" onclick="submitPassword()">Login</button>
    `;
}

async function submitPassword() {
    const pw = document.getElementById('f-pw').value;
    const btn = document.querySelector('#unit-modal-content .umd-submit-btn');
    btn.disabled = true; btn.textContent = 'Logging in...';

    const { error } = await db.auth.signInWithPassword({
        email: mobileToEmail(pendingMobile),
        password: pw
    });

    if (error) {
        showErr('pw-error', 'Incorrect password.');
        btn.disabled = false; btn.textContent = 'Login';
        return;
    }
    renderModalState('edit');
}

// ── Edit ──────────────────────────────────────────────────────
function buildEditHTML() {
    const u = currentUnit;
    const photos = Array.isArray(u.photos) ? u.photos : [];
    const types = ['Studio', '1-Bedroom', '2-Bedroom', '2-Bedroom + Den', 'Penthouse'];

    const photoRows = photos.map(p => `
        <div class="umd-photo-row">
            <img src="${escHtml(p)}" class="umd-photo-thumb" alt="">
            <input type="url" class="umd-input umd-photo-input" value="${escHtml(p)}" readonly>
            <button class="umd-remove-photo" onclick="removePhotoRow(this)" title="Remove">&#10005;</button>
        </div>
    `).join('');

    return `
        <div class="umd-edit-header">
            <div class="umd-unit-num">Edit Unit ${escHtml(u.unit_number)}</div>
            <button class="umd-logout-btn" onclick="logoutUnit()">Logout</button>
        </div>

        <div class="umd-form-group">
            <label class="umd-field-label">Owner Name</label>
            <input type="text" id="e-owner" class="umd-input" value="${escHtml(u.owner || '')}" placeholder="Your full name">
        </div>
        <div class="umd-form-group">
            <label class="umd-field-label">Asking Rent ($/month)</label>
            <input type="number" id="e-rent" class="umd-input" value="${u.rent_price || ''}" placeholder="e.g. 2500" min="0">
        </div>
        <div class="umd-form-group">
            <label class="umd-field-label">Unit Type</label>
            <select id="e-type" class="umd-input umd-select">
                ${types.map(t => `<option value="${t}"${u.unit_type === t ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
        </div>

        <div class="umd-form-group">
            <label class="umd-field-label">Photos</label>
            <div id="e-photos">${photoRows}</div>
            <label class="umd-upload-label" for="e-photo-file">
                <span class="umd-upload-icon">&#8679;</span> Upload Photos
                <input type="file" id="e-photo-file" accept="image/*" multiple
                       onchange="handlePhotoUpload(this)" style="display:none">
            </label>
            <div class="umd-upload-progress" id="upload-progress"></div>
        </div>

        <div class="umd-form-group">
            <label class="umd-field-label">Video <span class="umd-field-hint">(optional, max 100 MB)</span></label>
            <input type="hidden" id="e-video" value="${escHtml(u.video || '')}">
            <div id="e-video-preview">${u.video ? `
                <div class="umd-video-row">
                    <video src="${escHtml(u.video)}" class="umd-video-thumb" muted></video>
                    <span class="umd-video-name">Current video</span>
                    <button class="umd-remove-photo" onclick="removeVideo()" title="Remove">&#10005;</button>
                </div>` : ''}
            </div>
            <label class="umd-upload-label" for="e-video-file">
                <span class="umd-upload-icon">&#9654;</span> Upload Video
                <input type="file" id="e-video-file" accept="video/mp4,video/webm,video/quicktime"
                       onchange="handleVideoUpload(this)" style="display:none">
            </label>
            <div class="umd-upload-progress" id="video-upload-progress"></div>
        </div>

        <div class="umd-form-error" id="edit-error"></div>
        <div class="umd-form-actions">
            <button class="umd-cancel-btn" onclick="renderModalState('view')">Cancel</button>
            <button class="umd-save-btn" onclick="saveEdit()">Save Changes</button>
        </div>
    `;
}

async function handlePhotoUpload(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const progress = document.getElementById('upload-progress');
    progress.textContent = `Uploading ${files.length} photo(s)…`;

    const uploaded = [];
    for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${currentUnit.id}/${Date.now()}_${safeName}`;
        const { error } = await db.storage.from('unit-photos').upload(path, file, { upsert: true });
        if (error) { progress.textContent = `Upload error: ${error.message}`; return; }
        const { data } = db.storage.from('unit-photos').getPublicUrl(path);
        uploaded.push(data.publicUrl);
    }

    const container = document.getElementById('e-photos');
    uploaded.forEach(url => {
        const div = document.createElement('div');
        div.className = 'umd-photo-row';
        div.innerHTML = `
            <img src="${escHtml(url)}" class="umd-photo-thumb" alt="">
            <input type="url" class="umd-input umd-photo-input" value="${escHtml(url)}" readonly>
            <button class="umd-remove-photo" onclick="removePhotoRow(this)" title="Remove">&#10005;</button>
        `;
        container.appendChild(div);
    });

    progress.textContent = `${uploaded.length} photo(s) uploaded successfully.`;
    input.value = '';
}

function removePhotoRow(btn) {
    btn.closest('.umd-photo-row').remove();
}

async function handleVideoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const progress = document.getElementById('video-upload-progress');
    const maxSize = 100 * 1024 * 1024; // 100 MB
    if (file.size > maxSize) {
        progress.textContent = 'Video too large. Max size is 100 MB.';
        progress.style.color = '#f87171';
        input.value = '';
        return;
    }

    progress.style.color = '';
    progress.textContent = 'Uploading video… (this may take a moment)';

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${currentUnit.id}/${Date.now()}_${safeName}`;

    const { error } = await db.storage.from('unit-videos').upload(path, file, {
        upsert: true,
        contentType: file.type
    });

    if (error) {
        progress.textContent = `Upload error: ${error.message}`;
        progress.style.color = '#f87171';
        return;
    }

    const { data } = db.storage.from('unit-videos').getPublicUrl(path);
    const publicUrl = data.publicUrl;

    // Set hidden input
    document.getElementById('e-video').value = publicUrl;

    // Show preview
    document.getElementById('e-video-preview').innerHTML = `
        <div class="umd-video-row">
            <video src="${escHtml(publicUrl)}" class="umd-video-thumb" muted></video>
            <span class="umd-video-name">${escHtml(file.name)}</span>
            <button class="umd-remove-photo" onclick="removeVideo()" title="Remove">&#10005;</button>
        </div>
    `;

    progress.textContent = 'Video uploaded successfully!';
    progress.style.color = '#4ade80';
    input.value = '';
}

function removeVideo() {
    document.getElementById('e-video').value = '';
    document.getElementById('e-video-preview').innerHTML = '';
    const progress = document.getElementById('video-upload-progress');
    if (progress) progress.textContent = '';
}

async function saveEdit() {
    const owner = document.getElementById('e-owner').value.trim();
    if (!owner) { showErr('edit-error', 'Owner name is required.'); return; }

    const rentRaw = document.getElementById('e-rent').value;
    const rent = rentRaw ? parseInt(rentRaw, 10) : null;
    const type = document.getElementById('e-type').value;
    const video = document.getElementById('e-video').value.trim() || null;
    const photos = Array.from(document.querySelectorAll('.umd-photo-input'))
        .map(i => i.value.trim()).filter(Boolean);

    const btn = document.querySelector('.umd-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { error } = await db.from('unit_details').upsert({
        unit_id: currentUnit.id,
        owner, rent_price: rent, unit_type: type, photos, video,
        updated_at: new Date().toISOString()
    });

    if (error) {
        showErr('edit-error', error.message);
        btn.disabled = false; btn.textContent = 'Save Changes';
        return;
    }

    Object.assign(currentUnit, { owner, rent_price: rent, unit_type: type, photos, video });
    renderModalState('view');
}

async function logoutUnit() {
    if (db) await db.auth.signOut();
    pendingMobile = null;
    renderModalState('view');
}

// ── Helpers ───────────────────────────────────────────────────
function showErr(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}

// =====================
// INIT
// =====================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const lightbox = document.getElementById('lightbox');
        if (lightbox && lightbox.classList.contains('open')) {
            closeLightbox();
            return;
        }
        const modal = document.getElementById('unit-modal');
        if (modal && modal.classList.contains('open')) closeUnitModal();
    }
});

// =====================
// FULLSCREEN LIGHTBOX
// =====================
function openLightboxPhoto(src) {
    const body = document.getElementById('lightbox-body');
    body.innerHTML = `<img src="${src}" class="lightbox-content" alt="Full-size photo">`;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function openLightboxVideo(src) {
    const body = document.getElementById('lightbox-body');
    body.innerHTML = `<video src="${src}" class="lightbox-content lightbox-video" controls autoplay></video>`;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open');
    // Stop any playing video
    const vid = lb.querySelector('video');
    if (vid) vid.pause();
    document.getElementById('lightbox-body').innerHTML = '';
    // Restore scroll only if the unit modal isn't still open
    const modal = document.getElementById('unit-modal');
    if (!modal || !modal.classList.contains('open')) {
        document.body.style.overflow = '';
    }
}

async function checkSupabase() {
    const el = document.getElementById('db-status');
    if (!el) return;
    if (!db) { el.textContent = '⚠ Supabase client not loaded'; el.style.color = '#f59e0b'; return; }
    try {
        const { error } = await db.from('unit_details').select('unit_id').limit(1);
        if (error) {
            el.textContent = '⚠ DB: ' + error.message;
            el.style.color = '#f87171';
        } else {
            el.textContent = '✓ Supabase connected';
            el.style.color = '#4ade80';
        }
    } catch (e) {
        el.textContent = '✗ Supabase unreachable: ' + e.message;
        el.style.color = '#f87171';
    }
}

fetch('data.json')
    .then(res => {
        if (!res.ok) throw new Error(`data.json HTTP ${res.status}`);
        return res.json();
    })
    .then(async data => {
        initLandingPage(data);
        await initBuildingPage(data);
        checkSupabase();
    })
    .catch(err => {
        console.error('Failed to load data:', err);
        const diagram = document.getElementById('building-diagram');
        if (diagram) diagram.innerHTML = `<p style="color:#f87171;padding:20px">Error: ${err.message}</p>`;
        const nameEl = document.getElementById('building-name');
        if (nameEl) nameEl.textContent = 'Error';
    });
