/* ============================================================
   AI Smart EV Wireless Charging & Smart Parking Management Portal
   Master Application Logic
   Role-based access: User Panel + Admin Panel
   Strict Admin Authentication: johnsamuel.g11@gmail.com / 11112005
   Slot 1 & 2: EV Wireless Charging Bays
   Slot 3: Smart Parking ONLY Bay (No Charging Coil)
   Real-Time Client System Time Engine
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     CONSTANTS & STRICT CREDENTIALS
     ============================================================ */
  const ADMIN_EMAIL = 'johnsamuel.g11@gmail.com';
  const ADMIN_KEY   = '11112005';
  const SESSION_KEY = 'smartev_session';
  const SLOTS_KEY   = 'smartev_slots';
  const LOGS_KEY    = 'smartev_global_logs';

  const DEFAULT_SLOTS = [
    {
      id: 1,
      name: 'Slot 1',
      title: 'SLOT 1 - WIRELESS CHARGING',
      type: 'charging',
      padName: 'Pad A',
      occupied: false,
      evId: null,
      userEmail: null,
      soc: 0,
      targetSoc: 80,
      power: 0,
      priority: 0,
      charging: false,
      departureTime: '18:30',
      departureFormatted: '',
      departureTimestamp: null,
      durationMinutes: 60,
      bookedAt: null
    },
    {
      id: 2,
      name: 'Slot 2',
      title: 'SLOT 2 - WIRELESS CHARGING',
      type: 'charging',
      padName: 'Pad B',
      occupied: false,
      evId: null,
      userEmail: null,
      soc: 0,
      targetSoc: 80,
      power: 0,
      priority: 0,
      charging: false,
      departureTime: '18:30',
      departureFormatted: '',
      departureTimestamp: null,
      durationMinutes: 60,
      bookedAt: null
    },
    {
      id: 3,
      name: 'Slot 3',
      title: 'SLOT 3 - SMART PARKING ONLY',
      type: 'parking_only',
      padName: null,
      occupied: false,
      evId: null,
      userEmail: null,
      soc: 0,
      targetSoc: 0,
      power: 0,
      priority: 0,
      charging: false,
      departureTime: '18:30',
      departureFormatted: '',
      departureTimestamp: null,
      durationMinutes: 60,
      bookedAt: null
    },
  ];

  /* ============================================================
     STATE
     ============================================================ */
  let session    = null;   // { role: 'user'|'admin', email: string }
  let slots      = [];     // mutable copy of slot data
  let simRunning = true;
  let powerChart = null;
  let chartTick  = 0;
  let selectedSlot = null; // currently highlighted slot in booking

  // Track whether navigation has been wired for each panel
  let userNavWired  = false;
  let adminNavWired = false;

  /* ============================================================
     DOM HELPERS
     ============================================================ */
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const toastContainer = $('toastContainer');

  function showToast(msg, type = 'info') {
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="material-icons-round">${icons[type]||'info'}</span><span>${msg}</span>`;
    if (toastContainer) toastContainer.appendChild(t);
    setTimeout(() => {
      t.classList.add('toast-exit');
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  /* ============================================================
     TIME FORMATTING & LIVE CLOCK HELPERS
     ============================================================ */
  function formatClockTime(d) {
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  }

  function formatTimeShort(d) {
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }

  function format24hTime(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatCountdown(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /* ============================================================
     LOCAL STORAGE HELPERS
     ============================================================ */
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function loadSession()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function saveSlots()  { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); }
  function loadSlots()  {
    try {
      const d = JSON.parse(localStorage.getItem(SLOTS_KEY));
      if (d && Array.isArray(d) && d.length === 3) {
        // Enforce slot type normalization across versions
        d[0].type = 'charging';
        d[0].padName = 'Pad A';
        d[0].title = 'SLOT 1 - WIRELESS CHARGING';

        d[1].type = 'charging';
        d[1].padName = 'Pad B';
        d[1].title = 'SLOT 2 - WIRELESS CHARGING';

        d[2].type = 'parking_only';
        d[2].padName = null;
        d[2].title = 'SLOT 3 - SMART PARKING ONLY';
        d[2].power = 0;
        d[2].charging = false;
        d[2].targetSoc = 0;
        return d;
      }
      return null;
    } catch { return null; }
  }

  function userKey(email) { return `smartev_user_${email.toLowerCase()}`; }
  function saveUserData(email, data) { localStorage.setItem(userKey(email), JSON.stringify(data)); }
  function loadUserData(email) {
    try { return JSON.parse(localStorage.getItem(userKey(email))); } catch { return null; }
  }
  function getOrCreateUser(email) {
    let d = loadUserData(email);
    if (!d) {
      d = { email, vehicleId: '', model: '', rfid: '', rfidLinked: false, logs: [] };
      saveUserData(email, d);
    }
    return d;
  }

  function saveGlobalLogs(logs) { localStorage.setItem(LOGS_KEY, JSON.stringify(logs)); }
  function loadGlobalLogs() { try { return JSON.parse(localStorage.getItem(LOGS_KEY)) || []; } catch { return []; } }

  /* ============================================================
     SCREEN MANAGEMENT
     ============================================================ */
  const screens = ['gateScreen', 'userLoginScreen', 'adminLoginScreen'];
  const panels  = ['userPanel', 'adminPanel'];

  function showScreen(id) {
    screens.forEach(s => { const el = $(s); if (el) el.classList.remove('active'); });
    panels.forEach(p => { const el = $(p); if (el) el.classList.remove('active'); });
    const el = $(id);
    if (el) el.classList.add('active');
  }

  function showPanel(id) {
    screens.forEach(s => { const el = $(s); if (el) el.classList.remove('active'); });
    panels.forEach(p => { const el = $(p); if (el) el.classList.remove('active'); });
    const el = $(id);
    if (el) el.classList.add('active');
  }

  /* ============================================================
     VIEW SWITCHING
     ============================================================ */
  const viewTitles = {
    'u-vehicle':'My Vehicle','u-book':'Book Slot','u-charging':'My Charging','u-history':'My History',
    'a-dashboard':'All Slots Dashboard','a-hardware':'Hardware Status','a-analytics':'System Analytics & Logs',
  };

  function switchView(viewId, panelPrefix) {
    const titleEl = panelPrefix === 'u' ? $('userTopTitle') : $('adminTopTitle');
    const panel   = panelPrefix === 'u' ? $('userPanel')    : $('adminPanel');
    if (!panel) return;

    panel.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    panel.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    panel.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));

    const target = $(viewId);
    if (target) { void target.offsetWidth; target.classList.add('active'); }
    panel.querySelectorAll(`.nav-item[data-view="${viewId}"]`).forEach(n => n.classList.add('active'));
    panel.querySelectorAll(`.bnav-item[data-view="${viewId}"]`).forEach(b => b.classList.add('active'));

    // Dynamic title for user active session if Slot 3
    if (viewId === 'u-charging' && session && session.role === 'user') {
      const mySlot = slots.find(s => s.userEmail === session.email);
      if (mySlot && mySlot.id === 3) {
        if (titleEl) titleEl.textContent = 'My Parking Session';
      } else {
        if (titleEl) titleEl.textContent = viewTitles[viewId] || '';
      }
    } else {
      if (titleEl) titleEl.textContent = viewTitles[viewId] || '';
    }
    closeSidebars();

    // Render content hooks
    if (viewId === 'u-charging') renderUserCharging();
    if (viewId === 'u-book') {
      renderUserSlotPicker();
      updateDepartureCalculation();
    }
    if (viewId === 'u-history') renderUserHistory();
    if (viewId === 'a-dashboard') { renderAdminDashboard(); initAdminChart(); }
    if (viewId === 'a-analytics') { initAdminChart(); renderAdminLogs(); }
  }

  function wireNavigation(panel, prefix) {
    panel.querySelectorAll('.nav-item[data-view]').forEach(n => {
      n.addEventListener('click', e => { e.preventDefault(); switchView(n.dataset.view, prefix); });
    });
    panel.querySelectorAll('.bnav-item[data-view]').forEach(b => {
      b.addEventListener('click', () => switchView(b.dataset.view, prefix));
    });
  }

  /* ============================================================
     SIDEBAR TOGGLE
     ============================================================ */
  function openSidebar(sb)  { if (sb) sb.classList.add('open'); const ov = $('sidebarOverlay'); if (ov) ov.classList.add('show'); }
  function closeSidebars() {
    $$('.sidebar').forEach(s => s.classList.remove('open'));
    const ov = $('sidebarOverlay');
    if (ov) ov.classList.remove('show');
  }

  if ($('sidebarOverlay')) $('sidebarOverlay').addEventListener('click', closeSidebars);
  if ($('userHamburger')) $('userHamburger').addEventListener('click', () => openSidebar($('userSidebar')));
  if ($('userSidebarClose')) $('userSidebarClose').addEventListener('click', closeSidebars);
  if ($('adminHamburger')) $('adminHamburger').addEventListener('click', () => openSidebar($('adminSidebar')));
  if ($('adminSidebarClose')) $('adminSidebarClose').addEventListener('click', closeSidebars);

  /* ============================================================
     GATE SCREEN
     ============================================================ */
  if ($('gateUserBtn')) $('gateUserBtn').addEventListener('click', () => showScreen('userLoginScreen'));
  if ($('gateAdminBtn')) $('gateAdminBtn').addEventListener('click', () => showScreen('adminLoginScreen'));
  if ($('userLoginBack')) $('userLoginBack').addEventListener('click', () => showScreen('gateScreen'));
  if ($('adminLoginBack')) $('adminLoginBack').addEventListener('click', () => showScreen('gateScreen'));

  /* ============================================================
     USER LOGIN / REGISTER
     ============================================================ */
  if ($('userLoginForm')) {
    $('userLoginForm').addEventListener('submit', e => {
      e.preventDefault();
      const email = $('uEmail').value.trim().toLowerCase();
      const pass  = $('uPassword').value;
      if (!email || !pass) return;
      const ud = loadUserData(email);
      if (!ud) {
        $('userLoginError').textContent = 'No account found. Click "Register New User" first.';
        return;
      }
      if (ud.password !== pass) {
        $('userLoginError').textContent = 'Incorrect password.';
        return;
      }
      $('userLoginError').textContent = '';
      session = { role: 'user', email };
      saveSession(session);
      enterUserPanel();
      showToast(`Welcome back, ${email.split('@')[0]}!`, 'success');
    });
  }

  if ($('btnUserRegister')) {
    $('btnUserRegister').addEventListener('click', () => {
      const email = $('uEmail').value.trim().toLowerCase();
      const pass  = $('uPassword').value;
      if (!email || !pass) { $('userLoginError').textContent = 'Fill in both fields to register.'; return; }
      if (loadUserData(email)) { $('userLoginError').textContent = 'Account already exists. Please login.'; return; }
      const userData = { email, password: pass, vehicleId: '', model: '', rfid: '', rfidLinked: false, logs: [] };
      saveUserData(email, userData);
      session = { role: 'user', email };
      saveSession(session);
      enterUserPanel();
      showToast('Account created! Set up your vehicle info.', 'success');
    });
  }

  /* ============================================================
     ADMIN LOGIN — STRICT AUTHENTICATION
     Admin Email: johnsamuel.g11@gmail.com
     Security Key: 11112005
     Reject any other email or key with "Access Denied: Unauthorized Administrator" alert
     ============================================================ */
  if ($('adminLoginForm')) {
    $('adminLoginForm').addEventListener('submit', e => {
      e.preventDefault();
      const email = $('aEmail').value.trim().toLowerCase();
      const key   = $('aKey').value.trim();

      if (email !== ADMIN_EMAIL.toLowerCase() || key !== ADMIN_KEY) {
        const errorMsg = 'Access Denied: Unauthorized Administrator';
        $('adminLoginError').textContent = errorMsg;
        showToast(errorMsg, 'error');
        alert(errorMsg);
        return;
      }

      $('adminLoginError').textContent = '';
      session = { role: 'admin', email: ADMIN_EMAIL };
      saveSession(session);
      enterAdminPanel();
      showToast('Welcome, Administrator.', 'success');
    });
  }

  /* ============================================================
     ENTER PANELS
     ============================================================ */
  function enterUserPanel() {
    showPanel('userPanel');
    if (!userNavWired) {
      wireNavigation($('userPanel'), 'u');
      userNavWired = true;
    }
    const ud = getOrCreateUser(session.email);
    if ($('userAvatar')) $('userAvatar').textContent = session.email.charAt(0).toUpperCase();
    if ($('userNameLabel')) $('userNameLabel').textContent = session.email.split('@')[0];
    if ($('userEmailLabel')) $('userEmailLabel').textContent = session.email;
    populateVehicleForm(ud);
    switchView('u-vehicle', 'u');
  }

  function enterAdminPanel() {
    showPanel('adminPanel');
    if (!adminNavWired) {
      wireNavigation($('adminPanel'), 'a');
      adminNavWired = true;
    }
    if ($('adminEmailLabel')) $('adminEmailLabel').textContent = ADMIN_EMAIL;
    switchView('a-dashboard', 'a');
  }

  /* ============================================================
     LOGOUT
     ============================================================ */
  if ($('userLogoutBtn')) {
    $('userLogoutBtn').addEventListener('click', () => {
      clearSession();
      session = null;
      showScreen('gateScreen');
      showToast('Logged out.', 'info');
    });
  }
  if ($('adminLogoutBtn')) {
    $('adminLogoutBtn').addEventListener('click', () => {
      clearSession();
      session = null;
      showScreen('gateScreen');
      showToast('Logged out.', 'info');
    });
  }

  /* ============================================================
     USER — VEHICLE MANAGEMENT
     ============================================================ */
  function populateVehicleForm(ud) {
    if ($('regVehicleId')) $('regVehicleId').value = ud.vehicleId || '';
    if ($('regModel'))     $('regModel').value     = ud.model || '';
    if ($('regRfid'))      $('regRfid').value      = ud.rfid || '';
    updateVehicleBadge(ud);
  }

  function updateVehicleBadge(ud) {
    const badge = $('vehicleBadge');
    const rfidBadge = $('rfidStatusBadge');
    if (!badge || !rfidBadge) return;
    if (ud.rfidLinked && ud.vehicleId) {
      badge.textContent = 'Linked'; badge.className = 'vehicle-badge linked';
      rfidBadge.textContent = 'Active'; rfidBadge.className = 'rfid-status active-tag';
    } else {
      badge.textContent = 'Not Linked'; badge.className = 'vehicle-badge not-linked';
      rfidBadge.textContent = 'Inactive'; rfidBadge.className = 'rfid-status inactive-tag';
    }
  }

  if ($('btnSaveVehicle')) {
    $('btnSaveVehicle').addEventListener('click', () => {
      if (!session || session.role !== 'user') return;
      const ud = getOrCreateUser(session.email);
      ud.vehicleId = $('regVehicleId').value.trim();
      ud.model     = $('regModel').value.trim();
      ud.rfid      = $('regRfid').value.trim();
      if (ud.vehicleId && ud.rfid) ud.rfidLinked = true;
      saveUserData(session.email, ud);
      updateVehicleBadge(ud);
      showToast('Vehicle information saved!', 'success');
    });
  }

  if ($('linkRFID')) {
    $('linkRFID').addEventListener('click', e => {
      e.preventDefault();
      if (!session) return;
      const ud = getOrCreateUser(session.email);
      if (!ud.rfid) { showToast('Enter an RFID tag ID first.', 'error'); return; }
      ud.rfidLinked = true;
      saveUserData(session.email, ud);
      updateVehicleBadge(ud);
      showToast(`RFID tag ${ud.rfid} linked successfully!`, 'success');
    });
  }

  /* ============================================================
     LIVE SYSTEM TIME INTEGRATION & DYNAMIC TARGET DEPARTURE
     ============================================================ */
  const uDurSlider = $('userDurationSlider');
  const uDurValue  = $('userDurationValue');
  const uSocSlider = $('userSocSlider');
  const uSocBubble = $('userSocBubble');
  const uSummary   = $('userBookingSummary');
  const uDepTimeInput = $('userDepartureTime');

  function updateDepartureCalculation() {
    if (!uDurSlider) return;
    const durMins = parseInt(uDurSlider.value) || 60;
    if (uDurValue) uDurValue.textContent = `${durMins} min`;

    const now = new Date();
    const targetDate = new Date(now.getTime() + durMins * 60 * 1000);
    const formattedShort = formatTimeShort(targetDate);

    const targetDisp = $('userDepartureTargetText');
    if (targetDisp) {
      targetDisp.textContent = `Departure Target: ${formattedShort} (in ${durMins} mins)`;
    }

    if (uDepTimeInput && document.activeElement !== uDepTimeInput) {
      uDepTimeInput.value = format24hTime(targetDate);
    }

    // Dynamic Summary Card
    if (uSummary) {
      if (selectedSlot === 3) {
        uSummary.innerHTML = `Reserving Smart Parking Slot 3 (Parking Only) until <strong>${formattedShort}</strong> (in ${durMins} mins). No charging requested.`;
      } else {
        const socVal = uSocSlider ? uSocSlider.value : 80;
        uSummary.innerHTML = `Requesting wireless charge to <strong>${socVal}%</strong> with departure at <strong>${formattedShort}</strong> (in ${durMins} mins).`;
      }
    }
  }

  // Handle duration slider change
  if (uDurSlider) {
    uDurSlider.addEventListener('input', () => {
      updateDepartureCalculation();
    });
  }

  // Handle direct time input change
  if (uDepTimeInput) {
    uDepTimeInput.addEventListener('change', () => {
      const val = uDepTimeInput.value;
      if (!val) return;
      const [h, m] = val.split(':').map(Number);
      const now = new Date();
      const target = new Date();
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1); // target is next day
      }
      const diffMins = Math.round((target.getTime() - now.getTime()) / 60000);
      const clamped = Math.max(15, Math.min(180, diffMins));
      if (uDurSlider) uDurSlider.value = clamped;
      updateDepartureCalculation();
    });
  }

  // Handle SOC slider
  if (uSocSlider && uSocBubble) {
    uSocSlider.addEventListener('input', () => {
      const v = uSocSlider.value;
      uSocBubble.textContent = `${v}%`;
      const pct = (v - 10) / 90 * 100;
      uSocBubble.style.left = `calc(${pct}% + ${(8 - pct * 0.16)}px)`;
      updateDepartureCalculation();
    });
    // Init position
    const v = uSocSlider.value;
    const pct = (v - 10) / 90 * 100;
    uSocBubble.style.left = `calc(${pct}% + ${(8 - pct * 0.16)}px)`;
  }

  // Tick system clock every 1 second
  function tickClock() {
    const now = new Date();
    const clockEl = $('userLiveClockDisplay');
    if (clockEl) {
      clockEl.textContent = `Current Time: ${formatClockTime(now)}`;
    }
    // Update live departure calculations in booking view
    if ($('u-book') && $('u-book').classList.contains('active')) {
      updateDepartureCalculation();
    }
    // Update live countdown in active user session view
    if ($('u-charging') && $('u-charging').classList.contains('active')) {
      updateUserRemainingCountdownLive();
    }
  }
  setInterval(tickClock, 1000);

  /* ============================================================
     USER — SLOT BOOKING FLOW (#u-book)
     Slot 1: EV WIRELESS CHARGING
     Slot 2: EV WIRELESS CHARGING
     Slot 3: SMART PARKING ONLY (NO CHARGING)
     ============================================================ */
  function selectSlot(slotId) {
    selectedSlot = slotId;
    const isSlot3 = slotId === 3;
    const socWrap = $('userSocWrap');
    const socNotice = $('userSocNoticeBox');
    const socSlider = $('userSocSlider');
    const socTitle = $('socConfigTitle');

    if (isSlot3) {
      if (socWrap) socWrap.style.display = 'none';
      if (socNotice) socNotice.style.display = 'flex';
      if (socSlider) socSlider.disabled = true;
      if (socTitle) socTitle.innerHTML = `<span class="material-icons-round">local_parking</span> Smart Parking Bay (No Charging)`;
    } else {
      if (socWrap) socWrap.style.display = 'block';
      if (socNotice) socNotice.style.display = 'none';
      if (socSlider) socSlider.disabled = false;
      if (socTitle) socTitle.innerHTML = `<span class="material-icons-round">battery_charging_full</span> Required SOC (%)`;
    }
    updateDepartureCalculation();
  }

  function renderUserSlotPicker() {
    const container = $('userSlotPicker');
    if (!container) return;
    container.innerHTML = '';

    // If user already has a booked slot, display notice
    if (session && session.role === 'user') {
      const existingSlot = slots.find(s => s.userEmail === session.email);
      if (existingSlot) {
        const isParkSlot = existingSlot.id === 3;
        const targetViewName = isParkSlot ? 'My Parking Session' : 'My Charging';
        container.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:26px;color:var(--c-text-muted);">
            <span class="material-icons-round" style="font-size:42px;color:var(--c-accent);display:block;margin-bottom:8px;">event_busy</span>
            <h3 style="font-size:1.1rem;color:var(--c-text);margin-bottom:4px;">Active Session in Progress</h3>
            <p style="font-size:.9rem;">You have Slot ${existingSlot.id} (${isParkSlot ? 'Smart Parking' : 'Wireless Charging'}) currently active. View details in <strong>"${targetViewName}"</strong>.</p>
          </div>`;
        return;
      }
    }

    let firstAvailable = null;

    slots.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'slot-btn';
      const isSlot3 = s.id === 3;
      if (isSlot3) btn.classList.add('parking-bay-btn');

      const typeBadge = isSlot3
        ? `<span class="slot-badge-type parking">SMART PARKING ONLY (NO CHARGING)</span><div style="margin-top:2px;"><span class="no-coil-pill">NO CHARGING COIL</span></div>`
        : `<span class="slot-badge-type charge">EV WIRELESS CHARGING</span>`;

      const iconName = isSlot3 ? 'local_parking' : 'directions_car';
      const iconClass = isSlot3 ? 'slot-car-icon slot-parking-only-icon' : 'slot-car-icon';

      if (s.occupied) {
        btn.classList.add('occupied');
        btn.disabled = true;
        btn.innerHTML = `
          <div class="slot-num">Slot ${s.id}</div>
          ${typeBadge}
          <span class="material-icons-round ${iconClass}">${iconName}</span>
          <div class="slot-status">Unavailable</div>
          <div class="slot-ev-label">—</div>`;
      } else {
        btn.classList.add('available');
        btn.innerHTML = `
          <div class="slot-num">Slot ${s.id}</div>
          ${typeBadge}
          <span class="material-icons-round ${iconClass}">${iconName}</span>
          <div class="slot-status">AVAILABLE</div>
          <div class="slot-book-label">BOOK NOW</div>`;

        btn.addEventListener('click', () => {
          container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectSlot(s.id);
        });

        if (!firstAvailable) firstAvailable = s.id;
      }
      container.appendChild(btn);
    });

    // Default select initial slot
    if (!selectedSlot || slots.find(s => s.id === selectedSlot)?.occupied) {
      selectedSlot = firstAvailable;
    }
    if (selectedSlot) {
      const allBtns = container.querySelectorAll('.slot-btn');
      slots.forEach((s, idx) => {
        if (s.id === selectedSlot && allBtns[idx]) allBtns[idx].classList.add('selected');
      });
      selectSlot(selectedSlot);
    }
  }

  // Confirm booking
  if ($('userConfirmBooking')) {
    $('userConfirmBooking').addEventListener('click', () => {
      if (!session || session.role !== 'user') return;
      const ud = getOrCreateUser(session.email);
      if (!ud.vehicleId) { showToast('Please set up your vehicle ID first in "My Vehicle".', 'error'); return; }
      if (!selectedSlot) { showToast('No slot selected or available to book.', 'error'); return; }

      // Check if user already booked
      const existing = slots.find(s => s.userEmail === session.email);
      if (existing) { showToast('You already have an active slot booked.', 'error'); return; }

      const slot = slots.find(s => s.id === selectedSlot);
      if (!slot || slot.occupied) { showToast('Slot is no longer available.', 'error'); return; }

      const durMins = parseInt(uDurSlider.value) || 60;
      const targetTimestamp = Date.now() + durMins * 60 * 1000;
      const targetDate = new Date(targetTimestamp);
      const formattedShort = formatTimeShort(targetDate);

      slot.occupied = true;
      slot.evId = ud.vehicleId;
      slot.userEmail = session.email;
      slot.bookedAt = Date.now();
      slot.durationMinutes = durMins;
      slot.departureTimestamp = targetTimestamp;
      slot.departureFormatted = formattedShort;
      slot.departureTime = uDepTimeInput.value || format24hTime(targetDate);

      if (slot.id === 3) {
        // Slot 3: SMART PARKING ONLY (No charging coil, 0 W)
        slot.soc = 0;
        slot.targetSoc = 0;
        slot.power = 0;
        slot.priority = 0;
        slot.charging = false;
      } else {
        // Slot 1 & Slot 2: EV Wireless Charging
        slot.soc = Math.floor(Math.random() * 15) + 10;
        slot.targetSoc = parseInt(uSocSlider.value) || 80;
        slot.power = 0;
        slot.priority = 0;
        slot.charging = true;
      }
      saveSlots();

      const btn = $('userConfirmBooking');
      btn.innerHTML = '<span class="material-icons-round">check_circle</span> BOOKING CONFIRMED';
      btn.style.background = 'linear-gradient(135deg,#2E7D32,#1B5E20)';
      btn.style.borderColor = '#66BB6A';
      btn.style.pointerEvents = 'none';

      const successNotice = slot.id === 3
        ? 'Slot 3 (Smart Parking Only) reserved successfully!'
        : `Slot ${slot.id} (EV Wireless Charging) booked! Wireless charging will begin.`;
      showToast(successNotice, 'success');

      setTimeout(() => {
        btn.innerHTML = '<span class="material-icons-round">check_circle</span> CONFIRM BOOKING';
        btn.style.background = ''; btn.style.borderColor = ''; btn.style.pointerEvents = '';
        switchView('u-charging', 'u');
      }, 1500);
    });
  }

  /* ============================================================
     USER — ACTIVE SESSION VIEW (#u-charging)
     Slot 1 / Slot 2: Live EV Charging Telemetry + AI Priority Gauge
     Slot 3: Dedicated Smart Parking Session Card (No charging, Countdown timer)
     ============================================================ */
  function renderUserCharging() {
    const container = $('userChargingContent');
    if (!container || !session || session.role !== 'user') return;
    const mySlot = slots.find(s => s.userEmail === session.email);

    const headerTitle = $('userChargingHeaderTitle');
    const headerSub   = $('userChargingHeaderSub');
    const headerIcon  = $('userChargingHeaderIcon');
    const topTitle    = $('userTopTitle');

    if (!mySlot) {
      if (headerTitle) headerTitle.textContent = 'My Charging';
      if (headerSub)   headerSub.textContent   = 'Live status of your assigned parking slot';
      if (headerIcon)  headerIcon.textContent  = 'battery_charging_full';
      if (topTitle)    topTitle.textContent    = 'My Charging';

      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <span class="material-icons-round">ev_station</span>
            <h3>No Active Slot</h3>
            <p>You haven't booked a parking or charging slot yet.</p>
            <button class="btn btn-book-slot" id="goBookFromCharging"><span class="material-icons-round">event_available</span> Book a Slot</button>
          </div>
        </div>`;
      const goBtn = $('goBookFromCharging');
      if (goBtn) goBtn.addEventListener('click', () => switchView('u-book', 'u'));
      return;
    }

    // ==========================================================
    // CASE A: SLOT 3 — SMART PARKING ONLY BAY
    // ==========================================================
    if (mySlot.id === 3) {
      if (headerTitle) headerTitle.textContent = 'My Parking Session';
      if (headerSub)   headerSub.textContent   = 'Live status of your reserved smart parking bay';
      if (headerIcon)  headerIcon.textContent  = 'local_parking';
      if (topTitle)    topTitle.textContent    = 'My Parking Session';

      const remainingMs = Math.max(0, (mySlot.departureTimestamp || (mySlot.bookedAt + (mySlot.durationMinutes || 60) * 60000)) - Date.now());
      const countdownStr = formatCountdown(remainingMs);

      container.innerHTML = `
        <div class="card dash-slot-card user-slot-card-single parking-only-card" id="userSlotCard">
          <div class="slot-card-header parking-only-header">
            <div>
              <h3>SLOT 3 - SMART PARKING ONLY</h3>
              <div style="margin-top:3px;"><span class="no-coil-pill">NO CHARGING COIL</span></div>
            </div>
            <span class="status-badge on">PARKED</span>
          </div>
          <div class="slot-card-body">
            <div class="slot-info-grid">
              <div class="info-item"><span class="info-label">EV ID</span><span class="info-value">${mySlot.evId}</span></div>
              <div class="info-item"><span class="info-label">Vehicle Presence</span><span class="info-value" style="color:var(--c-green)">PARKED</span></div>
              <div class="info-item"><span class="info-label">Charging State</span><span class="info-value" style="color:var(--c-text-muted)">N/A (Non-Charging Bay)</span></div>
              <div class="info-item"><span class="info-label">Power</span><span class="info-value">0.0 W</span></div>
              <div class="info-item"><span class="info-label">Bay Mode</span><span class="info-value">Smart Parking Only</span></div>
              <div class="info-item"><span class="info-label">Departure Target</span><span class="info-value">${mySlot.departureFormatted || mySlot.departureTime}</span></div>
            </div>

            <!-- Dedicated Parking Remaining Countdown Timer -->
            <div class="parking-countdown-wrap">
              <div class="parking-countdown-digits" id="userParkingCountdownDigits">${countdownStr}</div>
              <div class="parking-countdown-label">Parking Duration Remaining</div>
              <div><span class="parking-session-pill"><span class="material-icons-round">local_parking</span> Active Smart Parking Session</span></div>
            </div>

            <button class="btn btn-secondary full-w" id="userEndParkingBtn" style="margin-top:10px;">
              <span class="material-icons-round">logout</span> Release Slot & End Session
            </button>
          </div>
        </div>`;

      const endBtn = $('userEndParkingBtn');
      if (endBtn) {
        endBtn.addEventListener('click', () => {
          if (!confirm('Are you sure you want to end your parking session and free Slot 3?')) return;
          const dur = mySlot.bookedAt ? formatDuration(Date.now() - mySlot.bookedAt) : '00:00';
          const logEntry = {
            slot: 3,
            evId: mySlot.evId,
            user: mySlot.userEmail,
            date: new Date().toLocaleDateString(),
            duration: dur,
            energy: '0.0 Wh (Parking Only)',
            peakSoc: 0
          };
          const gLogs = loadGlobalLogs(); gLogs.push(logEntry); saveGlobalLogs(gLogs);
          const ud = getOrCreateUser(mySlot.userEmail); ud.logs.push(logEntry); saveUserData(mySlot.userEmail, ud);

          // Reset slot 3
          mySlot.occupied = false;
          mySlot.evId = null;
          mySlot.userEmail = null;
          mySlot.bookedAt = null;
          mySlot.departureTimestamp = null;
          saveSlots();
          showToast('Parking session completed. Slot 3 is now available.', 'info');
          renderUserCharging();
        });
      }
      return;
    }

    // ==========================================================
    // CASE B: SLOT 1 OR 2 — EV WIRELESS CHARGING BAY
    // ==========================================================
    if (headerTitle) headerTitle.textContent = 'My Charging';
    if (headerSub)   headerSub.textContent   = 'Live status of your assigned wireless charging bay';
    if (headerIcon)  headerIcon.textContent  = 'battery_charging_full';
    if (topTitle)    topTitle.textContent    = 'My Charging';

    let statusText, statusClass;
    if (mySlot.charging && mySlot.soc < 30) {
      statusText = 'Active'; statusClass = 'active-glow';
    } else if (mySlot.charging) {
      statusText = 'Active'; statusClass = 'on';
    } else if (mySlot.soc >= mySlot.targetSoc) {
      statusText = 'Complete'; statusClass = 'on';
    } else {
      statusText = 'Off'; statusClass = 'off-badge';
    }

    const pBadge = priorityBadgeHTML(mySlot.priority);
    const barClass = mySlot.soc < 30 ? 'low-fill' : '';
    const padName = mySlot.id === 1 ? 'Wireless Pad A' : 'Wireless Pad B';

    container.innerHTML = `
      <div class="card dash-slot-card user-slot-card-single" id="userSlotCard">
        <div class="slot-card-header">
          <div>
            <h3>SLOT ${mySlot.id} - EV WIRELESS CHARGING</h3>
            <div style="margin-top:2px;font-size:.7rem;opacity:.8;">${padName} &bull; ACTIVE TRANSMITTER COIL</div>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="slot-card-body">
          <div class="slot-info-grid">
            <div class="info-item"><span class="info-label">EV ID</span><span class="info-value">${mySlot.evId}</span></div>
            <div class="info-item"><span class="info-label">Battery (SOC)</span><span class="info-value" id="userSlotSoc">${Math.round(mySlot.soc)}%</span></div>
            <div class="info-item"><span class="info-label">Power</span><span class="info-value" id="userSlotPower">${mySlot.power.toFixed(1)} W</span></div>
            <div class="info-item"><span class="info-label">AI Priority</span><span class="info-value"><span id="userSlotPriority">${mySlot.priority}</span> ${pBadge}</span></div>
            <div class="info-item"><span class="info-label">Target SOC</span><span class="info-value">${mySlot.targetSoc}%</span></div>
            <div class="info-item"><span class="info-label">Departure</span><span class="info-value">${mySlot.departureFormatted || mySlot.departureTime}</span></div>
          </div>
          <div class="gauge-wrap">
            <svg class="gauge-svg" viewBox="0 0 140 140" id="userGauge">
              <defs>
                <linearGradient id="userGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#E65100"/>
                  <stop offset="100%" stop-color="#D4A843"/>
                </linearGradient>
              </defs>
              <circle class="gauge-bg" cx="70" cy="70" r="60"/>
              <circle class="gauge-fill" cx="70" cy="70" r="60" id="userGaugeFill" stroke="url(#userGaugeGrad)"/>
              <text x="70" y="62" class="gauge-label">AI Priority</text>
              <text x="70" y="84" class="gauge-value" id="userGaugeVal">${mySlot.priority}%</text>
            </svg>
            <div class="gauge-caption">Dynamically Prioritized by ML Backend</div>
          </div>
          <div class="soc-bar-wrap"><div class="soc-bar"><div class="soc-bar-fill ${barClass}" id="userSlotSocBar" style="width:${mySlot.soc}%"></div></div></div>
          <button class="btn btn-stop ${mySlot.charging ? '' : 'stopped'}" id="userToggleCharging">
            <span class="material-icons-round">${mySlot.charging ? 'stop_circle' : 'play_circle'}</span>
            ${mySlot.charging ? 'STOP CHARGING' : 'START CHARGING'}
          </button>
        </div>
      </div>`;

    updateGaugeEl('userGaugeFill', 'userGaugeVal', mySlot.priority);

    const toggleBtn = $('userToggleCharging');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        mySlot.charging = !mySlot.charging;
        saveSlots();
        renderUserCharging();
        showToast(mySlot.charging ? 'Charging started.' : 'Charging stopped.', mySlot.charging ? 'success' : 'error');
      });
    }
  }

  function updateUserRemainingCountdownLive() {
    const mySlot = slots.find(s => s.userEmail === session?.email);
    if (!mySlot || mySlot.id !== 3) return;
    const digitsEl = $('userParkingCountdownDigits');
    if (!digitsEl) return;
    const remainingMs = Math.max(0, (mySlot.departureTimestamp || (mySlot.bookedAt + (mySlot.durationMinutes || 60) * 60000)) - Date.now());
    digitsEl.textContent = formatCountdown(remainingMs);
  }

  /* ============================================================
     USER — HISTORY
     ============================================================ */
  function renderUserHistory() {
    if (!session || session.role !== 'user') return;
    const ud = getOrCreateUser(session.email);
    const tbody = $('userLogsTbody');
    const empty = $('userLogsEmpty');
    if (!tbody || !empty) return;
    tbody.innerHTML = '';
    if (!ud.logs || ud.logs.length === 0) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    ud.logs.slice().reverse().forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>Slot ${l.slot}</td><td>${l.date}</td><td>${l.duration}</td><td>${l.energy}</td><td>${l.peakSoc ? l.peakSoc + '%' : 'N/A'}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     ADMIN — ALL SLOTS DASHBOARD
     Slot 1: WIRELESS CHARGING (Pad A)
     Slot 2: WIRELESS CHARGING (Pad B)
     Slot 3: SMART PARKING ONLY (Occupancy, 0.0 W, Disabled Coil controls)
     ============================================================ */
  function renderAdminDashboard() {
    const grid = $('adminSlotsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    let availCount = 0;
    let totalPower = 0;

    slots.forEach(s => {
      if (!s.occupied) availCount++;
      if (s.charging && s.id !== 3) totalPower += s.power;

      const card = document.createElement('div');
      card.className = 'card dash-slot-card';
      const isSlot3 = s.id === 3;

      if (isSlot3) {
        card.classList.add('parking-only-card');
        if (!s.occupied) {
          card.innerHTML = `
            <div class="slot-card-header parking-only-header">
              <div>
                <h3>SLOT 3 - SMART PARKING ONLY</h3>
                <div style="margin-top:3px;"><span class="no-coil-pill">NO CHARGING COIL</span></div>
              </div>
              <span class="status-badge available-badge">AVAILABLE</span>
            </div>
            <div class="slot-card-body available-body">
              <span class="material-icons-round empty-slot-icon" style="color:#8C7362">local_parking</span>
              <p>Standard Smart Parking Bay (No Charging Coil Installed).</p>
              <div class="btn-coil-disabled"><span class="material-icons-round">block</span> Disabled: Non-Charging Pad</div>
            </div>`;
        } else {
          card.innerHTML = `
            <div class="slot-card-header parking-only-header">
              <div>
                <h3>SLOT 3 - SMART PARKING ONLY</h3>
                <div style="margin-top:3px;"><span class="no-coil-pill">NO CHARGING COIL</span></div>
              </div>
              <span class="status-badge on">PARKED</span>
            </div>
            <div class="slot-card-body">
              <div class="slot-info-grid">
                <div class="info-item"><span class="info-label">EV ID</span><span class="info-value">${s.evId}</span></div>
                <div class="info-item"><span class="info-label">Status</span><span class="info-value">PARKING ONLY</span></div>
                <div class="info-item"><span class="info-label">Power</span><span class="info-value">0.0 W</span></div>
                <div class="info-item"><span class="info-label">Vehicle Presence</span><span class="info-value" style="color:var(--c-green)">PARKED</span></div>
                <div class="info-item"><span class="info-label">User</span><span class="info-value" style="font-size:.78rem">${s.userEmail || '—'}</span></div>
                <div class="info-item"><span class="info-label">Departure</span><span class="info-value">${s.departureFormatted || s.departureTime}</span></div>
              </div>
              <div class="parking-session-pill" style="margin-bottom:12px;width:100%;justify-content:center;">
                <span class="material-icons-round">local_parking</span> Active Smart Parking Session
              </div>
              <div class="btn-coil-disabled"><span class="material-icons-round">block</span> Disabled: Non-Charging Pad</div>
            </div>`;
        }
      } else {
        // Slot 1 or Slot 2: Active EV Wireless Charging
        const padLabel = s.id === 1 ? 'PAD A' : 'PAD B';
        if (!s.occupied) {
          card.innerHTML = `
            <div class="slot-card-header">
              <div>
                <h3>SLOT ${s.id} - WIRELESS CHARGING</h3>
                <div style="margin-top:3px;font-size:.68rem;opacity:.8;">${padLabel} &bull; ACTIVE TRANSMITTER COIL</div>
              </div>
              <span class="status-badge available-badge">AVAILABLE</span>
            </div>
            <div class="slot-card-body available-body">
              <span class="material-icons-round empty-slot-icon">bolt</span>
              <p>Wireless Charging Slot is available for booking.</p>
            </div>`;
        } else {
          if (s.charging && s.soc < 30) card.classList.add('slot-active-card');
          const statusClass = s.charging ? (s.soc < 30 ? 'active-glow' : 'on') : 'off-badge';
          const statusText  = s.charging ? (s.soc < 30 ? 'ACTIVE' : 'ON') : 'OFF';
          const pBadge = priorityBadgeHTML(s.priority);
          const barClass = s.soc < 30 ? 'low-fill' : '';

          let gaugeHTML = '';
          if (s.priority >= 70) {
            gaugeHTML = `
              <div class="gauge-wrap">
                <svg class="gauge-svg" viewBox="0 0 140 140">
                  <defs><linearGradient id="gaugeGradA${s.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#E65100"/><stop offset="100%" stop-color="#D4A843"/>
                  </linearGradient></defs>
                  <circle class="gauge-bg" cx="70" cy="70" r="60"/>
                  <circle class="gauge-fill" cx="70" cy="70" r="60" id="adminGaugeFill${s.id}" stroke="url(#gaugeGradA${s.id})"/>
                  <text x="70" y="62" class="gauge-label">AI Priority</text>
                  <text x="70" y="84" class="gauge-value" id="adminGaugeVal${s.id}">${s.priority}%</text>
                </svg>
                <div class="gauge-caption">Dynamically Prioritized by ML Backend</div>
              </div>`;
          }

          card.innerHTML = `
            <div class="slot-card-header">
              <div>
                <h3>SLOT ${s.id} - WIRELESS CHARGING</h3>
                <div style="margin-top:3px;font-size:.68rem;opacity:.8;">${padLabel} &bull; ACTIVE TRANSMITTER COIL</div>
              </div>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="slot-card-body">
              <div class="slot-info-grid">
                <div class="info-item"><span class="info-label">EV ID</span><span class="info-value">${s.evId}</span></div>
                <div class="info-item"><span class="info-label">Battery (SOC)</span><span class="info-value" id="adminSoc${s.id}">${Math.round(s.soc)}%</span></div>
                <div class="info-item"><span class="info-label">Power</span><span class="info-value" id="adminPow${s.id}">${s.power.toFixed(1)} W</span></div>
                <div class="info-item"><span class="info-label">AI Priority</span><span class="info-value"><span id="adminPri${s.id}">${s.priority}</span> ${pBadge}</span></div>
                <div class="info-item"><span class="info-label">User</span><span class="info-value" style="font-size:.78rem">${s.userEmail || '—'}</span></div>
                <div class="info-item"><span class="info-label">Target SOC</span><span class="info-value">${s.targetSoc}%</span></div>
              </div>
              ${gaugeHTML}
              <div class="soc-bar-wrap"><div class="soc-bar"><div class="soc-bar-fill ${barClass}" id="adminSocBar${s.id}" style="width:${s.soc}%"></div></div></div>
              <button class="btn btn-stop ${s.charging ? '' : 'stopped'}" data-admin-stop="${s.id}">
                <span class="material-icons-round">${s.charging ? 'stop_circle' : 'play_circle'}</span>
                ${s.charging ? 'STOP CHARGING' : 'START CHARGING'}
              </button>
            </div>`;
        }
      }
      grid.appendChild(card);

      if (!isSlot3 && s.occupied && s.priority >= 70) {
        setTimeout(() => updateGaugeEl(`adminGaugeFill${s.id}`, `adminGaugeVal${s.id}`, s.priority), 50);
      }
    });

    // Coil toggle handlers for slots 1 and 2
    grid.querySelectorAll('[data-admin-stop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = parseInt(btn.dataset.adminStop);
        const slot = slots.find(s => s.id === sid);
        if (slot && slot.id !== 3) {
          slot.charging = !slot.charging;
          saveSlots();
          renderAdminDashboard();
          showToast(slot.charging ? `Slot ${sid} charging started.` : `Slot ${sid} charging stopped.`, slot.charging ? 'success' : 'error');
          addAdminAlert(slot.charging ? `Slot ${sid} charging resumed by admin` : `Slot ${sid} stopped by admin`, 'priority-alert', 'priority_high');
        }
      });
    });

    if ($('adminMetricSlots')) $('adminMetricSlots').textContent = `${availCount} / 3`;
    if ($('adminMetricPower')) $('adminMetricPower').textContent = `${totalPower.toFixed(1)} W`;
  }

  // Emergency stop all — halts charging on Slot 1 and Slot 2
  if ($('adminEmergencyStop')) {
    $('adminEmergencyStop').addEventListener('click', () => {
      slots.forEach(s => {
        if (s.id !== 3 && s.charging) s.charging = false;
      });
      saveSlots();
      renderAdminDashboard();
      showToast('EMERGENCY STOP: All active wireless charging coils halted!', 'error');
      addAdminAlert('EMERGENCY STOP — All wireless charging halted by admin', 'priority-alert', 'priority_high');
    });
  }

  /* ============================================================
     ADMIN — ALERTS
     ============================================================ */
  function addAdminAlert(msg, cls, icon) {
    const list = $('adminAlertsList');
    if (!list) return;
    const li = document.createElement('li');
    li.className = `alert-item ${cls}`;
    li.innerHTML = `<span class="material-icons-round">${icon}</span><div><strong>${msg}</strong><small>Just now</small></div>`;
    li.style.opacity = '0'; li.style.transform = 'translateX(-20px)';
    list.insertBefore(li, list.firstChild);
    requestAnimationFrame(() => { li.style.transition = 'all .4s ease'; li.style.opacity = '1'; li.style.transform = 'translateX(0)'; });
    while (list.children.length > 10) list.removeChild(list.lastChild);
  }

  /* ============================================================
     ADMIN — POWER CHART
     Lock Slot 3 flat at 0.0 W across all intervals
     Focus lines on Slot 1 (Pad A) and Slot 2 (Pad B)
     ============================================================ */
  function initAdminChart() {
    if (powerChart) return;
    const ctx = $('adminPowerChart');
    if (!ctx) return;
    const labels = []; const d1 = []; const d2 = []; const d3 = [];
    for (let i = 10; i >= 0; i--) { labels.push(`-${i * 2}s`); d1.push(0); d2.push(0); d3.push(0); }

    powerChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Slot 1 (Wireless Pad A)', data:d1, borderColor:'#8B4513', backgroundColor:'rgba(139,69,19,.08)', pointBackgroundColor:'#8B4513', pointBorderColor:'#FFF', pointBorderWidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension:.4 },
          { label:'Slot 2 (Wireless Pad B)', data:d2, borderColor:'#A0522D', backgroundColor:'rgba(160,82,45,.08)', pointBackgroundColor:'#A0522D', pointBorderColor:'#FFF', pointBorderWidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension:.4 },
          { label:'Slot 3 (Parking Only - Flat 0.0W)', data:d3, borderColor:'#B8A899', backgroundColor:'transparent', pointBackgroundColor:'#B8A899', pointBorderColor:'#FFF', pointBorderWidth:1, pointRadius:2, borderWidth:1.5, fill:false, tension:0, borderDash:[5,5] },
        ],
      },
      options: {
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'top',labels:{usePointStyle:true,pointStyle:'circle',padding:18,font:{family:"'Inter',sans-serif",size:11,weight:'600'},color:'#2D1910'}},
          tooltip:{backgroundColor:'#2D1910',titleFont:{family:"'Inter',sans-serif",weight:'700'},bodyFont:{family:"'Inter',sans-serif"},cornerRadius:10,padding:10,callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y.toFixed(1)} W`}},
        },
        scales:{
          x:{grid:{color:'rgba(45,25,16,.05)'},ticks:{font:{family:"'Inter',sans-serif",size:10},color:'#7A6555'}},
          y:{grid:{color:'rgba(45,25,16,.05)'},ticks:{font:{family:"'Inter',sans-serif",size:10},color:'#7A6555',callback:v=>`${v} W`},beginAtZero:true,max:8},
        },
      },
    });
  }

  function pushChartData() {
    if (!powerChart) return;
    const now = new Date();
    const lbl = `${now.getMinutes()}:${String(now.getSeconds()).padStart(2,'0')}`;
    powerChart.data.labels.push(lbl);
    // Slot 1 and Slot 2 report live wireless charging power
    powerChart.data.datasets[0].data.push(slots[0] && slots[0].charging ? slots[0].power : 0);
    powerChart.data.datasets[1].data.push(slots[1] && slots[1].charging ? slots[1].power : 0);
    // Slot 3 is strictly flat 0.0 W
    powerChart.data.datasets[2].data.push(0);

    if (powerChart.data.labels.length > 22) {
      powerChart.data.labels.shift();
      powerChart.data.datasets.forEach(ds => ds.data.shift());
    }
    powerChart.update('none');
  }

  /* ============================================================
     ADMIN — LOGS TABLE
     ============================================================ */
  function renderAdminLogs() {
    const tbody = $('adminLogsTbody');
    if (!tbody) return;
    const logs = loadGlobalLogs();
    tbody.innerHTML = '';
    logs.slice(-15).reverse().forEach(l => {
      const tr = document.createElement('tr');
      const slotLabel = l.slot === 3 ? 'Slot 3 (Parking Only)' : `Slot ${l.slot}`;
      tr.innerHTML = `<td><span class="ev-tag">${l.evId}</span></td><td>${slotLabel}</td><td>${l.user||'—'}</td><td>${l.duration}</td><td>${l.energy}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     GAUGE HELPER
     ============================================================ */
  function updateGaugeEl(fillId, valId, percent) {
    const circ = 2 * Math.PI * 60;
    const offset = circ * (1 - percent / 100);
    const fill = $(fillId);
    const val  = $(valId);
    if (fill) fill.style.strokeDashoffset = offset;
    if (val) val.textContent = `${percent}%`;
  }

  function priorityBadgeHTML(val) {
    if (val >= 80) return '<span class="priority-badge very-high">VERY HIGH</span>';
    if (val >= 60) return '<span class="priority-badge high">HIGH</span>';
    if (val >= 35) return '<span class="priority-badge medium">MEDIUM</span>';
    return '<span class="priority-badge low">LOW</span>';
  }

  function updatePriorityBadgeEl(badge, val) {
    if (val >= 80)      { badge.textContent = 'VERY HIGH'; badge.className = 'priority-badge very-high'; }
    else if (val >= 60) { badge.textContent = 'HIGH';      badge.className = 'priority-badge high'; }
    else if (val >= 35) { badge.textContent = 'MEDIUM';    badge.className = 'priority-badge medium'; }
    else                { badge.textContent = 'LOW';       badge.className = 'priority-badge low'; }
  }

  /* ============================================================
     SIMULATION ENGINE — ticks every 2 seconds
     Only Slot 1 and Slot 2 charge & draw power
     Slot 3 is strictly non-charging (0.0 W)
     ============================================================ */
  function simTick() {
    if (!simRunning) return;
    let changed = false;

    slots.forEach(s => {
      // Slot 3 is smart parking bay ONLY
      if (s.id === 3) {
        s.power = 0;
        s.charging = false;
        s.soc = 0;
        s.priority = 0;
        return;
      }

      if (!s.occupied || !s.charging) return;
      changed = true;

      // SOC increase for active wireless charging
      const rate = s.soc < 30 ? 0.9 : (s.soc < 60 ? 0.5 : 0.25);
      s.soc = Math.min(s.targetSoc, s.soc + rate);

      // Power: higher when SOC is low
      s.power = +(s.soc < 30 ? (3.5 + Math.random() * 2) : (1.5 + Math.random() * 1)).toFixed(1);

      // AI Priority: inversely proportional to SOC
      const socFactor = 1 - (s.soc / 100);
      const randomJitter = Math.random() * 4 - 2;
      s.priority = Math.max(5, Math.min(99, Math.round(socFactor * 95 + randomJitter)));

      // Target reached
      if (s.soc >= s.targetSoc) {
        s.charging = false;
        s.power = 0;
        s.priority = 0;
        const dur = s.bookedAt ? formatDuration(Date.now() - s.bookedAt) : '00:00';
        const energy = (Math.random() * 5 + 1).toFixed(2) + ' Wh';
        const logEntry = {
          slot: s.id,
          evId: s.evId,
          user: s.userEmail,
          date: new Date().toLocaleDateString(),
          duration: dur,
          energy,
          peakSoc: Math.round(s.soc)
        };
        const gLogs = loadGlobalLogs(); gLogs.push(logEntry); saveGlobalLogs(gLogs);
        if (s.userEmail) {
          const ud = getOrCreateUser(s.userEmail);
          ud.logs.push(logEntry);
          saveUserData(s.userEmail, ud);
        }
        addAdminAlert(`${s.evId} reached target SOC (${s.targetSoc}%) on Slot ${s.id}`, 'success-alert', 'check_circle');
        if (session && session.role === 'user' && s.userEmail === session.email) {
          showToast(`Your vehicle reached ${s.targetSoc}% SOC!`, 'success');
        }
      }
    });

    if (changed) saveSlots();

    // UI Updates
    if (session) {
      if (session.role === 'user') {
        updateUserChargingLive();
      } else if (session.role === 'admin') {
        updateAdminLive();
        chartTick++;
        if (chartTick % 3 === 0) pushChartData();
      }
    }
  }

  function updateUserChargingLive() {
    const mySlot = slots.find(s => s.userEmail === session?.email);
    if (!mySlot) return;

    // Slot 3 is smart parking only
    if (mySlot.id === 3) {
      updateUserRemainingCountdownLive();
      return;
    }

    const socEl = $('userSlotSoc');
    const powEl = $('userSlotPower');
    const priEl = $('userSlotPriority');
    const barEl = $('userSlotSocBar');
    if (socEl) socEl.textContent = `${Math.round(mySlot.soc)}%`;
    if (powEl) powEl.textContent = `${mySlot.power.toFixed(1)} W`;
    if (priEl) {
      priEl.textContent = mySlot.priority;
      const badge = priEl.parentElement?.querySelector('.priority-badge');
      if (badge) updatePriorityBadgeEl(badge, mySlot.priority);
    }
    if (barEl) {
      barEl.style.width = `${mySlot.soc}%`;
      if (mySlot.soc >= 30) barEl.classList.remove('low-fill'); else barEl.classList.add('low-fill');
    }
    updateGaugeEl('userGaugeFill', 'userGaugeVal', mySlot.priority);

    // Update status badge
    const card = $('userSlotCard');
    if (card) {
      const sBadge = card.querySelector('.status-badge');
      if (sBadge) {
        if (mySlot.charging && mySlot.soc < 30) {
          sBadge.textContent = 'Active'; sBadge.className = 'status-badge active-glow';
        } else if (mySlot.charging) {
          sBadge.textContent = 'Active'; sBadge.className = 'status-badge on';
        } else if (mySlot.soc >= mySlot.targetSoc) {
          sBadge.textContent = 'Complete'; sBadge.className = 'status-badge on';
        } else {
          sBadge.textContent = 'Off'; sBadge.className = 'status-badge off-badge';
        }
      }
    }
  }

  function updateAdminLive() {
    let availCount = 0;
    let totalPower = 0;
    slots.forEach(s => {
      if (!s.occupied) { availCount++; return; }
      if (s.id === 3) return; // Slot 3 has 0 W power
      if (s.charging) totalPower += s.power;

      const socEl = $(`adminSoc${s.id}`);
      const powEl = $(`adminPow${s.id}`);
      const priEl = $(`adminPri${s.id}`);
      const barEl = $(`adminSocBar${s.id}`);
      if (socEl) socEl.textContent = `${Math.round(s.soc)}%`;
      if (powEl) powEl.textContent = `${s.power.toFixed(1)} W`;
      if (priEl) {
        priEl.textContent = s.priority;
        const badge = priEl.parentElement?.querySelector('.priority-badge');
        if (badge) updatePriorityBadgeEl(badge, s.priority);
      }
      if (barEl) {
        barEl.style.width = `${s.soc}%`;
        if (s.soc >= 30) barEl.classList.remove('low-fill'); else barEl.classList.add('low-fill');
      }
      updateGaugeEl(`adminGaugeFill${s.id}`, `adminGaugeVal${s.id}`, s.priority);
    });
    if ($('adminMetricSlots')) $('adminMetricSlots').textContent = `${availCount} / 3`;
    if ($('adminMetricPower')) $('adminMetricPower').textContent = `${totalPower.toFixed(1)} W`;
  }

  /* ============================================================
     PERIODIC ADMIN ALERTS
     ============================================================ */
  const alertPool = [
    { msg:'Dynamic power reallocation completed for Pad A & B', cls:'info-alert',     icon:'info' },
    { msg:'Wireless pad efficiency at 96% on active slots',      cls:'success-alert',  icon:'check_circle' },
    { msg:'Slot 3 vehicle presence detected by ultrasonic sensor', cls:'info-alert',     icon:'sensors' },
    { msg:'AI model recalculated priority scores for charging EV',cls:'priority-alert', icon:'priority_high' },
    { msg:'RFID authentication verified on smart gateway',       cls:'success-alert',  icon:'check_circle' },
    { msg:'Wireless transmitter coil thermals normal (Slot 1 & 2)', cls:'info-alert',   icon:'info' },
  ];

  setInterval(() => {
    if (!session || session.role !== 'admin') return;
    const a = alertPool[Math.floor(Math.random() * alertPool.length)];
    addAdminAlert(a.msg, a.cls, a.icon);
  }, 15000);

  setInterval(() => {
    if (!session || session.role !== 'admin') return;
    renderAdminLogs();
  }, 20000);

  /* ============================================================
     NOTIFICATION BUTTONS
     ============================================================ */
  if ($('userNotifBtn')) $('userNotifBtn').addEventListener('click', () => showToast('No new notifications.', 'info'));
  if ($('adminNotifBtn')) $('adminNotifBtn').addEventListener('click', () => showToast('System running normally. 2 Charging pads & 1 Parking bay active.', 'info'));

  /* ============================================================
     INITIALIZATION
     ============================================================ */
  function init() {
    // Load or initialize slots
    slots = loadSlots() || JSON.parse(JSON.stringify(DEFAULT_SLOTS));
    saveSlots();

    // Initial clock tick
    tickClock();

    // Restore session
    session = loadSession();
    if (session) {
      if (session.role === 'user') {
        enterUserPanel();
      } else if (session.role === 'admin') {
        enterAdminPanel();
      } else {
        showScreen('gateScreen');
      }
    } else {
      showScreen('gateScreen');
    }

    // Start simulation engine
    setInterval(simTick, 2000);

    // Initial admin logs
    setTimeout(() => { if (session && session.role === 'admin') renderAdminLogs(); }, 500);
  }

  init();
})();
