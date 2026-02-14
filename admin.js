// =====================
// SUPABASE CLIENT
// =====================
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================
// UTILITY
// =====================
function normPhone(s) {
    return String(s || '').replace(/[\s\-\(\)\+\.]/g, '');
}

function escHtml(str) {
    return String(str || '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
}

function showAddErr(msg) {
    const el = document.getElementById('add-error');
    if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 5000); }
}

function showAddSuccess(msg) {
    const el = document.getElementById('add-success');
    if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 4000); }
}

// =====================
// BUILDING DATA
// =====================
let allUnitsFlat = [];

async function loadBuildingData() {
    const res  = await fetch('data.json');
    const data = await res.json();

    allUnitsFlat = data.buildings.flatMap((b, bi) =>
        b.floors.flatMap(f =>
            f.units.map(u => ({
                id:           u.id,
                unit_number:  u.unit_number,
                buildingName: b.name,
                buildingId:   bi,
                floorNumber:  f.floor_number,
            }))
        )
    );
}

// =====================
// INIT
// =====================
async function initAdmin() {
    await loadBuildingData();

    const { data: { user } } = await db.auth.getUser();
    if (user && user.email === ADMIN_EMAIL) {
        showDashboard();
    } else {
        showLoginForm();
    }
}

// =====================
// LOGIN
// =====================
function showLoginForm() {
    document.getElementById('admin-login').style.display    = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('admin-logout-btn').style.display = 'none';
    setTimeout(() => document.getElementById('admin-email')?.focus(), 60);
}

async function adminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const pw    = document.getElementById('admin-pw').value;
    const btn   = document.getElementById('admin-login-btn');
    const err   = document.getElementById('admin-login-error');

    if (!email || !pw) { err.textContent = 'Please enter email and password.'; return; }

    btn.disabled = true; btn.textContent = 'Logging in…';

    const { data, error } = await db.auth.signInWithPassword({ email, password: pw });

    if (error || !data.user) {
        err.textContent = 'Invalid credentials.';
        btn.disabled = false; btn.textContent = 'Login';
        return;
    }

    if (data.user.email !== ADMIN_EMAIL) {
        err.textContent = 'This account does not have admin access.';
        await db.auth.signOut();
        btn.disabled = false; btn.textContent = 'Login';
        return;
    }

    showDashboard();
}

async function adminLogout() {
    await db.auth.signOut();
    showLoginForm();
}

// =====================
// DASHBOARD
// =====================
async function showDashboard() {
    document.getElementById('admin-login').style.display     = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    document.getElementById('admin-logout-btn').style.display = 'inline-flex';

    // Populate unit selector
    const select = document.getElementById('add-unit-select');
    select.innerHTML = '<option value="">Select a unit…</option>' +
        allUnitsFlat.map(u =>
            `<option value="${u.id}">${escHtml(u.buildingName)} — F${u.floorNumber} — Unit ${escHtml(u.unit_number)}</option>`
        ).join('');

    await loadTenants();
}

// =====================
// TENANT LIST
// =====================
async function loadTenants() {
    const { data: tenants, error } = await db
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        document.getElementById('tenants-tbody').innerHTML =
            `<tr><td colspan="5" class="admin-empty">Error loading tenants: ${escHtml(error.message)}</td></tr>`;
        return;
    }

    // Also fetch profiles to know who has created an account
    const { data: profiles } = await db.from('profiles').select('mobile');
    const activeMobiles = new Set((profiles || []).map(p => p.mobile));

    const tbody = document.getElementById('tenants-tbody');

    if (!tenants || tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No tenants registered yet.</td></tr>';
        return;
    }

    tbody.innerHTML = tenants.map(t => {
        const unit = allUnitsFlat.find(u => u.id === t.unit_id);
        const unitLabel = unit
            ? `${escHtml(unit.buildingName)} F${unit.floorNumber} — Unit ${escHtml(unit.unit_number)}`
            : `Unit ID ${t.unit_id}`;
        const hasAccount = activeMobiles.has(normPhone(t.mobile));
        const accountBadge = hasAccount
            ? `<span class="admin-badge active">Active</span>`
            : `<span class="admin-badge pending">Pending</span>`;

        return `
            <tr>
                <td>${escHtml(t.mobile)}</td>
                <td>${unitLabel}</td>
                <td>${new Date(t.created_at).toLocaleDateString()}</td>
                <td>${accountBadge}</td>
                <td>
                    <button class="admin-delete-btn"
                        onclick="deleteTenant('${escHtml(t.id)}', '${escHtml(t.mobile)}')">
                        Remove
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// =====================
// ADD TENANT
// =====================
async function addTenant() {
    const rawMobile = document.getElementById('add-mobile').value.trim();
    const unitId    = parseInt(document.getElementById('add-unit-select').value, 10);

    if (!rawMobile)     { showAddErr('Please enter a mobile number.'); return; }
    if (!unitId)        { showAddErr('Please select a unit.'); return; }

    const mobile = normPhone(rawMobile);
    if (mobile.length < 7) { showAddErr('Mobile number seems too short.'); return; }

    const btn = document.getElementById('add-tenant-btn');
    btn.disabled = true;

    const { error } = await db.from('tenants').insert({ mobile, unit_id: unitId });

    btn.disabled = false;

    if (error) {
        showAddErr(
            error.message.includes('unique') || error.message.includes('duplicate')
                ? 'This mobile number is already registered.'
                : error.message
        );
        return;
    }

    document.getElementById('add-mobile').value = '';
    document.getElementById('add-unit-select').value = '';
    showAddSuccess(`Tenant ${rawMobile} registered successfully.`);
    await loadTenants();
}

// =====================
// DELETE TENANT
// =====================
async function deleteTenant(id, mobile) {
    if (!confirm(`Remove tenant ${mobile}?\n\nThis will not delete their login account, only their unit registration.`)) return;

    const { error } = await db.from('tenants').delete().eq('id', id);
    if (error) { showAddErr(error.message); return; }
    await loadTenants();
}

// =====================
// START
// =====================
initAdmin();
