/* ============================================================
   AI Smart EV Wireless Charging — Application Logic
   Role-based access: User Panel + Admin Panel
   localStorage persistence keyed by email
   Client-side simulation engine
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     CONSTANTS & DEFAULTS
     ============================================================ */
  const ADMIN_EMAIL = 'admin@smartev.com';
  const ADMIN_KEY   = 'admin123';
  const SESSION_KEY = 'smartev_session';
  const SLOTS_KEY   = 'smartev_slots';
  const LOGS_KEY    = 'smartev_global_logs';

  const DEFAULT_SLOTS = [
    { id: 1, occupied: false, evId: null, userEmail: null, soc: 0, targetSoc: 80, power: 0, priority: 0, charging: false, departureTime: '18:30' },
    { id: 2, occupied: false, evId: null, userEmail: null, soc: 0, targetSoc: 80, power: 0, priority: 0, charging: false, departureTime: '18:30' },
    { id: 3, occupied: false, evId: null, userEmail: null, soc: 0, targetSoc: 80, power: 0, priority: 0, charging: false, departureTime: '18:30' },
  ];

  /* ============================================================
     STATE
     ============================================================ */
  let session    = null;   // { role: 'user'|'admin', email: string }
  let slots      = [];     // mutable copy of slot data
  let simRunning = true;
  let powerChart = null;
  let chartTick  = 0;

  // Track whether navigation has been wired for each panel
  // to prevent duplicate event listeners on re-entry
  let userNavWired  = false;
  let adminNavWired = false;

  /* ============================================================
     DOM HELPERS
     ============================================================ */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const toastContainer = $('toastContainer');

  function showToast(msg, type = 'info') {
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="material-icons-round">${icons[type]||'info'}</span><span>${msg}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => { t.classList.add('toast-exit'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  /* ============================================================
     LOCAL STORAGE HELPERS
     ============================================================ */
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function loadSession()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
  function clearSession()  { localStorage.removeItem(SESSION_KEY); }

  function saveSlots()  { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); }
  function loadSlots()  {
    try {
      const d = JSON.parse(localStorage.getItem(SLOTS_KEY));
      return (d && d.length === 3) ? d : null;
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
    screens.forEach(s => $(s).classList.remove('active'));
    panels.forEach(p => $(p).classList.remove('active'));
    const el = $(id);
    if (el) el.classList.add('active');
  }

  function showPanel(id) {
    screens.forEach(s => $(s).classList.remove('active'));
    panels.forEach(p => $(p).classList.remove('active'));
    $(id).classList.add('active');
  }

  /* ============================================================
     VIEW SWITCHING (within a panel)
     ============================================================ */
  const viewTitles = {
    'u-vehicle':'My Vehicle','u-book':'Book Slot','u-charging':'My Charging','u-history':'My History',
    'a-dashboard':'All Slots Dashboard','a-hardware':'Hardware Status','a-analytics':'System Analytics & Logs',
  };

  function switchView(viewId, panelPrefix) {
    const titleEl = panelPrefix === 'u' ? $('userTopTitle') : $('adminTopTitle');
    const panel   = panelPrefix === 'u' ? $('userPanel')    : $('adminPanel');
    panel.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    panel.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    panel.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));

    const target = $(viewId);
    if (target) { void target.offsetWidth; target.classList.add('active'); }
    panel.querySelectorAll(`.nav-item[data-view="${viewId}"]`).forEach(n => n.classList.add('active'));
    panel.querySelectorAll(`.bnav-item[data-view="${viewId}"]`).forEach(b => b.classList.add('active'));
    if (titleEl) titleEl.textContent = viewTitles[viewId] || '';
    closeSidebars();

    // Hooks — render content for the active view
    if (viewId === 'u-charging') renderUserCharging();
    if (viewId === 'u-book') renderUserSlotPicker();
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
  function openSidebar(sb)  { sb.classList.add('open'); $('sidebarOverlay').classList.add('show'); }
  function closeSidebars() {
    $$('.sidebar').forEach(s => s.classList.remove('open'));
    $('sidebarOverlay').classList.remove('show');
  }

  $('sidebarOverlay').addEventListener('click', closeSidebars);
  $('userHamburger').addEventListener('click', () => openSidebar($('userSidebar')));
  $('userSidebarClose').addEventListener('click', closeSidebars);
  $('adminHamburger').addEventListener('click', () => openSidebar($('adminSidebar')));
  $('adminSidebarClose').addEventListener('click', closeSidebars);

  /* ============================================================
     GATE SCREEN
     ============================================================ */
  $('gateUserBtn').addEventListener('click', () => showScreen('userLoginScreen'));
  $('gateAdminBtn').addEventListener('click', () => showScreen('adminLoginScreen'));
  $('userLoginBack').addEventListener('click', () => showScreen('gateScreen'));
  $('adminLoginBack').addEventListener('click', () => showScreen('gateScreen'));

  /* ============================================================
     USER LOGIN / REGISTER
     ============================================================ */
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

  /* ============================================================
     ADMIN LOGIN
     ============================================================ */
  $('adminLoginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('aEmail').value.trim().toLowerCase();
    const key   = $('aKey').value;
    if (email !== ADMIN_EMAIL || key !== ADMIN_KEY) {
      $('adminLoginError').textContent = 'Invalid admin credentials.';
      return;
    }
    $('adminLoginError').textContent = '';
    session = { role: 'admin', email };
    saveSession(session);
    enterAdminPanel();
    showToast('Welcome, Administrator.', 'success');
  });

  /* ============================================================
     ENTER PANELS
     ============================================================ */
  function enterUserPanel() {
    showPanel('userPanel');
    // Wire navigation only once to prevent duplicate listeners
    if (!userNavWired) {
      wireNavigation($('userPanel'), 'u');
      userNavWired = true;
    }
    const ud = getOrCreateUser(session.email);
    $('userAvatar').textContent = session.email.charAt(0).toUpperCase();
    $('userNameLabel').textContent = session.email.split('@')[0];
    $('userEmailLabel').textContent = session.email;
    populateVehicleForm(ud);
    switchView('u-vehicle', 'u');
  }

  function enterAdminPanel() {
    showPanel('adminPanel');
    // Wire navigation only once to prevent duplicate listeners
    if (!adminNavWired) {
      wireNavigation($('adminPanel'), 'a');
      adminNavWired = true;
    }
    $('adminEmailLabel').textContent = session.email;
    switchView('a-dashboard', 'a');
  }

  /* ============================================================
     LOGOUT
     ============================================================ */
  $('userLogoutBtn').addEventListener('click', () => { clearSession(); session = null; showScreen('gateScreen'); showToast('Logged out.','info'); });
  $('adminLogoutBtn').addEventListener('click', () => { clearSession(); session = null; showScreen('gateScreen'); showToast('Logged out.','info'); });

  /* ============================================================
     USER — VEHICLE MANAGEMENT
     ============================================================ */
  function populateVehicleForm(ud) {
    $('regVehicleId').value = ud.vehicleId || '';
    $('regModel').value     = ud.model || '';
    $('regRfid').value      = ud.rfid || '';
    updateVehicleBadge(ud);
  }

  function updateVehicleBadge(ud) {
    const badge = $('vehicleBadge');
    const rfidBadge = $('rfidStatusBadge');
    if (ud.rfidLinked && ud.vehicleId) {
      badge.textContent = 'Linked'; badge.className = 'vehicle-badge linked';
      rfidBadge.textContent = 'Active'; rfidBadge.className = 'rfid-status active-tag';
    } else {
      badge.textContent = 'Not Linked'; badge.className = 'vehicle-badge not-linked';
      rfidBadge.textContent = 'Inactive'; rfidBadge.className = 'rfid-status inactive-tag';
    }
  }

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

  /* ============================================================
     USER — SLOT BOOKING
     PRIVACY RULE: User sees only AVAILABLE slots — occupied slots
     show as "Unavailable" without revealing the other user's info.
     ============================================================ */
  let selectedSlot = null;

  function renderUserSlotPicker() {
    const container = $('userSlotPicker');
    container.innerHTML = '';

    // If user already has a booked slot, show a message instead
    if (session && session.role === 'user') {
      const existingSlot = slots.find(s => s.userEmail === session.email);
      if (existingSlot) {
        container.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--c-text-muted);">
            <span class="material-icons-round" style="font-size:40px;color:var(--c-accent);display:block;margin-bottom:8px;">event_busy</span>
            <h3 style="font-size:1.05rem;color:var(--c-text);margin-bottom:4px;">Slot Already Booked</h3>
            <p style="font-size:.88rem;">You have Slot ${existingSlot.id} booked. Go to <strong>"My Charging"</strong> to view status.</p>
          </div>`;
        return;
      }
    }

    slots.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'slot-btn';
      if (s.occupied) {
        // PRIVACY: Show as "Unavailable" — do NOT reveal the EV ID or user info
        btn.classList.add('occupied');
        btn.disabled = true;
        btn.innerHTML = `
          <div class="slot-num">Slot ${s.id}</div>
          <span class="material-icons-round slot-car-icon">directions_car</span>
          <div class="slot-status">Unavailable</div>
          <div class="slot-ev-label">—</div>`;
      } else {
        btn.classList.add('available');
        btn.innerHTML = `
          <div class="slot-num">Slot ${s.id}</div>
          <span class="material-icons-round slot-car-icon">local_parking</span>
          <div class="slot-status">AVAILABLE</div>
          <div class="slot-book-label">BOOK NOW</div>`;
        btn.addEventListener('click', () => {
          container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedSlot = s.id;
        });
        if (!selectedSlot || selectedSlot === s.id) {
          btn.classList.add('selected');
          selectedSlot = s.id;
        }
      }
      container.appendChild(btn);
    });
    // If no available slot selected
    const anyAvail = slots.some(s => !s.occupied);
    if (!anyAvail) selectedSlot = null;
  }

  /* Duration / SOC sliders */
  const uDurSlider = $('userDurationSlider');
  const uDurValue  = $('userDurationValue');
  const uSocSlider = $('userSocSlider');
  const uSocBubble = $('userSocBubble');
  const uSummary   = $('userBookingSummary');

  function updateUserBookingSummary() {
    uSummary.innerHTML = `Requesting charge to <strong>${uSocSlider.value}%</strong> with <strong>${uDurSlider.value} min</strong> departure target.`;
  }
  uDurSlider.addEventListener('input', () => { uDurValue.textContent = `${uDurSlider.value} min`; updateUserBookingSummary(); });
  uSocSlider.addEventListener('input', () => {
    const v = uSocSlider.value;
    uSocBubble.textContent = `${v}%`;
    const pct = (v - 10) / 90 * 100;
    uSocBubble.style.left = `calc(${pct}% + ${(8 - pct * 0.16)}px)`;
    updateUserBookingSummary();
  });
  // init bubble position
  (function () {
    const v = uSocSlider.value;
    const pct = (v - 10) / 90 * 100;
    uSocBubble.style.left = `calc(${pct}% + ${(8 - pct * 0.16)}px)`;
  })();

  $('userConfirmBooking').addEventListener('click', () => {
    if (!session || session.role !== 'user') return;
    const ud = getOrCreateUser(session.email);
    if (!ud.vehicleId) { showToast('Please set up your vehicle first.', 'error'); return; }
    if (!selectedSlot) { showToast('No slot available to book.', 'error'); return; }

    // Check if user already has a slot
    const existing = slots.find(s => s.userEmail === session.email);
    if (existing) { showToast('You already have a slot booked. Go to "My Charging".', 'error'); return; }

    const slot = slots.find(s => s.id === selectedSlot);
    if (!slot || slot.occupied) { showToast('Slot no longer available.', 'error'); return; }

    slot.occupied = true;
    slot.evId = ud.vehicleId;
    slot.userEmail = session.email;
    slot.soc = Math.floor(Math.random() * 15) + 5; // start with random low SOC
    slot.targetSoc = parseInt(uSocSlider.value);
    slot.power = 0;
    slot.priority = 0;
    slot.charging = true;
    slot.departureTime = $('userDepartureTime').value || '18:30';
    slot.bookedAt = Date.now();
    saveSlots();

    const btn = $('userConfirmBooking');
    btn.innerHTML = '<span class="material-icons-round">check_circle</span> BOOKING CONFIRMED';
    btn.style.background = 'linear-gradient(135deg,#2E7D32,#1B5E20)';
    btn.style.borderColor = '#66BB6A';
    btn.style.pointerEvents = 'none';
    showToast(`Slot ${slot.id} booked! Charging will begin.`, 'success');
    setTimeout(() => {
      btn.innerHTML = '<span class="material-icons-round">check_circle</span> CONFIRM BOOKING';
      btn.style.background = ''; btn.style.borderColor = ''; btn.style.pointerEvents = '';
      switchView('u-charging', 'u');
    }, 2000);
  });

  /* ============================================================
     USER — MY CHARGING (single slot only)
     PRIVACY RULE: Only shows the slot assigned to THIS user.
     If no slot booked, shows an empty state.
     ============================================================ */
  function renderUserCharging() {
    const container = $('userChargingContent');
    if (!session || session.role !== 'user') return;
    const mySlot = slots.find(s => s.userEmail === session.email);
    if (!mySlot) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <span class="material-icons-round">ev_station</span>
            <h3>No Active Slot</h3>
            <p>You haven't booked a charging slot yet.</p>
            <button class="btn btn-book-slot" id="goBookFromCharging"><span class="material-icons-round">event_available</span> Book a Slot</button>
          </div>
        </div>`;
      const goBtn = $('goBookFromCharging');
      if (goBtn) goBtn.addEventListener('click', () => switchView('u-book', 'u'));
      return;
    }

    // Determine charging status text & class
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

    container.innerHTML = `
      <div class="card dash-slot-card user-slot-card-single" id="userSlotCard">
        <div class="slot-card-header">
          <h3>SLOT ${mySlot.id}</h3>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="slot-card-body">
          <div class="slot-info-grid">
            <div class="info-item"><span class="info-label">EV ID</span><span class="info-value">${mySlot.evId}</span></div>
            <div class="info-item"><span class="info-label">Battery (SOC)</span><span class="info-value" id="userSlotSoc">${Math.round(mySlot.soc)}%</span></div>
            <div class="info-item"><span class="info-label">Power</span><span class="info-value" id="userSlotPower">${mySlot.power.toFixed(1)} W</span></div>
            <div class="info-item"><span class="info-label">AI Priority</span><span class="info-value"><span id="userSlotPriority">${mySlot.priority}</span> ${pBadge}</span></div>
            <div class="info-item"><span class="info-label">Target SOC</span><span class="info-value">${mySlot.targetSoc}%</span></div>
            <div class="info-item"><span class="info-label">Departure</span><span class="info-value">${mySlot.departureTime}</span></div>
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

    // Update gauge
    updateGaugeEl('userGaugeFill', 'userGaugeVal', mySlot.priority);

    $('userToggleCharging').addEventListener('click', () => {
      mySlot.charging = !mySlot.charging;
      saveSlots();
      renderUserCharging();
      showToast(mySlot.charging ? 'Charging started.' : 'Charging stopped.', mySlot.charging ? 'success' : 'error');
    });
  }

  /* ============================================================
     USER — HISTORY (filtered strictly for this logged-in email)
     ============================================================ */
  function renderUserHistory() {
    if (!session || session.role !== 'user') return;
    const ud = getOrCreateUser(session.email);
    const tbody = $('userLogsTbody');
    const empty = $('userLogsEmpty');
    tbody.innerHTML = '';
    if (!ud.logs || ud.logs.length === 0) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    ud.logs.slice().reverse().forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>Slot ${l.slot}</td><td>${l.date}</td><td>${l.duration}</td><td>${l.energy}</td><td>${l.peakSoc}%</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     ADMIN — ALL SLOTS DASHBOARD
     Shows all 3 physical parking slots simultaneously.
     ============================================================ */
  function renderAdminDashboard() {
    const grid = $('adminSlotsGrid');
    grid.innerHTML = '';
    let availCount = 0;
    let totalPower = 0;

    slots.forEach(s => {
      if (!s.occupied) availCount++;
      if (s.charging) totalPower += s.power;

      const card = document.createElement('div');
      card.className = 'card dash-slot-card';
      if (s.charging && s.soc < 30) card.classList.add('slot-active-card');

      if (!s.occupied) {
        card.innerHTML = `
          <div class="slot-card-header"><h3>SLOT ${s.id}</h3><span class="status-badge available-badge">AVAILABLE</span></div>
          <div class="slot-card-body available-body">
            <span class="material-icons-round empty-slot-icon">local_parking</span>
            <p>Slot is available for booking.</p>
          </div>`;
      } else {
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
          <div class="slot-card-header"><h3>SLOT ${s.id}</h3><span class="status-badge ${statusClass}">${statusText}</span></div>
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
      grid.appendChild(card);

      // Update gauge after appended
      if (s.occupied && s.priority >= 70) {
        setTimeout(() => updateGaugeEl(`adminGaugeFill${s.id}`, `adminGaugeVal${s.id}`, s.priority), 50);
      }
    });

    // Admin stop/start buttons for individual slots
    grid.querySelectorAll('[data-admin-stop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = parseInt(btn.dataset.adminStop);
        const slot = slots.find(s => s.id === sid);
        if (slot) {
          slot.charging = !slot.charging;
          saveSlots();
          renderAdminDashboard();
          showToast(slot.charging ? `Slot ${sid} charging started.` : `Slot ${sid} stopped.`, slot.charging ? 'success' : 'error');
          addAdminAlert(slot.charging ? `Slot ${sid} charging resumed by admin` : `Slot ${sid} emergency stopped by admin`, 'priority-alert', 'priority_high');
        }
      });
    });

    $('adminMetricSlots').textContent = `${availCount} / 3`;
    $('adminMetricPower').textContent = `${totalPower.toFixed(1)} kW`;
  }

  /* Emergency stop all */
  $('adminEmergencyStop').addEventListener('click', () => {
    slots.forEach(s => { if (s.charging) s.charging = false; });
    saveSlots();
    renderAdminDashboard();
    showToast('EMERGENCY STOP: All charging halted!', 'error');
    addAdminAlert('EMERGENCY STOP — all slots halted by admin', 'priority-alert', 'priority_high');
  });

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
     ADMIN — CHART
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
          { label:'Slot 1', data:d1, borderColor:'#8B4513', backgroundColor:'rgba(139,69,19,.06)', pointBackgroundColor:'#8B4513', pointBorderColor:'#FFF', pointBorderWidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension:.4 },
          { label:'Slot 2', data:d2, borderColor:'#A0522D', backgroundColor:'rgba(160,82,45,.06)', pointBackgroundColor:'#A0522D', pointBorderColor:'#FFF', pointBorderWidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension:.4 },
          { label:'Slot 3', data:d3, borderColor:'#DEB887', backgroundColor:'rgba(222,184,135,.1)', pointBackgroundColor:'#DEB887', pointBorderColor:'#FFF', pointBorderWidth:2, pointRadius:4, borderWidth:2.5, fill:true, tension:.4 },
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
    slots.forEach((s, i) => powerChart.data.datasets[i].data.push(s.charging ? s.power : 0));
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
      tr.innerHTML = `<td><span class="ev-tag">${l.evId}</span></td><td>Slot ${l.slot}</td><td>${l.user||'—'}</td><td>${l.duration}</td><td>${l.energy}</td>`;
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

  /* ============================================================
     SIMULATION ENGINE — ticks every 2 seconds
     ============================================================ */
  function simTick() {
    if (!simRunning) return;
    let changed = false;

    slots.forEach(s => {
      if (!s.occupied || !s.charging) return;
      changed = true;

      // SOC increase: faster when low, slower when high
      const rate = s.soc < 30 ? 0.9 : (s.soc < 60 ? 0.5 : 0.25);
      s.soc = Math.min(s.targetSoc, s.soc + rate);

      // Power: higher when SOC is low
      s.power = +(s.soc < 30 ? (3.5 + Math.random() * 2) : (1.5 + Math.random() * 1)).toFixed(1);

      // AI Priority: inversely proportional to SOC, proportional to urgency
      const socFactor = 1 - (s.soc / 100);
      const randomJitter = Math.random() * 4 - 2;
      s.priority = Math.max(5, Math.min(99, Math.round(socFactor * 95 + randomJitter)));

      // Reached target?
      if (s.soc >= s.targetSoc) {
        s.charging = false;
        s.power = 0;
        s.priority = 0;
        // Log
        const dur = s.bookedAt ? formatDuration(Date.now() - s.bookedAt) : '00:00';
        const energy = (Math.random() * 5 + 1).toFixed(2) + ' Wh';
        const logEntry = { slot: s.id, evId: s.evId, user: s.userEmail, date: new Date().toLocaleDateString(), duration: dur, energy, peakSoc: Math.round(s.soc) };
        // Global log
        const gLogs = loadGlobalLogs(); gLogs.push(logEntry); saveGlobalLogs(gLogs);
        // User log (filtered by email — stored under their key)
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

    // Update UI for whoever is logged in
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
    const mySlot = slots.find(s => s.userEmail === session.email);
    if (!mySlot) return;
    const socEl = $('userSlotSoc');
    const powEl = $('userSlotPower');
    const priEl = $('userSlotPriority');
    const barEl = $('userSlotSocBar');
    if (socEl) socEl.textContent = `${Math.round(mySlot.soc)}%`;
    if (powEl) powEl.textContent = `${mySlot.power.toFixed(1)} W`;
    if (priEl) {
      priEl.textContent = mySlot.priority;
      const badge = priEl.parentElement.querySelector('.priority-badge');
      if (badge) updatePriorityBadgeEl(badge, mySlot.priority);
    }
    if (barEl) {
      barEl.style.width = `${mySlot.soc}%`;
      if (mySlot.soc >= 30) barEl.classList.remove('low-fill'); else barEl.classList.add('low-fill');
    }
    updateGaugeEl('userGaugeFill', 'userGaugeVal', mySlot.priority);

    // Update status badge & button
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
      if (s.charging) totalPower += s.power;
      const socEl = $(`adminSoc${s.id}`);
      const powEl = $(`adminPow${s.id}`);
      const priEl = $(`adminPri${s.id}`);
      const barEl = $(`adminSocBar${s.id}`);
      if (socEl) socEl.textContent = `${Math.round(s.soc)}%`;
      if (powEl) powEl.textContent = `${s.power.toFixed(1)} W`;
      if (priEl) {
        priEl.textContent = s.priority;
        const badge = priEl.parentElement.querySelector('.priority-badge');
        if (badge) updatePriorityBadgeEl(badge, s.priority);
      }
      if (barEl) {
        barEl.style.width = `${s.soc}%`;
        if (s.soc >= 30) barEl.classList.remove('low-fill'); else barEl.classList.add('low-fill');
      }
      updateGaugeEl(`adminGaugeFill${s.id}`, `adminGaugeVal${s.id}`, s.priority);
    });
    $('adminMetricSlots').textContent = `${availCount} / 3`;
    $('adminMetricPower').textContent = `${totalPower.toFixed(1)} kW`;
  }

  function updatePriorityBadgeEl(badge, val) {
    if (val >= 80)      { badge.textContent = 'VERY HIGH'; badge.className = 'priority-badge very-high'; }
    else if (val >= 60) { badge.textContent = 'HIGH';      badge.className = 'priority-badge high'; }
    else if (val >= 35) { badge.textContent = 'MEDIUM';    badge.className = 'priority-badge medium'; }
    else                { badge.textContent = 'LOW';       badge.className = 'priority-badge low'; }
  }

  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  /* ============================================================
     PERIODIC ADMIN ALERTS
     ============================================================ */
  const alertPool = [
    { msg:'Dynamic power reallocation completed',   cls:'info-alert',     icon:'info' },
    { msg:'Wireless pad efficiency at 96%',          cls:'success-alert',  icon:'check_circle' },
    { msg:'AI model recalculated priority scores',   cls:'priority-alert', icon:'priority_high' },
    { msg:'RFID authentication cycle completed',     cls:'success-alert',  icon:'check_circle' },
    { msg:'Temperature within safe operating range', cls:'info-alert',     icon:'info' },
    { msg:'Predictive charging schedule updated',    cls:'priority-alert', icon:'priority_high' },
  ];

  setInterval(() => {
    if (!session || session.role !== 'admin') return;
    const a = alertPool[Math.floor(Math.random() * alertPool.length)];
    addAdminAlert(a.msg, a.cls, a.icon);
  }, 15000);

  /* Periodic admin log refresh */
  setInterval(() => {
    if (!session || session.role !== 'admin') return;
    renderAdminLogs();
  }, 20000);

  /* ============================================================
     NOTIFICATION BUTTONS
     ============================================================ */
  $('userNotifBtn').addEventListener('click', () => showToast('No new notifications.', 'info'));
  $('adminNotifBtn').addEventListener('click', () => showToast('System running normally.', 'info'));

  /* ============================================================
     INITIALIZATION
     ============================================================ */
  function init() {
    // Load or create slots
    slots = loadSlots() || JSON.parse(JSON.stringify(DEFAULT_SLOTS));
    saveSlots();

    // Restore session (state persistence across browser refresh)
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

    // Start simulation
    setInterval(simTick, 2000);

    // Admin logs initial render
    setTimeout(() => { if (session && session.role === 'admin') renderAdminLogs(); }, 500);
  }

  init();
})();
