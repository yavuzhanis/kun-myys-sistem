
async function getEnrollmentById(id) {
  if (state.enrollments && Array.isArray(state.enrollments)) {
    const found = state.enrollments.find((e) => e.id === id);
    if (found) return found;
  }
  try {
    const data = await api("/api/enrollments");
    state.enrollments = data.enrollments || [];
    return state.enrollments.find((e) => e.id === id);
  } catch {
    return null;
  }
}

async function getProgramById(id) {
  if (state.programs && Array.isArray(state.programs)) {
    const found = state.programs.find((p) => p.id === id);
    if (found) return found;
  }
  try {
    const data = await api("/api/programs");
    state.programs = data.programs || [];
    return state.programs.find((p) => p.id === id);
  } catch {
    return null;
  }
}

function exportTableToCsv(filename, headers, rows) {
  const processCell = (cell) => {
    let text = String(cell ?? "").replace(/"/g, "''");
    return `"${text}"`;
  };
  const csvContent = "\uFEFF" + [
    headers.map(processCell).join(";"),
    ...rows.map((row) => row.map(processCell).join(";"))
  ].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  toast(`${filename} CSV olarak indirildi.`);
}
const state = {
  user: null,
  csrf: null,
  view: 'dashboard',
  programs: [],
  offerings: [],
  enrollments: [],
  unreadCount: 0
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const content = $('#content');

const roleLabels = {
  ADMIN: 'Sistem Yöneticisi',
  COORDINATOR: 'Program Koordinatörü',
  UNIT_BOARD: 'Akademik Birim Kurulu',
  COMMISSION: 'Mikro Yeterlilik Komisyonu',
  SENATE: 'Senato Sekretaryası',
  EVALUATOR: 'Ölçme ve Değerlendirme',
  QUALITY: 'Kalite Güvencesi',
  STUDENT: 'Öğrenen'
};

const statusLabels = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Birim Kurulunda',
  UNIT_APPROVED: 'Komisyonda',
  COMMISSION_APPROVED: 'Senatoda',
  SENATE_APPROVED: 'Senato Onaylı',
  REJECTED: 'Revizyon İstendi',
  ARCHIVED: 'Arşiv',
  OPEN: 'Kayıt Açık',
  RUNNING: 'Devam Ediyor',
  ACTIVE: 'Aktif',
  UNDER_REVIEW: 'İnceleniyor',
  REVOKED: 'İptal Edildi',
  VALID: 'Geçerli',
  COMPLETED: 'Tamamlandı',
  FAILED: 'Başarısız',
  DROPPED: 'Ayrıldı',
  CANCELLED: 'İptal',
  APPROVED: 'Uygun Bulundu',
  RESOLVED: 'Çözümlendi'
};

const roleCan = (...roles) => state.user?.role === 'ADMIN' || roles.includes(state.user?.role);

function esc(value = '') {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function fmtDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {})
  }).format(date);
}

function number(value, digits = 0) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number(value || 0));
}

function initials(name = '') {
  return String(name || '').split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'KÜN';
}

function statusPill(status) {
  const cls = ['SENATE_APPROVED', 'APPROVED', 'VALID', 'COMPLETED', 'RESOLVED'].includes(status) ? 'green'
    : ['REJECTED', 'REVOKED', 'FAILED', 'CANCELLED'].includes(status) ? 'red'
      : ['DRAFT', 'ARCHIVED', 'DROPPED'].includes(status) ? 'gray'
        : ['SUBMITTED', 'UNDER_REVIEW'].includes(status) ? 'orange' : 'blue';
  
  return `<span class="pill pill--${cls}">${esc(statusLabels[status] || status)}</span>`;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '×' : 'i';
  el.innerHTML = `<span style="font-weight:800">${icon}</span> <span>${esc(message)}</span>`;
  $('#toast-region').append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'all 0.25s ease';
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

function loading() {
  content.innerHTML = '<div class="loading"><div><div class="spinner"></div><div>Veriler yükleniyor…</div></div></div>';
}

async function api(url, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };
  if (options.body && typeof options.body !== 'string') {
    config.body = JSON.stringify(options.body);
    config.headers['Content-Type'] = 'application/json';
  }
  if (state.csrf && !['GET', 'HEAD'].includes(config.method || 'GET')) {
    config.headers['X-CSRF-Token'] = state.csrf;
  }
  const response = await fetch(url, config);
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = { message: 'Sunucu yanıtı okunamadı.' };
  }
  if (!response.ok) {
    if (response.status === 401 && state.user) showLogin();
    const error = new Error(payload.message || 'İşlem tamamlanamadı.');
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function modal(title, eyebrow, body) {
  $('#modal-title').textContent = title;
  $('#modal-eyebrow').textContent = eyebrow;
  $('#modal-body').innerHTML = body;
  const m = $('#modal');
  m.hidden = false;
  m.style.display = 'grid';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const m = $('#modal');
  m.hidden = true;
  m.style.display = 'none';
  document.body.style.overflow = '';
}

function pageHead(title, description, actions = '') {
  return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}

function empty(icon, title, description) {
  return `<div class="empty-state"><div style="font-size:2rem;margin-bottom:6px">${icon}</div><strong>${esc(title)}</strong><span>${esc(description)}</span></div>`;
}

const nav = [
  { section: 'YÖNETİM' },
  { id: 'dashboard', icon: '◫', label: 'Genel Bakış' },
  { id: 'notifications', icon: '●', label: 'Bildirimler' },
  { id: 'users', icon: '◎', label: 'Kullanıcı ve Roller', roles: ['ADMIN'] },
  { id: 'programs', icon: '◇', label: 'Program Tasarımı', roles: ['ADMIN', 'COORDINATOR', 'UNIT_BOARD', 'COMMISSION', 'SENATE', 'EVALUATOR', 'QUALITY'] },
  { id: 'approvals', icon: '✓', label: 'Onay İş Akışları', roles: ['ADMIN', 'UNIT_BOARD', 'COMMISSION', 'SENATE', 'COORDINATOR'] },
  { section: 'EĞİTİM OPERASYONU' },
  { id: 'offerings', icon: '□', label: 'Eğitimler ve Kontenjan' },
  { id: 'enrollments', icon: '◉', label: 'Öğrenenler ve Başarı' },
  { id: 'recognitions', icon: '↔', label: 'Dış Kazanım Tanıma' },
  { id: 'appeals', icon: '!', label: 'İtiraz Yönetimi', roles: ['ADMIN', 'STUDENT', 'QUALITY', 'COMMISSION'] },
  { section: 'BELGE VE KALİTE' },
  { id: 'credentials', icon: '♢', label: 'Dijital Belgeler' },
  { id: 'verification', icon: '⌕', label: 'Belge Doğrulama' },
  { id: 'quality', icon: '◌', label: 'Kalite Göstergeleri', roles: ['ADMIN', 'QUALITY'] },
  { id: 'audit', icon: '≡', label: 'Denetim İzi', roles: ['ADMIN', 'QUALITY'] }
];

async function updateNotificationBadge() {
  try {
    const { unread } = await api('/api/notifications');
    state.unreadCount = unread || 0;
    const notifBtn = $(`button[data-view="notifications"]`);
    if (notifBtn) {
      const existingBadge = notifBtn.querySelector('.badge');
      if (unread > 0) {
        if (!existingBadge) {
          notifBtn.insertAdjacentHTML('beforeend', `<span class="badge" style="margin-left:auto;background:var(--gold);color:#fff;padding:2px 7px;border-radius:10px;font-size:0.65rem;font-weight:800">${unread}</span>`);
        } else {
          existingBadge.textContent = unread;
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    }
  } catch {}
}

const ROLE_SLUGS = {
  ADMIN: "admin",
  COORDINATOR: "koordinator",
  UNIT_BOARD: "birim",
  COMMISSION: "komisyon",
  SENATE: "senato",
  EVALUATOR: "degerlendirici",
  QUALITY: "kalite",
  STUDENT: "ogrenci"
};

const SLUG_TO_ROLE = {
  admin: "ADMIN",
  koordinator: "COORDINATOR",
  coordinator: "COORDINATOR",
  birim: "UNIT_BOARD",
  "birim-kurulu": "UNIT_BOARD",
  komisyon: "COMMISSION",
  commission: "COMMISSION",
  senato: "SENATE",
  senate: "SENATE",
  degerlendirici: "EVALUATOR",
  evaluator: "EVALUATOR",
  kalite: "QUALITY",
  quality: "QUALITY",
  ogrenci: "STUDENT",
  student: "STUDENT"
};

const VIEW_SLUGS = {
  dashboard: "genel-bakis",
  notifications: "bildirimler",
  users: "kullanicilar",
  programs: "programlar",
  approvals: "onaylar",
  offerings: "egitimler",
  enrollments: "ogrenenler",
  recognitions: "tanima",
  appeals: "itirazlar",
  credentials: "belgeler",
  verification: "dogrulama",
  quality: "kalite-gostergeleri",
  audit: "denetim-izi"
};

const SLUG_TO_VIEW = {
  "genel-bakis": "dashboard",
  dashboard: "dashboard",
  bildirimler: "notifications",
  notifications: "notifications",
  kullanicilar: "users",
  users: "users",
  programlar: "programs",
  programs: "programs",
  onaylar: "approvals",
  approvals: "approvals",
  egitimler: "offerings",
  offerings: "offerings",
  ogrenenler: "enrollments",
  enrollments: "enrollments",
  tanima: "recognitions",
  recognitions: "recognitions",
  itirazlar: "appeals",
  appeals: "appeals",
  belgeler: "credentials",
  credentials: "credentials",
  dogrulama: "verification",
  verification: "verification",
  "kalite-gostergeleri": "quality",
  kalite: "quality",
  quality: "quality",
  "denetim-izi": "audit",
  audit: "audit"
};

function getPathForState(role, view) {
  const baseSlug = ROLE_SLUGS[role] || "admin";
  if (!view || view === "dashboard") {
    return `/${baseSlug}`;
  }
  const viewSlug = VIEW_SLUGS[view] || view;
  return `/${baseSlug}/${viewSlug}`;
}

function resolveRouteFromPath(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (!clean) return { isPortal: false };
  const parts = clean.split("/");
  const first = parts[0].toLowerCase();
  const second = parts[1] ? parts[1].toLowerCase() : null;

  const role = SLUG_TO_ROLE[first] || null;
  if (!role) return { isPortal: false };

  const view = second ? (SLUG_TO_VIEW[second] || second) : "dashboard";
  return { isPortal: true, role, view, baseSlug: first };
}

function setupApp(initialView = null, updateHistory = true) {
  const landingPage = document.getElementById("landing-page");
  const loginModal = document.getElementById("login-modal");
  const appShell = document.getElementById("app");
  
  if (landingPage) {
    landingPage.hidden = true;
    landingPage.style.display = "none";
  }
  if (loginModal) {
    loginModal.hidden = true;
    loginModal.style.display = "none";
  }
  if (appShell) {
    appShell.hidden = false;
    appShell.style.display = "grid";
    appShell.classList.remove("public-mode");
  }

  const nameEl = document.getElementById("user-name");
  const roleEl = document.getElementById("user-role");
  const initialsEl = document.getElementById("user-initials");
  const todayEl = document.getElementById("today");
  const navEl = document.getElementById("navigation");

  if (nameEl) nameEl.textContent = state.user.full_name;
  if (roleEl) roleEl.textContent = roleLabels[state.user.role] || state.user.role;
  if (initialsEl) initialsEl.textContent = initials(state.user.full_name);
  if (todayEl) todayEl.textContent = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date());
  
  if (navEl) {
    navEl.innerHTML = nav.filter((item) => !item.roles || roleCan(...item.roles)).map((item) => item.section
      ? `<div class="nav-section">${item.section}</div>`
      : `<button class="nav-link ${state.view === item.id ? "active" : ""}" data-view="${item.id}" type="button"><span>${item.icon}</span><span>${item.label}</span></button>`).join("");
  }

  const targetView = initialView || state.view || "dashboard";
  navigate(targetView, updateHistory);
  updateNotificationBadge();
  const roleSelect = document.getElementById("quick-role-select");
  if (roleSelect && state.user) {
    const roleToPrefix = {
      ADMIN: "admin",
      COORDINATOR: "koordinator",
      UNIT_BOARD: "birim",
      COMMISSION: "komisyon",
      SENATE: "senato",
      EVALUATOR: "degerlendirici",
      QUALITY: "kalite",
      STUDENT: "ogrenci"
    };
    roleSelect.value = roleToPrefix[state.user.role] || "admin";
  }
}

function showLogin(updateHistory = true) {
  state.user = null;
  state.csrf = null;
  const landingPage = document.getElementById("landing-page");
  const loginModal = document.getElementById("login-modal");
  const appShell = document.getElementById("app");
  
  if (appShell) {
    appShell.hidden = true;
    appShell.style.display = "none";
  }
  if (loginModal) {
    loginModal.hidden = true;
    loginModal.style.display = "none";
  }
  if (landingPage) {
    landingPage.hidden = false;
    landingPage.style.display = "block";
  }
  if (updateHistory && location.pathname !== "/" && !location.pathname.startsWith("/verify") && location.pathname !== "/catalog") {
    history.pushState(null, "", "/");
  }
  initLandingPage();
}

async function navigate(view, pushHistory = true) {
  state.view = view;
  $$('.nav-link[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const item = nav.find((entry) => entry.id === view);
  $('#page-title').textContent = item?.label || 'KÜN-MYYS';
  $('#breadcrumb').textContent = `KÜN-MYYS / ${(item?.label || '').toUpperCase()}`;
  
  $('.sidebar').classList.remove('open');
  $('#sidebar-backdrop')?.classList.remove('active');
  
  if (pushHistory && state.user) {
    const targetPath = getPathForState(state.user.role, view);
    if (location.pathname !== targetPath) {
      history.pushState({ view, role: state.user.role }, "", targetPath);
    }
  }

  loading();
  try {
    const renderers = {
      dashboard: renderDashboard,
      notifications: renderNotifications,
      users: renderUsers,
      programs: renderPrograms,
      approvals: renderApprovals,
      offerings: renderOfferings,
      enrollments: renderEnrollments,
      recognitions: renderRecognitions,
      appeals: renderAppeals,
      credentials: renderCredentials,
      verification: renderVerification,
      quality: renderQuality,
      audit: renderAudit
    };
    await (renderers[view] || renderDashboard)();
  } catch (error) {
    content.innerHTML = `<div class="callout callout--warning"><span>!</span><div><strong>İçerik yüklenemedi</strong><p style="margin:4px 0 0">${esc(error.message)}</p></div></div>`;
  }
}

// 1. GENEL BAKIŞ
async function renderDashboard() {
  const role = state.user?.role || "ADMIN";
  const [data, programsData, offeringsData, enrollmentsData, credentialsData] = await Promise.all([
    api("/api/dashboard"),
    api("/api/programs"),
    api("/api/offerings"),
    api("/api/enrollments"),
    api("/api/credentials")
  ]);
  const k = data.kpis;
  const programs = programsData.programs || [];
  const offerings = offeringsData.offerings || [];
  const enrollments = enrollmentsData.enrollments || [];
  const credentials = credentialsData.credentials || [];

  // 1. ÖĞRENCİ DASHBOARD
  if (role === "STUDENT") {
    const myEnrollments = enrollments;
    const myCredentials = credentials;
    const avgAttendance = myEnrollments.length ? (myEnrollments.reduce((sum, e) => sum + (e.attendance_rate || 0), 0) / myEnrollments.length).toFixed(1) : 0;
    const completedCount = myEnrollments.filter(e => e.status === "COMPLETED").length;

    content.innerHTML = pageHead("Öğrenen Çalışma Alanı", "Kayıtlı olduğunuz eğitimler, devam/başarı durumunuz ve dijital mikro yeterlilik belgeleriniz.") + `
      <div class="kpi-grid">
        ${kpi("◉", myEnrollments.length, "Kayıtlı Eğitimlerim", "--blue", "--blue-soft")}
        ${kpi("✓", completedCount, "Tamamlanan Program", "--green", "--green-soft")}
        ${kpi("♢", myCredentials.length, "Kazanılan Dijital Belge", "--gold", "--gold-soft")}
        ${kpi("%", `%${avgAttendance}`, "Ortalama Devam", "--wine", "--wine-soft")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head">
            <h3>Eğitimlerim ve Başarı Durumu</h3>
            <button class="button button--ghost button--small" data-go="enrollments">Tüm Detaylar →</button>
          </div>
          <div class="table-wrap">
            ${myEnrollments.length ? `
              <table class="data-table">
                <thead><tr><th>Eğitim Programı</th><th>Devam</th><th>Not / Harf</th><th>Durum</th><th></th></tr></thead>
                <tbody>
                  ${myEnrollments.map(e => `
                    <tr>
                      <td><strong>${esc(e.program_title)}</strong></td>
                      <td><strong>%${e.attendance_rate}</strong></td>
                      <td>${e.final_score != null ? `<strong>${e.final_score}</strong> (${esc(e.letter_grade || "—")})` : "—"}</td>
                      <td>${statusPill(e.status)}</td>
                      <td>
                        ${e.status === "COMPLETED" ? `<button class="button button--secondary button--small" data-go="credentials">📜 Belgeyi Gör</button>` : `<button class="button button--secondary button--small" data-feedback="${e.id}">★ Geri Bildirim</button>`}
                      </td>
                    </tr>`).join("")}
                </tbody>
              </table>` : empty("◉", "Henüz bir eğitime kayıtlı değilsiniz", "Katalogdan açık programları inceleyerek kayıt olabilirsiniz.")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h3>Kazanılan Dijital Belgelerim</h3>
            <button class="button button--ghost button--small" data-go="credentials">Tüm Belgeler →</button>
          </div>
          <div class="panel-body">
            ${myCredentials.length ? `
              <div class="status-list">
                ${myCredentials.map(c => `
                  <div class="program-summary" style="margin-bottom:12px">
                    <span class="pill pill--green">✓ Ed25519 Onaylı</span>
                    <strong style="display:block;margin-top:6px;font-size:0.95rem">${esc(c.program_title)}</strong>
                    <small class="code" style="margin:4px 0">${esc(c.certificate_number)}</small>
                    <div style="margin-top:10px;display:flex;gap:8px">
                      <button type="button" class="button button--secondary button--small" data-view-cert="${c.id}" data-title="${esc(c.certificate_number)}">📜 Görünüm</button>
                      <button class="button button--primary button--small" data-verify="${esc(c.verification_code)}">🔍 Doğrula</button>
                    </div>
                  </div>`).join("")}
              </div>` : empty("♢", "Henüz dijital belgeniz bulunmuyor", "Eğitiminizi tamamlayıp başarılı olduğunuzda dijital belgeniz burada listelenecektir.")}
          </div>
        </section>
      </div>`;
    return;
  }

  // 2. KOORDİNATÖR DASHBOARD
  if (role === "COORDINATOR") {
    const myPrograms = programs.filter(p => p.created_by === state.user.id || role === "ADMIN");
    const pendingPrograms = myPrograms.filter(p => ["SUBMITTED", "UNIT_APPROVED", "COMMISSION_APPROVED"].includes(p.status));
    const approvedPrograms = myPrograms.filter(p => p.status === "SENATE_APPROVED");

    content.innerHTML = pageHead(
      "Program Koordinatörü Çalışma Alanı",
      "Tasarladığınız mikro yeterlilikler, onay iş akışları ve aktif eğitim dönemleriniz.",
      `<button class="button button--primary" data-go="programs">+ Yeni Program Tasarla</button>`
    ) + `
      <div class="kpi-grid">
        ${kpi("◇", myPrograms.length, "Tasarlanan Program", "--wine", "--wine-soft")}
        ${kpi("⏱", pendingPrograms.length, "Onay Bekleyen", "--orange", "--orange-soft")}
        ${kpi("✓", approvedPrograms.length, "Senato Onaylı", "--green", "--green-soft")}
        ${kpi("□", offerings.length, "Açık Eğitim Dönemi", "--blue", "--blue-soft")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head">
            <h3>Programlarım ve Onay Durumu</h3>
            <button class="button button--ghost button--small" data-go="programs">Tüm Programlar →</button>
          </div>
          <div class="table-wrap">${programTable(myPrograms.slice(0, 5))}</div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h3>Eğitim Dönemleri ve Kontenjan</h3>
            <button class="button button--ghost button--small" data-go="offerings">Tüm Eğitimler →</button>
          </div>
          <div class="panel-body status-list">
            ${offerings.length ? offerings.slice(0, 4).map(o => `
              <div class="status-item">
                <span><strong>${esc(o.program_title)}</strong><br><small style="color:var(--muted)">${esc(o.code)} · ${o.enrolled_count}/${o.quota} Öğrenen</small></span>
                <span>${statusPill(o.status)}</span>
                <div class="progress"><span style="width:${Math.min(100, (o.enrolled_count / o.quota) * 100)}%"></span></div>
              </div>`).join("") : empty("□", "Açık dönem bulunmuyor", "Senato onaylı programlar için yeni eğitim açabilirsiniz.")}
          </div>
        </section>
      </div>`;
    return;
  }

  // 3. ONAY MAKAMLARI (BİRİM KURULU, KOMİSYON, SENATO)
  if (["UNIT_BOARD", "COMMISSION", "SENATE"].includes(role)) {
    const requiredStatus = { UNIT_BOARD: "SUBMITTED", COMMISSION: "UNIT_APPROVED", SENATE: "COMMISSION_APPROVED" }[role];
    const pendingQueue = programs.filter(p => p.status === requiredStatus);
    const approvedByMe = programs.filter(p => p.status === "SENATE_APPROVED");

    content.innerHTML = pageHead(
      `${roleLabels[role]} Onay Masası`,
      "Mevzuat ve içerik incelemesi bekleyen mikro yeterlilik program teklifleri (30 günlük yasal SLA takipli)."
    ) + `
      <div class="kpi-grid">
        ${kpi("⏱", pendingQueue.length, "Kararınızı Bekleyen", "--orange", "--orange-soft")}
        ${kpi("✓", approvedByMe.length, "Nihai Senato Onaylı", "--green", "--green-soft")}
        ${kpi("◇", programs.length, "Toplam Program", "--wine", "--wine-soft")}
        ${kpi("!", k.overdue || 0, "SLA Geciken", "--red", "--red-soft")}
      </div>
      <div class="callout callout--info" style="margin-bottom:20px">
        <span>⏱</span>
        <div>
          <strong>30 Takvim Günü Yasal Karar Süresi</strong>
          Yetkiniz dahilindeki program tekliflerini inceleyip karar bağlamanız için kurumsal SLA sayacı devrededir.
        </div>
      </div>
      <section class="panel">
        <div class="panel-head">
          <h3>Onay Kuyruğundaki Programlar</h3>
          <small>${pendingQueue.length} dosya bekliyor</small>
        </div>
        <div class="table-wrap">${programTable(pendingQueue, true)}</div>
      </section>`;
    return;
  }

  // 4. DEĞERLENDİRİCİ DASHBOARD
  if (role === "EVALUATOR") {
    const pendingGrading = enrollments.filter(e => e.final_score == null);
    const graded = enrollments.filter(e => e.final_score != null);

    content.innerHTML = pageHead(
      "Ölçme ve Değerlendirme Masası",
      "Öğrenme çıktısı değerlendirmeleri, sınav/proje not girişleri ve kanıt doğrulama zinciri."
    ) + `
      <div class="kpi-grid">
        ${kpi("◉", enrollments.length, "Toplam Öğrenen", "--blue", "--blue-soft")}
        ${kpi("⏱", pendingGrading.length, "Not Bekleyen", "--orange", "--orange-soft")}
        ${kpi("✓", graded.length, "Değerlendirilen", "--green", "--green-soft")}
        ${kpi("📁", enrollments.reduce((s, e) => s + (e.evidence_count || 0), 0), "Doğrulanan Kanıt", "--wine", "--wine-soft")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head">
            <h3>Değerlendirme ve Not Girişi</h3>
            <button class="button button--ghost button--small" data-go="enrollments">Tüm Kayıtlar →</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Öğrenen</th><th>Program</th><th>Devam</th><th>İşlem</th></tr></thead>
              <tbody>
                ${enrollments.slice(0, 6).map(e => `
                  <tr>
                    <td><strong>${esc(e.learner_name)}</strong><br><small>${esc(e.learner_email)}</small></td>
                    <td>${esc(e.program_title)}</td>
                    <td>%${e.attendance_rate}</td>
                    <td>
                      <button class="button button--secondary button--small" data-result="${e.id}">Not Gir</button>
                      <button class="button button--secondary button--small" data-evidence="${e.id}">+ Kanıt</button>
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Değerlendirme İlkeleri</h3></div>
          <div class="panel-body">
            <div class="callout callout--info">
              <span>🔒</span>
              <div>
                <strong>Kanıt Temelli Ölçme</strong><br>
                Her öğrenme çıktısı için rubrik puanı ve doğrulama kanıtı sisteme yüklendiğinde SHA-256 kriptografik özetiyle mühürlenir.
              </div>
            </div>
          </div>
        </section>
      </div>`;
    return;
  }

  // 5. KALİTE GÜVENCESİ DASHBOARD
  if (role === "QUALITY") {
    const qData = await api("/api/quality");
    const s = qData.stats;
    content.innerHTML = pageHead(
      "Kalite Güvencesi ve Akreditasyon İzleme",
      "YÖKAK ölçütleri, öğrenen memnuniyeti, SLA performansı ve değişmez denetim güvencesi."
    ) + `
      <div class="kpi-grid">
        ${kpi("✓", `%${number(s.completion_rate, 1)}`, "Tamamlama Oranı", "--green", "--green-soft")}
        ${kpi("★", `${number(s.avg_feedback, 2)} / 5`, "Öğrenen Memnuniyeti", "--gold", "--gold-soft")}
        ${kpi("⏱", s.overdue_programs || 0, "Geciken SLA", s.overdue_programs ? "--red" : "--green", s.overdue_programs ? "--red-soft" : "--green-soft")}
        ${kpi("🔒", qData.auditIntegrity?.checked || 0, "Doğrulanan Denetim İzi", "--wine", "--wine-soft")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h3>Kalite ve Akreditasyon Göstergeleri</h3></div>
          <div class="panel-body quality-hero">
            <div class="metric-ring" style="--value:${s.completion_rate}">
              <strong>%${number(s.completion_rate, 1)}</strong>
            </div>
            <div class="quality-copy">
              <h3>Öğrenen Başarısı ve Memnuniyeti</h3>
              <p>Öğrenen memnuniyeti 5 üzerinden <strong>${number(s.avg_feedback, 2)}</strong>, program tamamlama oranı ise <strong>%${number(s.completion_rate, 1)}</strong> seviyesindedir.</p>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Denetim İzi Güvencesi</h3></div>
          <div class="panel-body">
            <div class="callout ${qData.auditIntegrity.valid ? "callout--success" : "callout--warning"}">
              <span>${qData.auditIntegrity.valid ? "🔒" : "!"}</span>
              <div>
                <strong>SHA-256 Kriptografik Denetim Zinciri Tam Geçerli</strong><br>
                ${qData.auditIntegrity.checked} adet akademik işlem kaydı bütünlük kontrolünden geçmiştir.
              </div>
            </div>
          </div>
        </section>
      </div>`;
    return;
  }

  // 6. YÖNETİCİ (ADMIN) GENEL BAKIŞ
  const total = Math.max(1, k.programs);
  content.innerHTML = pageHead("Kurumsal Yönetim Masası", "Tüm program, onay, öğrenen, belge ve denetim zincirinin genel görünümü.") + `
    <div class="kpi-grid">
      ${kpi("◇", k.programs, "Toplam Mikro Yeterlilik", "--wine", "--wine-soft")}
      ${kpi("✓", k.approvedPrograms, "Senato Onaylı Program", "--green", "--green-soft")}
      ${kpi("◉", k.learners, "Kayıtlı Öğrenen", "--blue", "--blue-soft")}
      ${kpi("♢", k.credentials, "Geçerli Dijital Belge", "--gold", "--gold-soft")}
    </div>
    ${k.overdue ? `<div class="callout callout--warning" style="margin-bottom:20px"><span>⏱</span><div><strong>${k.overdue} programda 30 günlük yasal karar süresi aşıldı!</strong>İlgili karar makamının onay kuyruğunu ivedilikle kontrol edin.</div></div>` : ""}
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head">
          <h3>Son Güncellenen Programlar</h3>
          <button class="button button--ghost button--small" data-go="programs">Tümünü gör →</button>
        </div>
        <div class="table-wrap">${programTable(data.recent)}</div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h3>Program Durum Dağılımı</h3>
          <small>${k.programs} program</small>
        </div>
        <div class="panel-body status-list">
          ${Object.entries(statusLabels).filter(([key]) => ["DRAFT", "SUBMITTED", "UNIT_APPROVED", "COMMISSION_APPROVED", "SENATE_APPROVED", "REJECTED"].includes(key)).map(([status, label]) => {
            const count = Number(data.programStatuses[status] || 0);
            return `<div class="status-item"><span>${label}</span><strong>${count}</strong><div class="progress"><span style="width:${(count / total) * 100}%"></span></div></div>`;
          }).join("")}
        </div>
      </section>
    </div>`;
}

// 2. BİLDİRİMLER
async function renderNotifications() {
  const { notifications, unread } = await api('/api/notifications');
  state.unreadCount = unread;
  
  content.innerHTML = pageHead(
    'Bildirimler',
    'Onay, sonuç, belge ve itiraz süreçlerinizden gelen güncellemeler.',
    unread ? '<button class="button button--secondary button--small" id="read-all">✓ Tümünü okundu işaretle</button>' : ''
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Gelen kutusu</h3>
        <small>${unread} okunmamış</small>
      </div>
      <div class="panel-body">
        ${notifications.length ? `<div class="status-list">${notifications.map((item) => `
          <div class="callout ${item.is_read ? 'callout--info' : 'callout--success'}">
            <span>${item.is_read ? '•' : '●'}</span>
            <div style="flex:1">
              <strong>${esc(item.title)}</strong>
              <div>${esc(item.message)}</div>
              <small style="display:block;margin-top:6px;opacity:0.75">${fmtDate(item.created_at, true)}</small>
            </div>
          </div>`).join('')}</div>` : empty('●', 'Bildirim bulunmuyor', 'Yeni bir süreç başladığında bildirimleriniz burada listelenecektir.')}
      </div>
    </section>`;
    
  $('#read-all')?.addEventListener('click', async () => {
    await api('/api/notifications/read-all', { method: 'PATCH' });
    toast('Tüm bildirimler okundu.');
    updateNotificationBadge();
    navigate('notifications');
  });
}

// 3. KULLANICILAR VE ROLLER
async function renderUsers() {
  const data = await api('/api/users');
  content.innerHTML = pageHead(
    'Kullanıcı ve roller',
    'KÜN-MYYS erişim hesaplarını, akademik görevleri ve aktiflik durumunu yönetin.',
    '<button class="button button--primary" id="new-user">+ Yeni kullanıcı ekle</button>'
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Yetkili hesaplar</h3>
        <small>${data.users.length} kullanıcı</small>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ad soyad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Birim</th>
              <th>Durum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map((u) => `
              <tr>
                <td><strong>${esc(u.full_name)}</strong></td>
                <td>${esc(u.email)}</td>
                <td><span class="pill pill--wine">${esc(roleLabels[u.role] || u.role)}</span></td>
                <td>${esc(u.unit_name || '—')}</td>
                <td>${u.is_active ? statusPill('VALID') : statusPill('REVOKED')}</td>
                <td class="actions-cell">
                  <button class="button button--secondary button--small" data-user="${u.id}">Düzenle</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;

  $('#new-user')?.addEventListener('click', () => userForm(data.roles));
  $$('[data-user]').forEach((button) => button.addEventListener('click', () => {
    userForm(data.roles, data.users.find((u) => u.id === button.dataset.user));
  }));
}

function userForm(roles, user = null) {
  modal(user ? 'Kullanıcıyı güncelle' : 'Yeni kullanıcı ekle', 'ERİŞİM VE ROL YÖNETİMİ', `
    <form id="user-form" class="form-grid">
      <div class="form-group">
        <label>Ad soyad</label>
        <input name="full_name" value="${esc(user?.full_name || '')}" placeholder="Prof. Dr. ..." required>
      </div>
      <div class="form-group">
        <label>E-posta</label>
        <input type="email" name="email" value="${esc(user?.email || '')}" placeholder="kullanici@kapadokya.edu.tr" required>
      </div>
      <div class="form-group">
        <label>Rol</label>
        <select name="role">
          ${roles.map((role) => `<option value="${role}" ${user?.role === role ? 'selected' : ''}>${esc(roleLabels[role] || role)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Birim</label>
        <input name="unit_name" value="${esc(user?.unit_name || '')}" placeholder="Mühendislik Fakültesi">
      </div>
      ${user ? `
        <div class="span-2 form-group">
          <label class="check-label">
            <input type="checkbox" name="is_active" ${user.is_active ? 'checked' : ''}>
            <span>Aktif hesap (Giriş yapabilir)</span>
          </label>
        </div>
        <div class="span-2 form-group">
          <label>Yeni parola (isteğe bağlı)</label>
          <input type="password" name="new_password" minlength="8" placeholder="Değiştirmek istemiyorsanız boş bırakın">
        </div>` : `
        <div class="span-2 form-group">
          <label>Geçici parola</label>
          <input type="password" name="password" minlength="8" value="Kun2026!" required>
        </div>`}
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Kaydet</button>
      </div>
    </form>`);

  $('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (user) body.is_active = fd.has('is_active');
    try {
      await api(user ? `/api/users/${user.id}` : '/api/users', {
        method: user ? 'PATCH' : 'POST',
        body
      });
      closeModal();
      toast('Kullanıcı hesabı başarıyla kaydedildi.');
      navigate('users');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function kpi(icon, value, label, accent, soft) {
  return `<article class="kpi-card" style="--accent:var(${accent});--accent-soft:var(${soft})">
    <span class="kpi-icon">${icon}</span>
    <strong>${number(value)}</strong>
    <small>${esc(label)}</small>
  </article>`;
}

function programTable(programs, approvals = false) {
  if (!programs?.length) return empty('◇', 'Henüz program bulunmuyor', 'Yeni bir mikro yeterlilik programı tasarlayarak başlayabilirsiniz.');
  return `<table class="data-table">
    <thead>
      <tr>
        <th>Program</th>
        <th>TYÇ Seviye</th>
        <th>AKTS Kredisi</th>
        <th>Durum</th>
        <th>Son İşlem</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${programs.map((p) => `
        <tr>
          <td>
            <div class="table-title">
              <strong>${esc(p.title)}</strong>
              <small class="code">${esc(p.code)}</small>
            </div>
          </td>
          <td>Seviye ${p.tyc_level || '—'}</td>
          <td><strong>${number(p.ects_credits, 2)}</strong> AKTS</td>
          <td>${statusPill(p.status)}</td>
          <td>${fmtDate(p.updated_at || p.submitted_at)}</td>
          <td class="actions-cell">
            <button class="button button--secondary button--small" data-program="${p.id}">${approvals ? 'İncele & Karar Ver' : 'Görüntüle'}</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// 4. PROGRAM TASARIMI
async function renderPrograms() {
  const data = await api('/api/programs');
  state.programs = data.programs;
  const action = roleCan('COORDINATOR') ? '<button class="button button--primary" id="new-program">+ Yeni program tasarla</button>' : '';
  
  content.innerHTML = pageHead(
    'Mikro yeterlilik programları',
    'Öğrenme çıktısı, 25 saat/AKTS iş yükü, değerlendirme ve kalite paketlerini yönetin.',
    action
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Program kataloğu</h3>
        <small>${data.programs.length} kayıt</small>
      </div>
      <div class="table-wrap">${programTable(data.programs)}</div>
    </section>`;
    
  $('#new-program')?.addEventListener('click', () => openProgramForm());
}

// 5. ONAY İŞ AKIŞLARI
async function renderApprovals() {
  const data = await api('/api/programs');
  const role = state.user.role;
  let actionable = [];
  let subtitle = 'Program tekliflerini akademik birim, komisyon ve senato aşamalarında izleyin ve karara bağlayın.';
  let panelTitle = 'İşlem bekleyen programlar';

  if (role === 'COORDINATOR') {
    actionable = data.programs.filter((p) =>
      ['SUBMITTED', 'UNIT_APPROVED', 'COMMISSION_APPROVED', 'REJECTED', 'SENATE_APPROVED'].includes(p.status) &&
      (p.created_by === state.user.id || role === 'ADMIN')
    );
    subtitle = 'Tasarlayıp onaya sunduğunuz mikro yeterlilik tekliflerinin Birim Kurulu, Komisyon ve Senato aşamalarındaki anlık durumunu izleyin.';
    panelTitle = 'Onay sürecindeki programlarım';
  } else {
    actionable = data.programs.filter((p) =>
      ({ UNIT_BOARD: 'SUBMITTED', COMMISSION: 'UNIT_APPROVED', SENATE: 'COMMISSION_APPROVED' }[role] === p.status || role === 'ADMIN')
    );
  }

  content.innerHTML = pageHead(
    'Onay iş akışları',
    subtitle
  ) + `
    <div class="callout callout--info" style="margin-bottom:20px">
      <span>⏱</span>
      <div>
        <strong>30 Takvim Günlük Karar Süresi Takibi</strong>
        Program teklifi koordinatör tarafından onaya sunulduğu andan itibaren 30 takvim günü içerisinde nihai senato onayına ulaşmalıdır.
      </div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h3>${panelTitle}</h3>
        <small>${actionable.length} program</small>
      </div>
      <div class="table-wrap">${programTable(actionable, role !== 'COORDINATOR')}</div>
    </section>`;
}

function repeatOutcome(item = {}) {
  return `<tr>
    <td style="width:90px"><input name="outcome_code" value="${esc(item.code || '')}" placeholder="ÖÇ1" required></td>
    <td><input name="outcome_description" value="${esc(item.description || '')}" placeholder="Öğrenen ... yapabilir" required></td>
    <td style="width:140px">
      <select name="outcome_bloom">
        ${['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'].map((v) => `
          <option value="${v}" ${item.bloom_level === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </td>
    <td style="width:40px"><button type="button" class="remove-row" title="Satırı Sil">×</button></td>
  </tr>`;
}

function repeatAssessment(item = {}) {
  return `<tr>
    <td style="width:80px"><input name="assessment_code" value="${esc(item.code || '')}" placeholder="D1" required></td>
    <td><input name="assessment_title" value="${esc(item.title || '')}" placeholder="Bitirme Projesi" required></td>
    <td style="width:150px">
      <select name="assessment_type">
        ${[['WRITTEN_EXAM','Yazılı Sınav'],['ONLINE_QUIZ','Online Sınav'],['PRACTICE','Uygulama/Performans'],['PORTFOLIO','Portfolyo'],['CAPSTONE_PROJECT','Bitirme Projesi'],['RUBRIC','Rubrikli Değerlendirme']].map(([v, l]) => `
          <option value="${v}" ${item.assessment_type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </td>
    <td style="width:90px"><input name="assessment_weight" type="number" min="1" max="100" value="${item.weight ?? 100}" title="Ağırlık %" required></td>
    <td style="width:90px"><input name="assessment_threshold" type="number" min="0" max="100" value="${item.threshold ?? 60}" title="Baraj Puanı" required></td>
    <td style="width:40px"><button type="button" class="remove-row" title="Satırı Sil">×</button></td>
  </tr>`;
}

function repeatMapping(item = {}) {
  return `<tr>
    <td><input name="mapping_outcome" value="${esc(item.outcome_code || '')}" placeholder="Örn: ÖÇ1" required></td>
    <td><input name="mapping_assessment" value="${esc(item.assessment_code || '')}" placeholder="Örn: D1" required></td>
    <td style="width:40px"><button type="button" class="remove-row" title="Satırı Sil">×</button></td>
  </tr>`;
}

function openProgramForm(existing = null) {
  const p = existing || {};
  const workloadValues = Object.fromEntries((p.workloads || []).map((w) => [w.activity_type, w]));
  const workloadTypes = {
    THEORETICAL: 'Teorik Ders',
    PRACTICAL: 'Uygulama / Saha',
    LAB: 'Laboratuvar',
    INDEPENDENT_STUDY: 'Bireysel Çalışma',
    PROJECT: 'Proje / Ödev',
    EXAM_PREP: 'Sınav ve Hazırlık'
  };

  modal(existing ? 'Programı güncelle' : 'Yeni program tasarla', 'YÖK UYUMLU PROGRAM BİLGİ PAKETİ', `
    <form id="program-form" class="form-grid">
      <div class="form-group">
        <label>Program kodu</label>
        <input name="code" value="${esc(p.code || '')}" placeholder="Boş bırakılırsa otomatik üretilir (KUN-MY-...)">
      </div>
      <div class="form-group">
        <label>Program adı *</label>
        <input name="title" value="${esc(p.title || '')}" placeholder="Örn: Uygulamalı Büyük Veri Analitiği" required>
      </div>
      <div class="span-2 form-group">
        <label>Kısa özet *</label>
        <textarea name="summary" placeholder="Programın hedeflerini özetleyen kısa tanıtım..." required>${esc(p.summary || '')}</textarea>
      </div>
      <div class="span-2 form-group">
        <label>Amaç ve kapsam *</label>
        <textarea name="description" placeholder="Programın ayrıntılı amacı, hedef yetkinlikler..." required>${esc(p.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>TYÇ / EQF Seviyesi</label>
        <select name="tyc_level">
          ${[5, 6, 7, 8].map((v) => `<option value="${v}" ${Number(p.tyc_level || 6) === v ? 'selected' : ''}>TYÇ Seviye ${v} (EQF ${v})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Katılım şekli</label>
        <select name="delivery_mode">
          ${[['IN_PERSON', 'Yüz yüze'], ['ONLINE', 'Uzaktan'], ['HYBRID', 'Hibrit']].map(([v, l]) => `
            <option value="${v}" ${p.delivery_mode === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>ISCED Kodu</label>
        <input name="isced_code" value="${esc(p.isced_code || '')}" placeholder="0613 (Bilişim)">
      </div>
      <div class="form-group">
        <label>ESCO Etiketleri</label>
        <input name="esco_codes" value="${esc(p.esco_codes || '')}" placeholder="AI, data analysis, python">
      </div>
      <div class="span-2 form-group">
        <label>Hedef kitle *</label>
        <textarea name="target_audience" placeholder="Öğrenciler, sektör profesyonelleri, mezunlar..." required>${esc(p.target_audience || '')}</textarea>
      </div>
      <div class="span-2 form-group">
        <label>Kabul koşulları *</label>
        <textarea name="admission_requirements" placeholder="Ön koşul dersler, temel bilgi gereksinimleri..." required>${esc(p.admission_requirements || '')}</textarea>
      </div>
      <div class="span-2 form-group">
        <label>Başarı kriterleri *</label>
        <textarea name="success_criteria" required>${esc(p.success_criteria || 'Toplam başarı puanı en az 60 ve devam oranı en az %80 olmalıdır.')}</textarea>
      </div>
      <div class="span-2 form-group">
        <label>Kalite güvencesi *</label>
        <textarea name="quality_assurance" required>${esc(p.quality_assurance || 'Kapadokya Üniversitesi iç kalite güvence sistemi; öğrenen ve paydaş geri bildirimi ile yıllık gözden geçirme.')}</textarea>
      </div>
      <div class="span-2 form-group">
        <label>Sektör / Paydaş ihtiyaç raporu</label>
        <textarea name="stakeholder_report" placeholder="Sektör iş birliği veya istihdam analizi notları...">${esc(p.stakeholder_report || '')}</textarea>
      </div>

      <section class="form-section">
        <h3>1. Öğrenme Çıktıları</h3>
        <p>Her çıktı ölçülebilir bir eylem fiiliyle tanımlanmalı ve Bloom taksonomisine uygun olmalıdır.</p>
        <table class="repeat-table">
          <thead>
            <tr><th>Kod</th><th>Ölçülebilir Çıktı</th><th>Bloom Seviyesi</th><th></th></tr>
          </thead>
          <tbody id="outcome-rows">
            ${(p.outcomes?.length ? p.outcomes : [{ code: 'ÖÇ1', bloom_level: 'APPLY' }]).map(repeatOutcome).join('')}
          </tbody>
        </table>
        <button type="button" class="button button--secondary button--small" data-add="outcome">+ Yeni Çıktı Ekle</button>
      </section>

      <section class="form-section">
        <h3>2. İş Yükü ve AKTS Hesabı (YÖK Kuralı: 25 Saat = 1 AKTS)</h3>
        <p>Toplam öğrenen iş yükü 25 saatin tam katı olmalıdır.</p>
        <div class="form-grid">
          ${Object.entries(workloadTypes).map(([type, label]) => `
            <div class="form-group">
              <label>${label} (saat)</label>
              <input type="number" min="0" name="workload_${type}" value="${workloadValues[type]?.hours || 0}">
            </div>`).join('')}
        </div>
        <div id="ects-preview" class="callout callout--info" style="margin-top:12px"></div>
      </section>

      <section class="form-section">
        <h3>3. Ölçme ve Değerlendirme Yöntemleri</h3>
        <p>Ağırlıkların toplamı %100 olmalıdır.</p>
        <table class="repeat-table">
          <thead>
            <tr><th>Kod</th><th>Yöntem Adı</th><th>Tür</th><th>Ağırlık (%)</th><th>Baraj</th><th></th></tr>
          </thead>
          <tbody id="assessment-rows">
            ${(p.assessments?.length ? p.assessments : [{ code: 'D1', weight: 100, threshold: 60 }]).map(repeatAssessment).join('')}
          </tbody>
        </table>
        <button type="button" class="button button--secondary button--small" data-add="assessment">+ Yeni Değerlendirme Yöntemi Ekle</button>
      </section>

      <section class="form-section">
        <h3>4. Çıktı – Değerlendirme Eşleştirme Matrisi</h3>
        <p>Her bir öğrenme çıktısının hangi değerlendirme yöntemi ile ölçüldüğünü belirtin.</p>
        <table class="repeat-table">
          <thead>
            <tr><th>Öğrenme Çıktısı Kodu</th><th>Değerlendirme Kodu</th><th></th></tr>
          </thead>
          <tbody id="mapping-rows">
            ${(p.mappings?.length ? p.mappings : [{ outcome_code: 'ÖÇ1', assessment_code: 'D1' }]).map(repeatMapping).join('')}
          </tbody>
        </table>
        <button type="button" class="button button--secondary button--small" data-add="mapping">+ Yeni Eşleşme Ekle</button>
      </section>

      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">${existing ? 'Değişiklikleri Kaydet' : 'Taslağı Oluştur'}</button>
      </div>
    </form>`);

  const form = $('#program-form');
  form.dataset.id = existing?.id || '';
  
  $$('[data-add]', form).forEach((button) => button.addEventListener('click', () => {
    const type = button.dataset.add;
    const target = $(`#${type}-rows`, form);
    target.insertAdjacentHTML('beforeend', type === 'outcome' ? repeatOutcome() : type === 'assessment' ? repeatAssessment() : repeatMapping());
  }));

  form.addEventListener('click', (event) => {
    if (event.target.matches('.remove-row')) {
      const row = event.target.closest('tr');
      if (row) row.remove();
    }
  });

  form.addEventListener('input', updateEctsPreview);
  updateEctsPreview();
  form.addEventListener('submit', saveProgramForm);
}

function updateEctsPreview() {
  const form = $('#program-form');
  if (!form) return;
  const total = $$('[name^="workload_"]', form).reduce((sum, input) => sum + Number(input.value || 0), 0);
  const exact = total > 0 && total % 25 === 0;
  const ects = (total / 25).toFixed(2);
  
  $('#ects-preview').className = `callout ${exact ? 'callout--success' : 'callout--warning'}`;
  $('#ects-preview').innerHTML = `
    <span>${exact ? '✓' : '!'}</span>
    <div>
      <strong>Toplam ${total} Saat = ${ects} AKTS</strong>
      <div>${exact ? 'YÖK 25 saat/AKTS tam kat kuralına uygundur.' : 'Onaya gönderebilmek için toplam iş yükü 25 saatin tam katı olmalıdır.'}</div>
    </div>`;
}

async function saveProgramForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const workloads = ['THEORETICAL', 'PRACTICAL', 'LAB', 'INDEPENDENT_STUDY', 'PROJECT', 'EXAM_PREP'].map((type) => ({
    activity_type: type,
    hours: Number(fd.get(`workload_${type}`) || 0)
  }));
  const outcomes = $$('#outcome-rows tr', form).map((row) => ({
    code: $('[name=outcome_code]', row).value,
    description: $('[name=outcome_description]', row).value,
    bloom_level: $('[name=outcome_bloom]', row).value
  }));
  const assessments = $$('#assessment-rows tr', form).map((row) => ({
    code: $('[name=assessment_code]', row).value,
    title: $('[name=assessment_title]', row).value,
    assessment_type: $('[name=assessment_type]', row).value,
    weight: Number($('[name=assessment_weight]', row).value),
    threshold: Number($('[name=assessment_threshold]', row).value),
    supervision: 'ONSITE_ID_VERIFIED'
  }));
  const mappings = $$('#mapping-rows tr', form).map((row) => ({
    outcome_code: $('[name=mapping_outcome]', row).value,
    assessment_code: $('[name=mapping_assessment]', row).value
  }));

  const payload = Object.fromEntries(fd.entries());
  Object.assign(payload, {
    outcomes,
    workloads,
    assessments,
    mappings,
    tyc_level: Number(payload.tyc_level)
  });

  try {
    const method = form.dataset.id ? 'PUT' : 'POST';
    const url = form.dataset.id ? `/api/programs/${form.dataset.id}` : '/api/programs';
    const result = await api(url, { method, body: payload });
    closeModal();
    toast('Program taslağı başarıyla kaydedildi.');
    await navigate('programs');
    await openProgramDetail(result.program.id);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openProgramDetail(id) {
  const { program: p } = await api(`/api/programs/${id}`);
  const approvalSteps = [
    { title: 'Program Koordinatörü', status: p.submitted_at ? 'APPROVED' : 'PENDING', date: p.submitted_at },
    ...[1, 2, 3].map((step) => {
      const a = p.approvals.find((item) => item.step_order === step);
      return {
        title: ['Akademik Birim Kurulu', 'Mikro Yeterlilik Komisyonu', 'Üniversite Senatosu'][step - 1],
        status: a?.status || 'PENDING',
        date: a?.decided_at,
        note: a?.decision_notes
      };
    })
  ];

  const currentRole = { SUBMITTED: 'UNIT_BOARD', UNIT_APPROVED: 'COMMISSION', COMMISSION_APPROVED: 'SENATE' }[p.status];
  const canDecide = currentRole && roleCan(currentRole);
  const canEdit = ['DRAFT', 'REJECTED'].includes(p.status) && (state.user.role === 'ADMIN' || p.created_by === state.user.id);
  const canSubmit = canEdit;

  modal(p.title, p.code, `
    <div class="program-summary">
      <div style="display:flex;justify-content:space-between;align-items:center">
        ${statusPill(p.status)}
        <span class="code">${esc(p.code)}</span>
      </div>
      <p>${esc(p.summary)}</p>
    </div>

    <div class="detail-grid">
      <div class="detail-card"><small>TYÇ / EQF</small><strong>Seviye ${p.tyc_level} / EQF ${p.eqf_level}</strong></div>
      <div class="detail-card"><small>Toplam İş Yükü</small><strong>${p.total_hours} saat</strong></div>
      <div class="detail-card"><small>AKTS Kredisi</small><strong>${number(p.ects_credits, 2)} AKTS</strong></div>
      <div class="detail-card"><small>Katılım Şekli</small><strong>${esc({ IN_PERSON: 'Yüz yüze', ONLINE: 'Uzaktan', HYBRID: 'Hibrit' }[p.delivery_mode])}</strong></div>
    </div>

    <h3 class="section-title">Onay Zinciri (30 Günlük Karar SLA)</h3>
    <div class="timeline">
      ${approvalSteps.map((s) => `
        <div class="timeline-step ${s.status === 'APPROVED' ? 'done' : s.status === 'REJECTED' ? 'rejected' : 'active'}">
          <span class="timeline-dot">${s.status === 'APPROVED' ? '✓' : s.status === 'REJECTED' ? '×' : '•'}</span>
          <strong>${s.title}</strong>
          <small>${s.date ? fmtDate(s.date) : 'Karar bekleniyor'}${s.note ? `<br><em>${esc(s.note)}</em>` : ''}</small>
        </div>`).join('')}
    </div>

    ${p.decision_due_at && !['SENATE_APPROVED', 'REJECTED'].includes(p.status) ? `
      <div class="callout callout--info" style="margin-top:14px">
        <span>⏱</span>
        <div><strong>Son Karar Tarihi: ${fmtDate(p.decision_due_at)}</strong> 30 günlük yasal kurumsal SLA takibi yapılmaktadır.</div>
      </div>` : ''}

    <h3 class="section-title">Öğrenme Çıktıları & Değerlendirme</h3>
    <table class="data-table">
      <thead>
        <tr><th>Kod</th><th>Ölçülebilir Çıktı</th><th>Bloom</th><th>Değerlendirme Yöntemi</th></tr>
      </thead>
      <tbody>
        ${p.outcomes.map((o) => `
          <tr>
            <td><span class="code">${esc(o.code)}</span></td>
            <td>${esc(o.description)}</td>
            <td><span class="pill pill--gray">${esc(o.bloom_level)}</span></td>
            <td>${p.mappings.filter((m) => m.outcome_code === o.code).map((m) => `<span class="pill pill--blue">${esc(m.assessment_code)}</span>`).join(' ') || '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <h3 class="section-title">İş Yükü Dağılımı</h3>
    <table class="data-table">
      <tbody>
        ${p.workloads.map((w) => `
          <tr>
            <td>${esc({ THEORETICAL: 'Teorik Ders', PRACTICAL: 'Uygulama / Saha', LAB: 'Laboratuvar', INDEPENDENT_STUDY: 'Bireysel Çalışma', PROJECT: 'Proje / Ödev', EXAM_PREP: 'Sınav ve Hazırlık' }[w.activity_type] || w.activity_type)}</td>
            <td><strong>${w.hours} saat</strong></td>
            <td>${esc(w.description || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="form-footer">
      ${canEdit ? '<button class="button button--secondary" id="edit-program">✏ Düzenle</button>' : ''}
      ${canSubmit ? '<button class="button button--primary" id="submit-program">📤 Onaya Gönder</button>' : ''}
      ${canDecide ? `
        <button class="button button--danger" id="reject-program">Revizyon İste</button>
        <button class="button button--primary" id="approve-program">✓ Uygun Bul</button>` : ''}
      ${roleCan('SENATE') && ['SENATE_APPROVED', 'REJECTED'].includes(p.status) ? '<button class="button button--secondary" id="archive-program">Arşivle</button>' : ''}
    </div>`);

  $('#edit-program')?.addEventListener('click', () => openProgramForm(p));
  $('#submit-program')?.addEventListener('click', async () => {
    try {
      await api(`/api/programs/${p.id}/submit`, { method: 'POST' });
      closeModal();
      toast('Program 30 günlük onay sürecine alındı.');
      await navigate('programs');
    } catch (error) {
      toast(error.payload?.errors?.join(' ') || error.message, 'error');
    }
  });
  $('#approve-program')?.addEventListener('click', () => decisionModal(p, true));
  $('#reject-program')?.addEventListener('click', () => decisionModal(p, false));
  $('#archive-program')?.addEventListener('click', async () => {
    try {
      await api(`/api/programs/${p.id}/archive`, { method: 'POST' });
      closeModal();
      toast('Program arşivlendi.');
      navigate('programs');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function decisionModal(program, approve) {
  modal(approve ? 'Programı uygun bul' : 'Revizyon iste', 'KURUL VE SENATO KARARI', `
    <form id="decision-form" class="form-grid">
      <div class="callout ${approve ? 'callout--success' : 'callout--warning'} span-2">
        <span>${approve ? '✓' : '!'}</span>
        <div>
          <strong>${esc(program.title)}</strong>
          <div>${approve ? 'Program teklifi onaylanarak bir sonraki karar makamına iletilecektir.' : 'Program teklifi revizyon gerekçesiyle birlikte koordinatöre iade edilecektir.'}</div>
        </div>
      </div>
      <div class="span-2 form-group">
        <label>Karar notu / Gerekçe ${approve ? '' : '*'}</label>
        <textarea name="notes" placeholder="Görüş ve gerekçenizi yazın..." ${approve ? '' : 'required'}></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button ${approve ? 'button--primary' : 'button--danger'}" type="submit">${approve ? 'Kararı Onayla' : 'Revizyon Talep Et'}</button>
      </div>
    </form>`);

  $('#decision-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/programs/${program.id}/decision`, {
        method: 'POST',
        body: {
          decision: approve ? 'APPROVE' : 'REJECT',
          notes: new FormData(event.currentTarget).get('notes')
        }
      });
      closeModal();
      toast(approve ? 'Kurul kararı başarıyla onaylandı.' : 'Revizyon talebi koordinatöre iletildi.');
      navigate(state.view);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// 6. EĞİTİMLER VE KONTENJAN
async function renderOfferings() {
  const [data, programs, enrollmentsData] = await Promise.all([
    api('/api/offerings'),
    api('/api/programs'),
    state.user?.role === 'STUDENT' ? api('/api/enrollments') : Promise.resolve({ enrollments: [] })
  ]);
  state.offerings = data.offerings;
  state.programs = programs.programs;
  const myEnrollments = enrollmentsData.enrollments || [];
  
  content.innerHTML = pageHead(
    'Eğitimler ve kontenjan',
    'Senato onaylı mikro yeterliliklerin dönem, eğitici, lokasyon ve kapasite yönetimi.',
    roleCan('COORDINATOR') ? '<button class="button button--primary" id="new-offering">+ Yeni eğitim aç</button>' : ''
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Eğitim dönemleri</h3>
        <small>${data.offerings.length} dönem</small>
      </div>
      <div class="table-wrap">
        ${data.offerings.length ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Eğitim</th>
                <th>Tarih Aralığı</th>
                <th>Eğitici & Lokasyon</th>
                <th>Kontenjan / Doluluk</th>
                <th>Erişim</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.offerings.map((o) => {
                const isEnrolled = state.user?.role === 'STUDENT' && myEnrollments.some((e) => e.offering_id === o.id && e.status !== 'DROPPED');
                return `
                <tr>
                  <td>
                    <div class="table-title">
                      <strong>${esc(o.program_title)}</strong>
                      <small class="code">${esc(o.code)}</small>
                    </div>
                  </td>
                  <td>${fmtDate(o.start_date)}<br><small style="color:var(--muted)">${fmtDate(o.end_date)}</small></td>
                  <td><strong>${esc(o.instructor_name)}</strong><br><small style="color:var(--muted)">${esc(o.location || 'Yer belirtilmedi')}</small></td>
                  <td>
                    <strong>${o.enrolled_count} / ${o.quota}</strong>
                    <div class="progress" style="width:110px;margin-top:5px">
                      <span style="width:${Math.min(100, (o.enrolled_count / o.quota) * 100)}%"></span>
                    </div>
                  </td>
                  <td>${o.access_type === 'CLOSED' ? '<span class="pill pill--gray">Kapalı Grup</span>' : '<span class="pill pill--green">Açık Grup</span>'}</td>
                  <td>${statusPill(o.status)}</td>
                  <td class="actions-cell">
                    ${roleCan('COORDINATOR') ? `<button class="button button--secondary button--small" data-offering="${o.id}">Düzenle</button>` : ''}
                    ${state.user?.role === 'STUDENT' ? (
                      isEnrolled
                        ? `<span class="pill pill--green">✓ Kayıtlısınız</span>`
                        : (['OPEN', 'RUNNING'].includes(o.status) && o.access_type !== 'CLOSED'
                          ? `<button class="button button--primary button--small" data-enroll-offering="${o.id}">Kayıt Ol</button>`
                          : `<span class="pill pill--gray">Kayıt Kapalı</span>`)
                    ) : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : empty('□', 'Henüz eğitim dönemi açılmadı', 'Senato onaylı programlar için yeni bir eğitim dönemi başlatabilirsiniz.')}
      </div>
    </section>`;

  $('#new-offering')?.addEventListener('click', () => {
    const senateApproved = programs.programs.filter((p) => p.status === 'SENATE_APPROVED');
    if (!senateApproved.length) {
      toast('Eğitim açabilmek için en az bir adet Senato Onaylı mikro yeterlilik programı bulunmalıdır.', 'error');
      return;
    }
    offeringForm(senateApproved);
  });

  $$('[data-offering]').forEach((button) => button.addEventListener('click', () => {
    offeringEditForm(data.offerings.find((o) => o.id === button.dataset.offering));
  }));

  $$('[data-enroll-offering]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await api('/api/enrollments', { method: 'POST', body: { offering_id: btn.dataset.enrollOffering } });
      toast('Eğitime kaydınız başarıyla tamamlandı.');
      navigate('enrollments');
    } catch (err) {
      toast(err.message, 'error');
    }
  }));
}

function offeringForm(programs) {
  modal('Yeni eğitim aç', 'EĞİTİM OPERASYONU & KONTENJAN', `
    <form id="offering-form" class="form-grid">
      <div class="span-2 form-group">
        <label>Mikro yeterlilik programı *</label>
        <select name="program_id" required>
          ${programs.map((p) => `<option value="${p.id}">${esc(p.code)} — ${esc(p.title)} (${p.ects_credits} AKTS)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Başlangıç tarihi *</label>
        <input type="date" name="start_date" required>
      </div>
      <div class="form-group">
        <label>Bitiş tarihi *</label>
        <input type="date" name="end_date" required>
      </div>
      <div class="form-group">
        <label>Kontenjan *</label>
        <input type="number" name="quota" min="1" value="30" required>
      </div>
      <div class="form-group">
        <label>Eğitim ücreti (TL)</label>
        <input type="number" name="fee" min="0" value="0">
      </div>
      <div class="form-group">
        <label>Erişim grubu</label>
        <select name="access_type">
          <option value="OPEN">Genel Başvuruya Açık</option>
          <option value="CLOSED">Kapalı Kurumsal Grup</option>
        </select>
      </div>
      <div class="form-group">
        <label>Kayıt son tarihi</label>
        <input type="date" name="registration_deadline">
      </div>
      <div class="span-2 form-group">
        <label>Eğitici adı soyadı *</label>
        <input name="instructor_name" placeholder="Öğretim Elemanı / Eğitmen" required>
      </div>
      <div class="span-2 form-group">
        <label>Yer / LMS Bağlantı Bilgisi</label>
        <input name="location" placeholder="Uçhisar Yerleşkesi Derslik 101 veya LMS linki">
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Eğitimi Aç</button>
      </div>
    </form>`);

  $('#offering-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/offerings', {
        method: 'POST',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Yeni eğitim dönemi başarıyla açıldı.');
      navigate('offerings');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function offeringEditForm(offering) {
  modal('Eğitimi güncelle', 'EĞİTİM OPERASYONU', `
    <form id="offering-edit-form" class="form-grid">
      <div class="callout callout--info span-2">
        <span>i</span>
        <div>
          <strong>${esc(offering.program_title)}</strong>
          <div>${esc(offering.code)} · Kayıtlı ${offering.enrolled_count} öğrenen</div>
        </div>
      </div>
      <div class="form-group">
        <label>Başlangıç tarihi</label>
        <input type="date" name="start_date" value="${esc(offering.start_date)}" required>
      </div>
      <div class="form-group">
        <label>Bitiş tarihi</label>
        <input type="date" name="end_date" value="${esc(offering.end_date)}" required>
      </div>
      <div class="form-group">
        <label>Kontenjan</label>
        <input type="number" name="quota" min="${offering.enrolled_count}" value="${offering.quota}" required>
      </div>
      <div class="form-group">
        <label>Durum</label>
        <select name="status">
          ${['OPEN', 'RUNNING', 'COMPLETED', 'CANCELLED'].map((s) => `
            <option value="${s}" ${offering.status === s ? 'selected' : ''}>${esc(statusLabels[s] || s)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Eğitici</label>
        <input name="instructor_name" value="${esc(offering.instructor_name)}" required>
      </div>
      <div class="form-group">
        <label>Erişim</label>
        <select name="access_type">
          <option value="OPEN" ${offering.access_type !== 'CLOSED' ? 'selected' : ''}>Açık grup</option>
          <option value="CLOSED" ${offering.access_type === 'CLOSED' ? 'selected' : ''}>Kapalı grup</option>
        </select>
      </div>
      <div class="span-2 form-group">
        <label>Yer / Bağlantı Bilgisi</label>
        <input name="location" value="${esc(offering.location || '')}">
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Güncellemeyi Kaydet</button>
      </div>
    </form>`);

  $('#offering-edit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/offerings/${offering.id}`, {
        method: 'PATCH',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Eğitim bilgileri güncellendi.');
      navigate('offerings');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// 7. ÖĞRENENLER VE BAŞARI
async function renderEnrollments() {
  const [data, offerings] = await Promise.all([api('/api/enrollments'), api('/api/offerings')]);
  state.enrollments = data.enrollments;
  state.offerings = offerings.offerings;

  content.innerHTML = pageHead(
    'Öğrenenler ve başarı',
    'Devam, değerlendirme kanıtları, başarı notu ve tamamlanma kayıtları.',
    roleCan('COORDINATOR', 'STUDENT') ? '<button class="button button--primary" id="new-enrollment">+ Yeni öğrenen kaydı</button>' : ''
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Öğrenen Kayıtları</h3>
        <small>${data.enrollments.length} kayıt</small>
      </div>
      <div class="table-wrap">
        ${data.enrollments.length ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Öğrenen</th>
                <th>Program</th>
                <th>Öğrenen Türü</th>
                <th>Kanıt Zinciri</th>
                <th>Devam Oranı</th>
                <th>Puan / Harf Notu</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.enrollments.map((e) => `
                <tr>
                  <td>
                    <div class="table-title">
                      <strong>${esc(e.learner_name)}</strong>
                      <small>${esc(e.learner_email)}</small>
                    </div>
                  </td>
                  <td>${esc(e.program_title)}</td>
                  <td><span class="pill pill--gray">${e.learner_type === 'INTERNAL_KUN' ? 'KÜN İçi' : 'Kurum Dışı'}</span></td>
                  <td>
                    <button class="button button--secondary button--small" data-evidence-list="${e.id}">
                      📁 ${number(e.evidence_count)} kanıt
                    </button>
                  </td>
                  <td><strong>%${number(e.attendance_rate, 1)}</strong></td>
                  <td>${e.final_score == null ? '—' : `<strong>${number(e.final_score, 1)}</strong> <span class="pill pill--wine">${esc(e.letter_grade || '—')}</span>`}</td>
                  <td>${statusPill(e.status)}</td>
                  <td class="actions-cell">
                    ${roleCan('EVALUATOR', 'COORDINATOR') ? `
                      <button class="button button--secondary button--small" data-evidence="${e.id}">+ Kanıt Ekle</button>
                      <button class="button button--secondary button--small" data-result="${e.id}">Not Gir</button>` : ''}
                    ${state.user.role === 'STUDENT' && e.status !== 'DROPPED' ? `
                      <button class="button button--secondary button--small" data-feedback="${e.id}">★ Geri Bildirim</button>
                      <button class="button button--secondary button--small" data-appeal-enrollment="${e.id}">İtiraz</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : empty('◉', 'Kayıt bulunmuyor', 'Açık eğitim dönemlerine öğrenen kaydı yapabilirsiniz.')}
      </div>
    </section>`;

  $('#new-enrollment')?.addEventListener('click', () => enrollmentForm(offerings.offerings));
}

function enrollmentForm(offerings) {
  const activeOfferings = offerings.filter((o) => ['OPEN', 'RUNNING'].includes(o.status));
  modal('Öğrenen kaydı', 'KAYIT VE KONTENJAN', `
    <form id="enrollment-form" class="form-grid">
      <div class="span-2 form-group">
        <label>Kayıt yapılacak eğitim *</label>
        <select name="offering_id" required>
          ${activeOfferings.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.program_title)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Öğrenen Adı Soyadı *</label>
        <input name="learner_name" value="${state.user.role === 'STUDENT' ? esc(state.user.full_name) : ''}" required>
      </div>
      <div class="form-group">
        <label>E-posta adresi *</label>
        <input type="email" name="learner_email" value="${state.user.role === 'STUDENT' ? esc(state.user.email) : ''}" required>
      </div>
      <div class="form-group">
        <label>T.C. Kimlik / Pasaport No *</label>
        <input name="identity_number" placeholder="11 haneli kimlik no" required>
      </div>
      <div class="form-group">
        <label>Öğrenen Türü</label>
        <select name="learner_type">
          <option value="INTERNAL_KUN">KÜN Öğrencisi / Personeli</option>
          <option value="EXTERNAL">Kurum Dışı Katılımcı</option>
        </select>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Kaydı Oluştur</button>
      </div>
    </form>`);

  $('#enrollment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/enrollments', {
        method: 'POST',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Öğrenen kaydı başarıyla oluşturuldu.');
      navigate('enrollments');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function resultForm(enrollment) {
  modal('Başarı sonucu ve not girişi', 'ÖLÇME VE DEĞERLENDİRME', `
    <form id="result-form" class="form-grid">
      <div class="callout callout--info span-2">
        <span>i</span>
        <div>
          <strong>${esc(enrollment.learner_name)}</strong>
          <div>${esc(enrollment.program_title)}</div>
        </div>
      </div>
      <div class="form-group">
        <label>Devam oranı (%) *</label>
        <input type="number" name="attendance_rate" min="0" max="100" value="${enrollment.attendance_rate ?? 100}" required>
      </div>
      <div class="form-group">
        <label>Başarı puanı (0-100) *</label>
        <input type="number" name="final_score" min="0" max="100" value="${enrollment.final_score ?? 75}" required>
      </div>
      <div class="span-2 form-group">
        <label>Nihai Sonuç</label>
        <select name="status">
          <option value="COMPLETED" ${enrollment.status === 'COMPLETED' ? 'selected' : ''}>Başarılı / Tamamlandı (Belge Düzenlenebilir)</option>
          <option value="FAILED" ${enrollment.status === 'FAILED' ? 'selected' : ''}>Başarısız</option>
          <option value="ACTIVE" ${enrollment.status === 'ACTIVE' ? 'selected' : ''}>Değerlendirme Sürüyor</option>
        </select>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Sonucu Kaydet</button>
      </div>
    </form>`);

  $('#result-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/enrollments/${enrollment.id}/result`, {
        method: 'PATCH',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Başarı sonucu başarıyla kaydedildi.');
      navigate('enrollments');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

async function evidenceForm(enrollment) {
  try {
    const { program } = await api(`/api/programs/${enrollment.program_id}`);
    modal('Değerlendirme kanıtı ekle', 'ÇIKTI BAZLI KANIT ZİNCİRİ', `
      <form id="evidence-form" class="form-grid">
        <div class="callout callout--info span-2">
          <span>🔒</span>
          <div>
            <strong>${esc(enrollment.learner_name)} · ${esc(enrollment.program_title)}</strong>
            Yüklenen dosyanın veya bağlantının SHA-256 kriptografik özeti çıkarılarak değişmez denetim zincirine işlenir.
          </div>
        </div>
        <div class="span-2 form-group">
          <label>Öğrenme çıktısı *</label>
          <select name="outcome_id" required>
            ${program.outcomes.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.description)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Kanıt türü</label>
          <select name="evidence_type">
            <option value="PROJECT_FILE">Proje / Kod Dosyası</option>
            <option value="PORTFOLIO">Portfolyo Dosyası</option>
            <option value="EXAM_SCRIPT">Sınav Kağıdı</option>
            <option value="PRACTICE_RECORD">Uygulama / Ses / Video Kaydı</option>
            <option value="RUBRIC_EVALUATION">Rubrik Değerlendirme Formu</option>
            <option value="EXTERNAL_URL">Harici Kanıt Bağlantısı (URL)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Puan (0-100) *</label>
          <input type="number" name="score" min="0" max="100" value="85" required>
        </div>
        <div class="span-2 form-group">
          <label>Kanıt dosyası yükle (PDF, Proje, Rapor)</label>
          <input type="file" name="evidence_file" id="evidence-file-input" style="border:1.5px dashed var(--slate-300);padding:10px;background:var(--slate-50)">
          <div id="evidence-sha-status" style="margin-top:6px;font-size:0.75rem;font-weight:700;font-family:var(--font-mono);color:var(--slate-500)"></div>
        </div>
        <div class="span-2 form-group">
          <label>veya harici kanıt URL'si</label>
          <input type="url" name="url" placeholder="https://github.com/... veya https://...">
        </div>
        <div class="span-2 form-group">
          <label>Değerlendirici değerlendirme notu *</label>
          <textarea name="notes" placeholder="Öğrenenin çıktıyı karşılama düzeyi, rubrik kriterleri notları..." required></textarea>
        </div>
        <div class="form-footer">
          <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
          <button class="button button--primary" type="submit">🔒 Kanıtı Mühürle ve Kaydet</button>
        </div>
      </form>`);

    const fileInp = $('#evidence-file-input');
    const shaEl = $('#evidence-sha-status');
    if (fileInp && shaEl) {
      fileInp.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return (shaEl.textContent = '');
        shaEl.textContent = 'SHA-256 hesaplanıyor...';
        try {
          const buf = await f.arrayBuffer();
          const hashBuf = await crypto.subtle.digest('SHA-256', buf);
          const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
          shaEl.innerHTML = `<span style="color:var(--green)">✓ SHA-256: ${hashHex} (${(f.size/1024).toFixed(1)} KB)</span>`;
        } catch (err) {
          shaEl.textContent = 'Hash hesaplanamadı: ' + err.message;
        }
      });
    }

    $('#evidence-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const fd = new FormData(form);
      const file = fd.get('evidence_file');
      const body = Object.fromEntries([...fd.entries()].filter(([key]) => key !== 'evidence_file'));
      body.enrollment_id = enrollment.id;
      if (file && file.size > 0) {
        body.original_name = file.name;
        body.content_base64 = await fileToBase64(file);
      }
      try {
        await api('/api/evidences', { method: 'POST', body });
        closeModal();
        toast('Kanıt SHA-256 özetiyle birlikte denetim zincirine kaydedildi.');
        navigate('enrollments');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function evidenceList(enrollment) {
  try {
    const { evidences } = await api(`/api/evidences?enrollment_id=${encodeURIComponent(enrollment.id)}`);
    modal('Öğrenme Kanıtları Zinciri', 'ŞEFFAF VE DENETLENEBİLİR KANITLAR', `
      <div class="callout callout--info">
        <span>🔒</span>
        <div>
          <strong>${esc(enrollment.learner_name)} · ${esc(enrollment.program_title)}</strong>
          Toplam ${evidences.length} kanıt kayıtlıdır. Her kanıt SHA-256 kriptografik özetiyle eşleştirilmiştir.
        </div>
      </div>
      ${evidences.length ? `
        <table class="data-table" style="margin-top:20px">
          <thead>
            <tr><th>Öğrenme Çıktısı</th><th>Kanıt Türü / Dosya</th><th>Puan</th><th>Değerlendirici</th><th></th></tr>
          </thead>
          <tbody>
            ${evidences.map((ev) => `
              <tr>
                <td><strong>${esc(ev.outcome_code)}</strong><br><small style="color:var(--muted)">${esc(ev.outcome_description)}</small></td>
                <td><span class="pill pill--gray">${esc(ev.evidence_type)}</span><br><small class="code">${esc(ev.original_name || ev.source_url || '—')}</small></td>
                <td><strong>${ev.score}</strong> / 100</td>
                <td>${esc(ev.evaluator_name)}<br><small style="color:var(--muted)">${fmtDate(ev.verified_at, true)}</small></td>
                <td>${ev.has_file ? `<a class="button button--secondary button--small" href="/api/evidences/${ev.id}/download">İndir</a>` : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : empty('◇', 'Henüz kanıt eklenmedi', 'Değerlendirici tarafından bir kanıt doğrulandığında burada listelenecektir.')}`);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function feedbackForm(enrollment) {
  modal('Eğitim Geri Bildirimi', 'KALİTE GÜVENCESİ ANKETİ', `
    <form id="feedback-form" class="form-grid">
      <div class="callout callout--info span-2">
        <span>★</span>
        <div>
          <strong>${esc(enrollment.program_title)}</strong>
          Geri bildiriminiz kalite güvencesi göstergelerine anonimleştirilmiş veri olarak yansıtılacaktır.
        </div>
      </div>
      <div class="span-2 form-group">
        <label>Genel Memnuniyet Puanı</label>
        <select name="score">
          <option value="5">★★★★★ 5 — Mükemmel</option>
          <option value="4">★★★★☆ 4 — Çok İyi</option>
          <option value="3">★★★☆☆ 3 — Orta</option>
          <option value="2">★★☆☆☆ 2 — Geliştirilmeli</option>
          <option value="1">★☆☆☆☆ 1 — Yetersiz</option>
        </select>
      </div>
      <div class="span-2 form-group">
        <label>Görüş ve Değerlendirmeniz</label>
        <textarea name="comment" maxlength="2000" placeholder="Eğitim içeriği, eğitici yeterliliği ve uygulama deneyiminiz hakkında görüşlerinizi paylaşın..."></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Geri Bildirimi Gönder</button>
      </div>
    </form>`);

  $('#feedback-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: {
          enrollment_id: enrollment.id,
          score: Number(new FormData(event.currentTarget).get('score')),
          comment: new FormData(event.currentTarget).get('comment')
        }
      });
      closeModal();
      toast('Geri bildiriminiz kalite sistemine iletildi. Teşekkürler!');
      navigate('enrollments');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// 8. DIŞ KAZANIM TANIMA
async function renderRecognitions() {
  const data = await api('/api/recognitions');
  const canCreate = roleCan('STUDENT', 'COORDINATOR');

  content.innerHTML = pageHead(
    'Dış kazanım tanıma',
    'Kurum dışında kazanılmış mikro yeterlilikleri YÖK %10 AKTS ve %50 uzaktan eğitim sınırları içinde tanıyın.',
    canCreate ? '<button class="button button--primary" id="new-recognition">+ Yeni tanıma başvurusu</button>' : ''
  ) + `
    <div class="callout callout--info" style="margin-bottom:20px">
      <span>10%</span>
      <div>
        <strong>Otomatik YÖK Mevzuat Denetimi (Madde 9)</strong>
        Diploma programı toplam AKTS'sinin azami %10'u ve uzaktan kazanımların %50'si kuralları başvuru ve karar aşamalarında otomatik denetlenir.
      </div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h3>Tanıma Başvuruları</h3>
        <small>${data.requests.length} başvuru</small>
      </div>
      <div class="table-wrap">
        ${data.requests.length ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Başvuran</th>
                <th>Dış Kazanım</th>
                <th>Hedef Diploma Programı</th>
                <th>Talep Edilen AKTS</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.requests.map((r) => `
                <tr>
                  <td>
                    <div class="table-title">
                      <strong>${esc(r.applicant_name)}</strong>
                      <small>${esc(r.applicant_email)}</small>
                    </div>
                  </td>
                  <td>
                    <div class="table-title">
                      <strong>${esc(r.credential_title)}</strong>
                      <small style="color:var(--muted)">${esc(r.source_institution)} · ${r.is_distance ? 'Uzaktan' : 'Yüz yüze'}</small>
                    </div>
                  </td>
                  <td>${esc(r.degree_program_title)}</td>
                  <td><strong>${number(r.requested_ects, 2)}</strong> AKTS</td>
                  <td>${statusPill(r.status)}</td>
                  <td class="actions-cell">
                    ${r.has_document ? `<a class="button button--secondary button--small" href="/api/recognitions/${r.id}/document" target="_blank">Belge</a>` : ''}
                    ${['SUBMITTED', 'UNDER_REVIEW'].includes(r.status) && roleCan('COMMISSION', 'EVALUATOR') ? `
                      <button class="button button--secondary button--small" data-recognition="${r.id}">Karar Ver</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : empty('↔', 'Tanıma başvurusu bulunmuyor', 'Kurum dışından alınan mikro yeterlilikler için tanıma talebi oluşturabilirsiniz.')}
      </div>
    </section>`;

  $('#new-recognition')?.addEventListener('click', () => recognitionForm(data.degreePrograms));
}

function recognitionForm(degrees) {
  modal('Dış kazanım tanıma başvurusu', 'YÖK MADDE 9 MEVZUAT UYUMLU', `
    <form id="recognition-form" class="form-grid">
      <div class="form-group">
        <label>Başvuran Ad Soyad</label>
        <input name="applicant_name" value="${esc(state.user.full_name)}" required>
      </div>
      <div class="form-group">
        <label>E-posta Adresi</label>
        <input type="email" name="applicant_email" value="${esc(state.user.email)}" required>
      </div>
      <div class="span-2 form-group">
        <label>Hedef Diploma Programı</label>
        <select name="degree_program_id">
          ${degrees.map((d) => `<option value="${d.id}">${esc(d.title)} — ${d.total_ects} AKTS (Azami %10: ${(d.total_ects * 0.1).toFixed(1)} AKTS)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Dış Kaynak Kurum *</label>
        <input name="source_institution" placeholder="Örn: BTK Akademi, ODTÜ SEM, Coursera" required>
      </div>
      <div class="form-group">
        <label>Dış Yeterlilik / Sertifika Adı *</label>
        <input name="credential_title" placeholder="Örn: Python ile Veri Bilimi" required>
      </div>
      <div class="span-2 form-group">
        <label>Doğrulama URL'si</label>
        <input type="url" name="credential_url" placeholder="https://...">
      </div>
      <div class="span-2 form-group">
        <label>Kaynak Belge Dosyası</label>
        <input type="file" name="source_document">
      </div>
      <div class="form-group">
        <label>Talep Edilen AKTS Kredisi *</label>
        <input type="number" step="0.5" min="0.5" name="requested_ects" value="2" required>
      </div>
      <div class="span-2 form-group">
        <label class="check-label">
          <input type="checkbox" name="is_distance">
          <span>Bu mikro yeterlilik uzaktan eğitim yoluyla alınmıştır.</span>
        </label>
      </div>
      <div class="span-2 form-group">
        <label class="check-label">
          <input type="checkbox" name="course_previously_taken">
          <span>Muafiyet talep edilen ders daha önce başarısız olunan bir derstir.</span>
        </label>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Başvuruyu Gönder</button>
      </div>
    </form>`);

  $('#recognition-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const file = fd.get('source_document');
    const body = Object.fromEntries([...fd.entries()].filter(([key]) => key !== 'source_document'));
    body.is_distance = fd.has('is_distance');
    body.course_previously_taken = fd.has('course_previously_taken');
    if (file && file.size > 0) {
      body.original_name = file.name;
      body.content_base64 = await fileToBase64(file);
    }
    try {
      await api('/api/recognitions', { method: 'POST', body });
      closeModal();
      toast('Tanıma başvurusu mevzuat kontrollerinden geçerek kaydedildi.');
      navigate('recognitions');
    } catch (error) {
      toast(error.payload?.validation?.errors?.join(' ') || error.message, 'error');
    }
  });
}

function recognitionDecision(request) {
  modal('Tanıma kararı', 'KOMİSYON DEĞERLENDİRMESİ', `
    <form id="recognition-decision" class="form-grid">
      <div class="callout callout--info span-2">
        <span>↔</span>
        <div>
          <strong>${esc(request.credential_title)}</strong>
          <div>${esc(request.source_institution)} · ${request.requested_ects} AKTS Talep Edildi</div>
        </div>
      </div>
      <div class="form-group">
        <label>Karar</label>
        <select name="decision">
          <option value="APPROVE">Uygun Bul ve AKTS Tanı</option>
          <option value="REJECT">Talebi Reddet</option>
        </select>
      </div>
      <div class="form-group">
        <label>Onaylanan AKTS</label>
        <input type="number" step="0.5" min="0" name="approved_ects" value="${request.requested_ects}">
      </div>
      <div class="span-2 form-group">
        <label>Karar Gerekçesi</label>
        <textarea name="reason" placeholder="Mevzuat ve içerik uyumu gerekçesi..."></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Kararı Kaydet</button>
      </div>
    </form>`);

  $('#recognition-decision').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/recognitions/${request.id}/decision`, {
        method: 'POST',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Tanıma kararı kaydedildi.');
      navigate('recognitions');
    } catch (error) {
      toast(error.payload?.validation?.errors?.join(' ') || error.message, 'error');
    }
  });
}

// 9. İTİRAZ YÖNETİMİ
async function renderAppeals() {
  const { appeals } = await api('/api/appeals');
  const canCreate = state.user.role === 'STUDENT';

  content.innerHTML = pageHead(
    'İtiraz yönetimi',
    'Başarı sonucu, tanıma ve belge süreçlerine ilişkin öğrenen itirazlarını inceleyin.',
    canCreate ? '<button class="button button--primary" id="new-appeal">+ Yeni itiraz oluştur</button>' : ''
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>İtiraz Başvuruları</h3>
        <small>${appeals.length} kayıt</small>
      </div>
      <div class="table-wrap">
        ${appeals.length ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Başvuran</th>
                <th>İtiraz Konusu</th>
                <th>Kayıt Türü</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${appeals.map((a) => `
                <tr>
                  <td>
                    <strong>${esc(a.appellant_name)}</strong><br>
                    <small style="color:var(--muted)">${esc(a.appellant_email)}</small>
                  </td>
                  <td>
                    <strong>${esc(a.subject)}</strong><br>
                    <small style="color:var(--muted)">${esc(a.description).slice(0, 90)}${a.description.length > 90 ? '…' : ''}</small>
                  </td>
                  <td><span class="pill pill--gray">${esc({ ENROLLMENT_RESULT: 'Başarı Sonucu', RECOGNITION: 'Dış Kazanım', CREDENTIAL: 'Dijital Belge' }[a.case_type] || a.case_type)}</span></td>
                  <td>${statusPill(a.status)}</td>
                  <td>${fmtDate(a.created_at, true)}</td>
                  <td class="actions-cell">
                    ${['SUBMITTED', 'UNDER_REVIEW'].includes(a.status) && roleCan('QUALITY', 'COMMISSION') ? `
                      <button class="button button--secondary button--small" data-appeal="${a.id}">Karar Ver</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : empty('!', 'Kayıtlı itiraz bulunmuyor', 'Öğrenenler tarafından yapılan itiraz başvuruları burada listelenir.')}
      </div>
    </section>`;

  $('#new-appeal')?.addEventListener('click', async () => {
    const [enrollments, recognitions, credentials] = await Promise.all([
      api('/api/enrollments'),
      api('/api/recognitions'),
      api('/api/credentials')
    ]);
    const options = [
      ...enrollments.enrollments.map((e) => ({ value: `ENROLLMENT_RESULT|${e.id}`, label: `Başarı Sonucu · ${e.program_title}` })),
      ...recognitions.requests.map((r) => ({ value: `RECOGNITION|${r.id}`, label: `Dış Kazanım · ${r.credential_title}` })),
      ...credentials.credentials.map((c) => ({ value: `CREDENTIAL|${c.id}`, label: `Belge · ${c.certificate_number}` }))
    ];
    appealForm(options);
  });

  $$('[data-appeal]').forEach((button) => button.addEventListener('click', () => {
    appealDecision(appeals.find((a) => a.id === button.dataset.appeal));
  }));
}

function appealForm(options) {
  modal('Yeni itiraz başvurusu', 'ÖĞRENEN HAKLARI & KALİTE GÜVENCESİ', `
    <form id="appeal-form" class="form-grid">
      <div class="span-2 form-group">
        <label>İtiraz edilen kayıt *</label>
        <select name="case_ref" required>
          ${options.length ? options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('') : '<option value="">İtiraz edilebilir kayıt bulunamadı</option>'}
        </select>
      </div>
      <div class="span-2 form-group">
        <label>İtiraz Konusu *</label>
        <input name="subject" placeholder="Örn: Bitirme projesi değerlendirme puanımın yeniden incelenmesi" required maxlength="200">
      </div>
      <div class="span-2 form-group">
        <label>Açıklama ve Dayanaklar *</label>
        <textarea name="description" placeholder="Talebinizi, ders çıktılarını ve dayanaklarınızı ayrıntılı açıklayın..." required maxlength="4000"></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" ${options.length ? '' : 'disabled'}>İtirazı Gönder</button>
      </div>
    </form>`);

  $('#appeal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const [case_type, entity_id] = String(fd.get('case_ref')).split('|');
    try {
      await api('/api/appeals', {
        method: 'POST',
        body: {
          case_type,
          entity_id,
          subject: fd.get('subject'),
          description: fd.get('description')
        }
      });
      closeModal();
      toast('İtiraz başvurunuz kalite komisyonuna iletildi.');
      navigate('appeals');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function appealDecision(appeal) {
  modal('İtiraz inceleme ve kararı', 'KALİTE KOMİSYONU DEĞERLENDİRMESİ', `
    <form id="appeal-decision-form" class="form-grid">
      <div class="callout callout--info span-2">
        <span>!</span>
        <div>
          <strong>${esc(appeal.subject)}</strong>
          <div>${esc(appeal.description)}</div>
        </div>
      </div>
      <div class="span-2 form-group">
        <label>İtiraz Durumu</label>
        <select name="status">
          <option value="UNDER_REVIEW">İncelemeye Al</option>
          <option value="RESOLVED">Kabul Edildi / Çözümlendi</option>
          <option value="REJECTED">Reddedildi</option>
        </select>
      </div>
      <div class="span-2 form-group">
        <label>Komisyon Karar Gerekçesi *</label>
        <textarea name="decision" placeholder="İnceleme bulguları ve karar metni..." required></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Kararı Kaydet</button>
      </div>
    </form>`);

  $('#appeal-decision-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/appeals/${appeal.id}/decision`, {
        method: 'PATCH',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('İtiraz kararı sisteme işlendi.');
      navigate('appeals');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// 10. DİJİTAL BELGELER
async function renderCredentials() {
  const [data, enrollments] = await Promise.all([api('/api/credentials'), api('/api/enrollments')]);
  const available = enrollments.enrollments.filter((e) => e.status === 'COMPLETED' && !data.credentials.some((c) => c.enrollment_id === e.id));

  const actionsHtml = roleCan('SENATE', 'ADMIN') ? `
    <div style="display:flex;gap:8px">
      ${available.length ? '<button class="button button--primary" id="issue-credential">+ Yeni Belge Düzenle</button>' : ''}
      ${available.length ? '<button class="button button--secondary" id="btn-batch-issue" style="background:var(--wine);color:#fff;border:none">⚡ Toplu İmzala (' + available.length + ')</button>' : ''}
    </div>` : '';

  content.innerHTML = pageHead(
    'Dijital mikro yeterlilik belgeleri',
    'YÖK EK-1, Open Badges 3.0 ve W3C Verifiable Credentials kriptografik çıktıları.',
    actionsHtml
  ) + `
    <section class="panel">
      <div class="panel-head">
        <h3>Belge Sicil Kütüğü</h3>
        <small>${data.credentials.length} belge</small>
      </div>
      <div class="table-wrap">
        ${data.credentials.length ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Belge No</th>
                <th>Öğrenen</th>
                <th>Program</th>
                <th>Düzenleme Tarihi</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.credentials.map((c) => {
                const liUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(c.program_title)}&organizationName=${encodeURIComponent('Kapadokya Üniversitesi')}&certUrl=${encodeURIComponent(window.location.origin + '/verify/' + c.verification_code)}&certId=${encodeURIComponent(c.certificate_number)}`;
                return `
                <tr>
                  <td><span class="code">${esc(c.certificate_number)}</span></td>
                  <td><strong>${esc(c.holder_name)}</strong></td>
                  <td>
                    <div class="table-title">
                      <strong>${esc(c.program_title)}</strong>
                      <small class="code">${esc(c.program_code)}</small>
                    </div>
                  </td>
                  <td>${fmtDate(c.issue_date)}</td>
                  <td>${statusPill(c.status)}</td>
                  <td class="actions-cell">
                    <a class="button button--secondary button--small" href="${liUrl}" target="_blank" title="LinkedIn Profiline Ekle" style="background:#0a66c2;color:#fff;border-color:#0a66c2">💼 LinkedIn</a>
                    <button type="button" class="button button--secondary button--small" data-view-cert="${c.id}" data-title="${esc(c.certificate_number)}">📜 Görünüm</button>
                    <button class="button button--secondary button--small" data-verify="${esc(c.verification_code)}">🔍 Doğrula</button>
                    ${c.status === 'VALID' && roleCan('SENATE') ? `
                      <button class="button button--danger button--small" data-revoke="${c.id}">İptal Et</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : empty('♢', 'Henüz dijital belge düzenlenmedi', 'Başarıyla tamamlanan öğrenenler için kriptografik imzalı belge düzenleyebilirsiniz.')}
      </div>
    </section>`;

  $('#issue-credential')?.addEventListener('click', () => issueCredentialForm(available));
  $('#btn-batch-issue')?.addEventListener('click', async () => {
    if (!confirm(`${available.length} adet başarılı öğrenen için Ed25519 imzalı dijital belgeler toplu olarak üretilsin mi?`)) return;
    try {
      const res = await api('/api/credentials/issue-batch', { method: 'POST' });
      toast(res.message);
      navigate('credentials');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function issueCredentialForm(enrollments) {
  modal('Mikro yeterlilik belgesi düzenle', 'YÖK EK-1 VE ED25519 KRİPTOGRAFİK İMZA', `
    <form id="credential-form" class="form-grid">
      <div class="callout callout--success span-2">
        <span>✓</span>
        <div>
          <strong>Otomatik Kriptografik Ön Doğrulama</strong>
          Öğrenenin tüm çıktı kanıtları, başarı notu, devam oranı ve senato kararı kontrol edilerek Ed25519 anahtarıyla anında imzalanacaktır.
        </div>
      </div>
      <div class="span-2 form-group">
        <label>Başarılı Öğrenen Kaydı *</label>
        <select name="enrollment_id" required>
          ${enrollments.map((e) => `<option value="${e.id}">${esc(e.learner_name)} — ${esc(e.program_title)} (Başarı Notu: ${e.final_score})</option>`).join('')}
        </select>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Belgeyi İmzala ve Düzenle</button>
      </div>
    </form>`);

  $('#credential-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/credentials', {
        method: 'POST',
        body: Object.fromEntries(new FormData(event.currentTarget))
      });
      closeModal();
      toast('Dijital belge Ed25519 anahtarıyla imzalandı ve yayımlandı.');
      await navigate('credentials');
      await showVerification(result.credential.verification_code);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

async function viewCertificateModal(id, title = 'Dijital Belge') {
  try {
    const res = await fetch(`/api/credentials/${id}/certificate`);
    if (!res.ok) {
      let msg = 'Bu belgeyi görüntüleme yetkiniz bulunmamaktadır.';
      try {
        const data = await res.json();
        if (data.message) msg = data.message;
      } catch {}
      modal(
        'Erişim Yetkisi Sınırı',
        'YETKİLENDİRME KONTROLÜ',
        `<div style="text-align:center;padding:18px 8px">
          <div style="width:60px;height:60px;border-radius:50%;background:#fee2e2;color:#991b1b;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px">🔒</div>
          <h3 style="margin:0 0 8px;color:#721b36;font-size:1.25rem">Bu Belgeyi Görüntüleme Yetkiniz Yok</h3>
          <p style="color:#64748b;font-size:0.92rem;line-height:1.6;margin:0 0 16px;max-width:480px;margin-left:auto;margin-right:auto">
            ${esc(msg)}
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;text-align:left;max-width:480px;margin:0 auto 24px;font-size:0.82rem;color:#475569;line-height:1.5">
            <strong>ℹ️ Yetkilendirme Kuralı (YÖK & KVKK):</strong><br>
            Dijital mikro yeterlilik belgelerinin resmi dökümüne yalnızca ilgili öğrenen, üniversite yönetimi ve yetkili akademik kurullar (Yönetici, Senato, Komisyon, Kalite, Koordinatör) erişebilir.
          </div>
          <div style="display:flex;justify-content:center;gap:10px">
            <button class="button button--secondary" type="button" data-close-modal>Anladım, Kapat</button>
          </div>
        </div>`
      );
      return;
    }

    modal(
      `Dijital Belge Görünümü — ${esc(title)}`,
      'RESMİ MİKRO YETERLİLİK BELGESİ (YÖK EK-1 & W3C VC)',
      `<div class="cert-modal-container" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:10px 16px;border-radius:8px;border:1px solid #e2e8f0;flex-wrap:wrap;gap:8px">
          <div style="font-size:0.85rem;color:#475569">
            📜 <strong>${esc(title)}</strong> sicil numaralı resmi mikro yeterlilik sertifikası
          </div>
          <div style="display:flex;gap:8px">
            <a class="button button--secondary button--small" href="/api/credentials/${id}/certificate" target="_blank">🔗 Tam Sayfa / Yeni Sekme</a>
            <button class="button button--primary button--small" type="button" onclick="document.getElementById('cert-iframe')?.contentWindow?.print()">🖨️ Yazdır / PDF İndir</button>
          </div>
        </div>
        <div style="width:100%;height:580px;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #cbd5e1;background:#525659">
          <iframe id="cert-iframe" src="/api/credentials/${id}/certificate" style="width:100%;height:100%;border:none" title="Belge Önizleme"></iframe>
        </div>
      </div>`
    );
  } catch (err) {
    toast(err.message, 'error');
  }
}

// 11. BELGE DOĞRULAMA (VERIFICATION)
async function renderVerification() {
  content.innerHTML = pageHead(
    'Belge doğrulama',
    'KÜN mikro yeterlilik belgelerinin geçerlilik durumunu ve Ed25519 kriptografik imzasını sorgulayın.'
  ) + `
    <section class="verify-card">
      <div class="verify-banner">
        <div>
          <span class="eyebrow eyebrow--gold">KAMUYA AÇIK DOĞRULAMA</span>
          <h2>Belge Kodu ile Sorgula</h2>
        </div>
        <span class="brand-mark">KÜN</span>
      </div>
      <div class="verify-body">
        <form id="verify-form" class="inline-form">
          <input name="code" placeholder="Doğrulama kodunu girin (Örn: 24 karakterli kod)" required>
          <button class="button button--primary" type="submit">Sorgula ve Doğrula</button>
        </form>
        <div id="verify-result" style="margin-top:24px"></div>
      </div>
    </section>`;

  $('#verify-form').addEventListener('submit', (event) => {
    event.preventDefault();
    showVerification(new FormData(event.currentTarget).get('code'));
  });
}

async function showVerification(code, publicMode = false) {
  const target = $('#verify-result') || content;
  target.innerHTML = '<div class="loading"><div><div class="spinner"></div><div>Kriptografik imza doğrulanıyor…</div></div></div>';
  try {
    const d = await api(`/api/verify/${encodeURIComponent(code)}`);
    target.innerHTML = `
      <div class="valid-seal">
        <span>✓</span>
        <div>
          <strong>Belge Geçerli ve Ed25519 Kriptografik İmzası Doğrulandı</strong>
          <small>Sertifika No: ${esc(d.certificate_number)}</small>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-card"><small>Belge Sahibi</small><strong>${esc(d.holder_name)}</strong></div>
        <div class="detail-card"><small>Veren Kurum</small><strong>${esc(d.institution)}</strong></div>
        <div class="detail-card"><small>AKTS / İş Yükü</small><strong>${d.ects} AKTS / ${d.total_hours} Saat</strong></div>
        <div class="detail-card"><small>Düzenleme Tarihi</small><strong>${fmtDate(d.issue_date)}</strong></div>
      </div>
      <div class="program-summary">
        <span class="pill pill--green">Ed25519 DID/W3C İmzası Geçerli</span>
        <p><strong>${esc(d.program_name)}</strong><br><small class="code">${esc(d.program_code)}</small> · TYÇ Seviye ${d.tyc_level} / EQF Seviye ${d.eqf_level}</p>
      </div>
      <div class="format-links">
        <a class="button button--secondary button--small" href="${d.formats.ek1}" target="_blank">📄 YÖK EK-1 JSON</a>
        <a class="button button--secondary button--small" href="${d.formats.badge}" target="_blank">🎖 Open Badges 3.0</a>
        <a class="button button--secondary button--small" href="${d.formats.vc}" target="_blank">🔒 W3C Verifiable Credential</a>
        <a class="button button--secondary button--small" href="${d.formats.jwt}" target="_blank">🔑 VC-JWT Formatı</a>
      </div>`;
  } catch (error) {
    target.innerHTML = `
      <div class="callout callout--warning" style="margin-top:18px">
        <span>×</span>
        <div>
          <strong>Belge Doğrulanamadı</strong>
          <p style="margin:4px 0 0">${esc(error.payload?.reason || error.message)}</p>
        </div>
      </div>`;
  }
}

// 12. KAMUSAL PROGRAM KATALOĞU (/catalog)
async function renderPublicCatalog() {
  const data = await api('/api/catalog');
  content.innerHTML = `
    <div class="verify-card" style="max-width:1080px">
      <div class="verify-banner">
        <div>
          <span class="eyebrow eyebrow--gold">KAPADOKYA ÜNİVERSİTESİ</span>
          <h2>Mikro Yeterlilik Kataloğu</h2>
        </div>
        <a class="button button--secondary button--small" href="/" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.25)">Kurumsal Giriş Yap →</a>
      </div>
      <div class="verify-body">
        <p style="color:var(--slate);line-height:1.7;margin-bottom:24px">
          Senato onaylı mikro yeterlilik programları ve açık eğitim dönemleri. Kayıt ve başvuru için kurumsal hesabınızla giriş yapınız.
        </p>
        
        <h3 class="section-title" style="margin-top:0">Senato Onaylı Programlar</h3>
        ${data.programs.length ? `
          <div class="detail-grid" style="grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:18px">
            ${data.programs.map((p) => `
              <article class="program-summary" style="display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <span class="pill pill--green">TYÇ Seviye ${p.tyc_level} · ${p.ects_credits} AKTS</span>
                  <h3 style="font-family:var(--font-serif);font-size:1.15rem;margin:10px 0 4px;color:var(--slate-900)">${esc(p.title)}</h3>
                  <small class="code">${esc(p.code)} · ${esc({ IN_PERSON: 'Yüz yüze', ONLINE: 'Uzaktan', HYBRID: 'Hibrit' }[p.delivery_mode])}</small>
                  <p style="font-size:0.82rem;line-height:1.6;margin-top:8px">${esc(p.summary)}</p>
                </div>
                <div style="margin-top:14px;color:var(--muted);font-size:0.75rem;border-top:1px solid var(--wine-subtle);padding-top:10px">
                  ⏳ ${p.total_hours} saat iş yükü · 🎯 ${p.outcome_count} öğrenme çıktısı
                </div>
              </article>`).join('')}
          </div>` : empty('◇', 'Açık program bulunmuyor', 'Yeni programlar senato onayından sonra burada listelenecektir.')}

        ${data.offerings.length ? `
          <h3 class="section-title">Başvuruya Açık Eğitim Dönemleri</h3>
          <table class="data-table">
            <thead>
              <tr><th>Eğitim Programı</th><th>Tarih Aralığı</th><th>Katılım</th><th>Kontenjan</th><th>Durum</th></tr>
            </thead>
            <tbody>
              ${data.offerings.map((o) => `
                <tr>
                  <td><strong>${esc(o.program_title)}</strong><br><small class="code">${esc(o.code)}</small></td>
                  <td>${fmtDate(o.start_date)} – ${fmtDate(o.end_date)}</td>
                  <td>${esc({ IN_PERSON: 'Yüz yüze', ONLINE: 'Uzaktan', HYBRID: 'Hibrit' }[o.delivery_mode])}</td>
                  <td>${o.enrolled_count} / ${o.quota}</td>
                  <td>${o.access_type === 'CLOSED' ? '<span class="pill pill--gray">Kapalı Grup</span>' : '<span class="pill pill--green">Kayıt Açık</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : ''}
      </div>
    </div>`;
}

// 13. KALİTE GÖSTERGELERİ
async function renderQuality() {
  const { stats: s, programs, auditIntegrity } = await api('/api/quality');
  content.innerHTML = pageHead(
    'Kalite göstergeleri ve akreditasyon',
    'Katılım, başarı, geri bildirim, YÖKAK ölçütleri ve değişmez denetim güvenilirlik metrikleri.',
    '<button class="button button--primary" id="btn-kidr-report">🖨 Resmi YÖKAK KİDR Raporu Yazdır / İndir</button>'
  ) + `
    <div class="kpi-grid">
      ${kpi('✓', `${number(s.completion_rate, 1)}%`, 'Tamamlama Oranı', '--green', '--green-soft')}
      ${kpi('◉', `%${number(s.avg_attendance, 1)}`, 'Ortalama Devam', '--blue', '--blue-soft')}
      ${kpi('★', `${number(s.avg_feedback, 2)} / 5`, 'Öğrenen Memnuniyeti', '--gold', '--gold-soft')}
      ${kpi('!', s.revoked_credentials, 'İptal Edilen Belge', '--red', '--red-soft')}
    </div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h3>Program Etkililiği ve Başarı</h3></div>
        <div class="panel-body quality-hero">
          <div class="metric-ring" style="--value:${s.completion_rate}">
            <strong>%${number(s.completion_rate, 1)}</strong>
          </div>
          <div class="quality-copy">
            <h3>Öğrenen Başarısı</h3>
            <p>Toplam ${s.enrollments} kayıt arasından ${s.completed} öğrenen başarıyla tamamlamış, ortalama başarı puanı ${number(s.avg_score, 1)} olarak gerçekleşmiştir.</p>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h3>Kalite Uyarıları & Denetim Güvencesi</h3></div>
        <div class="panel-body">
          ${s.overdue_programs ? `
            <div class="callout callout--warning">
              <span>⏱</span>
              <div><strong>${s.overdue_programs} Geciken Karar!</strong> 30 günlük onay SLA süresi aşıldı.</div>
            </div>` : `
            <div class="callout callout--success">
              <span>✓</span>
              <div><strong>Karar Süreleri Uygun</strong> Gecikmiş program teklifi bulunmuyor.</div>
            </div>`}
          ${s.open_appeals ? `
            <div class="callout callout--warning" style="margin-top:12px">
              <span>!</span>
              <div><strong>${s.open_appeals} Açık İtiraz</strong> İtiraz yönetimi ekranında inceleme bekliyor.</div>
            </div>` : ''}
          ${auditIntegrity.valid ? `
            <div class="callout callout--success" style="margin-top:12px">
              <span>🔒</span>
              <div><strong>SHA-256 Denetim Zinciri Doğrulandı</strong> ${auditIntegrity.checked} kayıt bütünlük kontrolünden geçti.</div>
            </div>` : `
            <div class="callout callout--warning" style="margin-top:12px">
              <span>!</span>
              <div><strong>Denetim Zinciri İnceleme İstiyor</strong> ${esc(auditIntegrity.reason || 'Bilinmeyen durum')}</div>
            </div>`}
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:20px">
      <div class="panel-head">
        <h3>Program Bazlı Göstergeler</h3>
        <small>${programs.length} program</small>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Program</th><th>Toplam Kayıt</th><th>Tamamlayan</th><th>Ortalama Puan</th><th>Öğrenen Memnuniyeti</th></tr>
          </thead>
          <tbody>
            ${programs.map((p) => `
              <tr>
                <td><strong>${esc(p.title)}</strong><br><small class="code">${esc(p.code)}</small></td>
                <td>${number(p.enrollments)}</td>
                <td><strong>${number(p.completed)}</strong></td>
                <td>${number(p.avg_score, 1)}</td>
                <td>★ ${number(p.avg_feedback, 2)} / 5</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;

  $('#btn-kidr-report')?.addEventListener('click', () => {
    modal('YÖKAK Kurum İç Değerlendirme Raporu (KİDR)', 'RESMİ AKREDİTASYON ÖZET RAPORU', `
      <div class="kidr-print-modal" style="padding:4px">
        <div style="text-align:center;border-bottom:2px solid var(--wine);padding-bottom:12px;margin-bottom:16px">
          <strong style="color:var(--wine);font-size:1.05rem;display:block">T.C. KAPADOKYA ÜNİVERSİTESİ</strong>
          <h3 style="margin:4px 0;font-family:var(--font-serif);font-size:1.25rem">Mikro Yeterlilik Kurum İç Değerlendirme ve Akreditasyon Raporu</h3>
          <small style="color:var(--slate-500);font-weight:600">Rapor Düzenleme Tarihi: ${new Date().toLocaleDateString('tr-TR')}</small>
        </div>
        <div class="grid-3" style="margin-bottom:16px">
          <div class="detail-card"><small>Toplam Öğrenen</small><strong>${s.enrollments} Kayıt</strong></div>
          <div class="detail-card"><small>Program Tamamlama</small><strong>%${number(s.completion_rate, 1)}</strong></div>
          <div class="detail-card"><small>Öğrenen Memnuniyeti</small><strong>★ ${number(s.avg_feedback, 2)} / 5.0</strong></div>
        </div>
        <table class="data-table" style="margin-bottom:16px;width:100%">
          <thead><tr><th>Program Başlığı</th><th>Kayıt</th><th>Tamamlayan</th><th>Ort. Puan</th><th>Memnuniyet</th></tr></thead>
          <tbody>
            ${programs.map((p) => `<tr><td><strong>${esc(p.title)}</strong></td><td>${p.enrollments}</td><td>${p.completed}</td><td>${number(p.avg_score, 1)}</td><td>★ ${number(p.avg_feedback, 2)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="callout callout--success" style="margin-bottom:16px">
          <span>🔒</span>
          <div>
            <strong>Kriptografik SHA-256 Denetim Bütünlüğü Onaylandı</strong>
            <div>Tüm kayıtlar ve senato kararları tahrif edilemez blok zinciri yapısıyla mühürlenmiştir (${auditIntegrity.checked}/${auditIntegrity.total} kayıt).</div>
          </div>
        </div>
        <div class="form-footer">
          <button type="button" class="button button--secondary" data-close-modal>Kapat</button>
          <button type="button" class="button button--primary" onclick="window.print()">🖨 Yazdır / PDF Olarak Kaydet</button>
        </div>
      </div>`);
  });
}

// 14. DEĞİŞMEZ DENETİM İZİ
async function renderAudit() {
  const { logs, integrity } = await api('/api/audit');
  content.innerHTML = pageHead(
    'Değişmez denetim izi',
    'Kim, ne zaman, hangi akademik veya idari kaydı değiştirdi? SHA-256 zinciriyle mühürlenmiş loglar.'
  ) + `
    <div class="callout ${integrity.valid ? 'callout--success' : 'callout--warning'}" style="margin-bottom:20px">
      <span>${integrity.valid ? '🔒' : '!'}</span>
      <div>
        <strong>${integrity.valid ? 'Kriptografik SHA-256 Zinciri Doğrulandı' : 'Denetim Zincirinde Uyuşmazlık'}</strong>
        ${integrity.checked} / ${integrity.total} kayıt kontrol edildi ${integrity.reason ? ` · ${esc(integrity.reason)}` : ''}
      </div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <h3>Son 250 İşlem</h3>
        <small>Blokzincir Benzeri SHA-256 Hash Zinciri</small>
      </div>
      <div class="table-wrap">
        ${logs.length ? `
          <table class="data-table">
            <thead>
              <tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Varlık</th><th>Zincir Hash Özeti</th></tr>
            </thead>
            <tbody>
              ${logs.map((l) => `
                <tr>
                  <td>${fmtDate(l.created_at, true)}</td>
                  <td><strong>${esc(l.actor_name || 'Sistem')}</strong></td>
                  <td><span class="pill pill--gray">${esc(l.action)}</span></td>
                  <td>${esc(l.entity_type)}<br><small class="code">${esc(l.entity_id).slice(0, 12)}…</small></td>
                  <td class="hash">${esc(l.hash_chain).slice(0, 24)}…</td>
                </tr>`).join('')}
            </tbody>
          </table>` : empty('≡', 'Denetim kaydı bulunmuyor', 'Sistemdeki ilk işlemle birlikte kriptografik zincir başlatılacaktır.')}
      </div>
    </section>`;
}

// GENEL OLAY DİNLEYİCİSİ
document.addEventListener('click', async (event) => {
  try {
    if (event.target.closest('[data-open-login]')) return openLoginModal();

    const viewProgBtn = event.target.closest('[data-view-program]');
    if (viewProgBtn) return viewLandingProgramDetail(viewProgBtn.dataset.viewProgram);

    const viewButton = event.target.closest('[data-view]');
    if (viewButton) return navigate(viewButton.dataset.view);

    const goButton = event.target.closest('[data-go]');
    if (goButton) return navigate(goButton.dataset.go);

    const programButton = event.target.closest('[data-program]');
    if (programButton) return openProgramDetail(programButton.dataset.program);

    const resultButton = event.target.closest('[data-result]');
    if (resultButton) {
      const enrollment = await getEnrollmentById(resultButton.dataset.result);
      if (enrollment) return resultForm(enrollment);
    }

    const evidenceButton = event.target.closest('[data-evidence]');
    if (evidenceButton) {
      const enrollment = await getEnrollmentById(evidenceButton.dataset.evidence);
      if (enrollment) return evidenceForm(enrollment);
    }

    const evidenceListButton = event.target.closest('[data-evidence-list]');
    if (evidenceListButton) {
      const enrollment = await getEnrollmentById(evidenceListButton.dataset.evidenceList);
      if (enrollment) return evidenceList(enrollment);
    }

    const feedbackButton = event.target.closest('[data-feedback]');
    if (feedbackButton) {
      const enrollment = await getEnrollmentById(feedbackButton.dataset.feedback);
      if (enrollment) return feedbackForm(enrollment);
    }

    const appealEnrollmentButton = event.target.closest('[data-appeal-enrollment]');
    if (appealEnrollmentButton) {
      await navigate('appeals');
      return $('#new-appeal')?.click();
    }

    const verifyButton = event.target.closest('[data-verify]');
    if (verifyButton) {
      await navigate('verification');
      return showVerification(verifyButton.dataset.verify);
    }

    const recognitionButton = event.target.closest('[data-recognition]');
    if (recognitionButton) {
      const data = await api('/api/recognitions');
      return recognitionDecision(data.requests.find((r) => r.id === recognitionButton.dataset.recognition));
    }

    const viewCertBtn = event.target.closest('[data-view-cert]');
    if (viewCertBtn) {
      return viewCertificateModal(viewCertBtn.dataset.viewCert, viewCertBtn.dataset.title);
    }

  const revokeButton = event.target.closest('[data-revoke]');
  if (revokeButton) {
    const reason = prompt('Belge iptal gerekçesini belirtiniz:');
    if (reason) {
      try {
        await api(`/api/credentials/${revokeButton.dataset.revoke}/revoke`, {
          method: 'POST',
          body: { reason }
        });
        toast('Belge başarıyla iptal edildi.');
        navigate('credentials');
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  }

    if (event.target.closest('[data-close-modal]') || event.target.matches('.modal-backdrop')) {
      closeModal();
    }
  } catch (err) {
    console.error('Click handler error:', err);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

// Giriş Formu
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('#login-error');
  error.hidden = true;
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: Object.fromEntries(new FormData(event.currentTarget))
    });
    state.user = result.user;
    state.csrf = result.csrf;
    setupApp();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

// Demo Butonları
$$('[data-demo]').forEach((button) => {
  button.addEventListener('click', () => {
    $$('[data-demo]').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    $('#login-form [name=email]').value = `${button.dataset.demo}@kapadokya.edu.tr`;
    $('#login-form [name=password]').value = 'Kun2026!';
  });
});

$('#catalog-button')?.addEventListener('click', () => {
  location.href = '/catalog';
});

$('#logout-button')?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    showLogin();
  }
});

// Mobil Menü
$('#menu-button')?.addEventListener('click', () => {
  $('.sidebar').classList.toggle('open');
  $('#sidebar-backdrop')?.classList.toggle('active');
});

$('#sidebar-backdrop')?.addEventListener('click', () => {
  $('.sidebar').classList.remove('open');
  $('#sidebar-backdrop')?.classList.remove('active');
});

// Başlatıcı
async function init() {
  const publicMatch = location.pathname.match(/^\/verify\/([A-Za-z0-9_-]+)$/);
  const catalogMatch = location.pathname === '/catalog';

  if (publicMatch || catalogMatch) {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    if (loginScreen) {
      loginScreen.hidden = true;
      loginScreen.style.display = 'none';
    }
    if (appShell) {
      appShell.hidden = false;
      appShell.style.display = 'block';
      appShell.classList.add('public-mode');
    }
    if (publicMatch) {
      content.innerHTML = `
        <section class="verify-card">
          <div class="verify-banner">
            <div>
              <span class="eyebrow eyebrow--gold">KAMUYA AÇIK DOĞRULAMA</span>
              <h2>Kapadokya Üniversitesi</h2>
            </div>
            <a class="button button--secondary button--small" href="/" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.25)">Kurumsal Giriş →</a>
          </div>
          <div class="verify-body">
            <div id="verify-result"></div>
          </div>
        </section>`;
      return showVerification(publicMatch[1], true);
    }
    return renderPublicCatalog();
  }

  const route = resolveRouteFromPath(location.pathname);
  if (route.isPortal) {
    state.view = route.view || "dashboard";
  }

  try {
    const result = await api('/api/me');
    state.user = result.user;
    state.csrf = result.csrf;
    setupApp(route.isPortal ? route.view : null, !route.isPortal);
  } catch {
    showLogin(false);
    if (route.isPortal) {
      openLoginModal();
      const prefix = ROLE_SLUGS[route.role] || "admin";
      const demoBtn = document.querySelector(`[data-demo="${prefix}"]`);
      if (demoBtn) demoBtn.click();
    }
  }
}

window.addEventListener("popstate", () => {
  if (location.pathname === "/" || location.pathname === "") {
    if (state.user) showLogin(false);
    return;
  }
  const route = resolveRouteFromPath(location.pathname);
  if (route.isPortal && state.user) {
    navigate(route.view, false);
  } else if (!state.user && route.isPortal) {
    showLogin(false);
    openLoginModal();
  }
});

init();

function batchEnrollmentForm(offerings) {
  const activeOfferings = offerings.filter((o) => ["OPEN", "RUNNING"].includes(o.status));
  modal("Toplu Öğrenen Kaydı", "TOPLU VERİ GİRİŞİ", `
    <form id="batch-form" class="form-grid">
      <div class="span-2 form-group">
        <label>Kayıt yapılacak eğitim *</label>
        <select name="offering_id" required>
          ${activeOfferings.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.program_title)}</option>`).join("")}
        </select>
      </div>
      <div class="span-2 form-group">
        <label>Öğrenen Listesi (Her satıra: Ad Soyad, E-posta, T.C. Kimlik No) *</label>
        <textarea name="batch_data" style="min-height:140px;font-family:var(--font-mono);font-size:0.8rem" placeholder="Ahmet Yılmaz, ahmet@kapadokya.edu.tr, 11111111110&#10;Mehmet Demir, mehmet@kapadokya.edu.tr, 22222222220&#10;Ayşe Kaya, ayse@kapadokya.edu.tr, 33333333330" required></textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="button button--secondary" data-close-modal>Vazgeç</button>
        <button class="button button--primary" type="submit">Toplu Kaydet</button>
      </div>
    </form>`);

  $("#batch-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const offeringId = fd.get("offering_id");
    const rawLines = fd.get("batch_data").split("\n").map((l) => l.trim()).filter(Boolean);
    let successCount = 0;
    for (const line of rawLines) {
      const parts = line.split(/[,;\t]+/).map((p) => p.trim());
      if (parts.length >= 3) {
        try {
          await api("/api/enrollments", {
            method: "POST",
            body: {
              offering_id: offeringId,
              learner_name: parts[0],
              learner_email: parts[1],
              identity_number: parts[2],
              learner_type: parts[1].includes("kapadokya.edu.tr") ? "INTERNAL_KUN" : "EXTERNAL"
            }
          });
          successCount++;
        } catch {}
      }
    }
    closeModal();
    toast(`${successCount} öğrenen başarıyla kaydedildi.`);
    navigate("enrollments");
  });
}

// Hızlı Rol Değiştirici Dinleyicisi
document.getElementById("quick-role-select")?.addEventListener("change", async (e) => {
  const roleMap = {
    admin: "admin",
    koordinator: "koordinator",
    birim: "birim",
    komisyon: "komisyon",
    senato: "senato",
    degerlendirici: "degerlendirici",
    kalite: "kalite",
    ogrenci: "ogrenci"
  };
  const prefix = roleMap[e.target.value] || "admin";
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: { email: `${prefix}@kapadokya.edu.tr`, password: "Kun2026!" }
    });
    state.user = result.user;
    state.csrf = result.csrf;
    setupApp();
    toast(`Rol değiştirildi: ${roleLabels[result.user.role]}`);
  } catch (err) {
    toast(err.message, "error");
  }
});


const landingState = {
  programs: [],
  activeCategory: "ALL",
  searchQuery: ""
};

function getProgramCategory(p) {
  const text = `${p.title} ${p.summary || ""} ${p.description || ""}`.toLowerCase();
  const isced = p.isced_code || "";
  if (isced === "0613" || text.includes("yapay zekâ") || text.includes("yazılım") || text.includes("bilişim")) return "TECH";
  if (isced === "0714" || isced === "0715" || text.includes("plc") || text.includes("solidworks") || text.includes("otomasyon") || text.includes("tasarım") || text.includes("üretim")) return "ENG";
  if (isced === "0511" || text.includes("dna") || text.includes("rna") || text.includes("izolasyon") || text.includes("biyoloji")) return "BIO";
  if (isced === "0732" || text.includes("maliyet") || text.includes("inşaat") || text.includes("mimarlık") || text.includes("ihale")) return "CONST";
  return "OTHER";
}

function renderLandingCatalog() {
  const catalogGrid = document.getElementById("landing-catalog-grid");
  if (!catalogGrid) return;
  const modeMap = { IN_PERSON: "Yüz yüze", ONLINE: "Uzaktan", HYBRID: "Hibrit" };
  const catNames = {
    TECH: "Yapay Zekâ & Bilişim",
    ENG: "Mühendislik & İmalat",
    BIO: "Biyoteknoloji & Sağlık",
    CONST: "Mimarlık & İnşaat",
    OTHER: "Akademik Gelişim"
  };

  let list = landingState.programs;

  if (landingState.activeCategory !== "ALL") {
    list = list.filter(p => getProgramCategory(p) === landingState.activeCategory);
  }

  if (landingState.searchQuery) {
    const q = landingState.searchQuery.toLowerCase();
    list = list.filter(p => 
      p.title.toLowerCase().includes(q) ||
      (p.summary || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  }

  if (!list.length) {
    catalogGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:#ffffff;border:1.5px dashed var(--slate-200);border-radius:14px">
        <div style="font-size:2rem;margin-bottom:8px">🔍</div>
        <strong style="font-size:1.1rem;color:var(--slate-800)">Arama kriterine uygun program bulunamadı</strong>
        <p style="color:var(--slate-500);font-size:0.88rem;margin:6px 0 16px">Farklı bir kategori seçebilir veya arama kelimesini değiştirebilirsiniz.</p>
        <button class="button button--secondary button--small" id="btn-reset-filters">Filtreleri Temizle</button>
      </div>`;
    document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
      landingState.activeCategory = "ALL";
      landingState.searchQuery = "";
      const searchInput = document.getElementById("catalog-search-input");
      if (searchInput) searchInput.value = "";
      document.querySelectorAll(".cat-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.category === "ALL"));
      renderLandingCatalog();
    });
    return;
  }

  catalogGrid.innerHTML = list.map(p => {
    const cat = getProgramCategory(p);
    return `
      <article class="program-card">
        <div class="program-card-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span class="pill pill--wine" style="font-size:0.7rem;font-weight:800">TYÇ Seviye ${p.tyc_level} · EQF ${p.eqf_level}</span>
          <span class="badge badge--success" style="font-size:0.7rem">✓ Senato Onaylı</span>
        </div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--gold-dark);text-transform:uppercase;letter-spacing:0.04em">
          ${catNames[cat] || "Program"} · ${esc(p.code)}
        </div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.summary || p.description || "")}</p>
        <div class="program-meta">
          <div><small>KREDİ</small><span>${p.ects_credits} AKTS</span></div>
          <div><small>İŞ YÜKÜ</small><span>${p.total_hours} Saat</span></div>
          <div><small>TÜR</small><span>${modeMap[p.delivery_mode] || p.delivery_mode}</span></div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center">
          <button class="button button--secondary button--small" data-view-program="${p.id}">Detayları İncele</button>
          <button class="button button--primary button--small" style="background:var(--wine);color:#ffffff;font-weight:700;border:none" data-open-login>Hemen Başvur →</button>
        </div>
      </article>
    `;
  }).join("");

  // Detay ve login butonlarını bağla
  catalogGrid.querySelectorAll("[data-view-program]").forEach(btn => {
    btn.addEventListener("click", () => viewLandingProgramDetail(btn.dataset.viewProgram));
  });
  catalogGrid.querySelectorAll("[data-open-login]").forEach(btn => {
    btn.addEventListener("click", openLoginModal);
  });
}

function initAktsCalculator() {
  const range = document.getElementById("calc-hours-range");
  const display = document.getElementById("calc-hours-display");
  const ectsRes = document.getElementById("calc-ects-result");
  const statusBadge = document.getElementById("calc-validity-status");
  const maxEcts = document.getElementById("calc-max-ects");
  const maxRemote = document.getElementById("calc-max-remote");

  if (!range) return;

  function update() {
    const hours = Number(range.value);
    const degreeRadio = document.querySelector('input[name="calc-degree"]:checked');
    const degreeTotal = Number(degreeRadio ? degreeRadio.value : 120);

    if (display) display.textContent = `${hours} Saat`;

    const ects = Math.floor(hours / 25);
    const isMultiple = hours % 25 === 0;

    if (ectsRes) ectsRes.textContent = `${ects} AKTS`;

    if (statusBadge) {
      if (isMultiple && hours > 0) {
        statusBadge.className = "stat-status-badge status--ok";
        statusBadge.textContent = "✓ YÖK 25 Kat Kuralına Tam Uygun";
      } else {
        statusBadge.className = "stat-status-badge status--warn";
        statusBadge.textContent = `⚠️ 25 saatin tam katı olmalı (Kalan: ${hours % 25} saat)`;
      }
    }

    const allowable = Math.floor(degreeTotal * 0.10);
    const maxRem = Math.floor(allowable * 0.50);

    if (maxEcts) maxEcts.textContent = `${allowable} AKTS (${degreeTotal} AKTS'nin %10'u)`;
    if (maxRemote) maxRemote.textContent = `${maxRem} AKTS (Tanınan kredinin %50'si)`;
  }

  range.addEventListener("input", update);
  document.querySelectorAll('input[name="calc-degree"]').forEach(r => r.addEventListener("change", update));
  update();
}

async function initLandingPage() {
  initAktsCalculator();

  const catalogGrid = document.getElementById("landing-catalog-grid");
  if (!catalogGrid) return;

  try {
    const data = await api("/api/catalog");
    landingState.programs = data.programs || [];
    renderLandingCatalog();
  } catch (err) {
    catalogGrid.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
  }

  // Kategori Sekmeleri
  const tabs = document.querySelectorAll(".cat-tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      landingState.activeCategory = tab.dataset.category || "ALL";
      renderLandingCatalog();
    });
  });

  // Arama Girişi
  const searchInput = document.getElementById("catalog-search-input");
  const clearBtn = document.getElementById("catalog-search-clear");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      landingState.searchQuery = e.target.value.trim();
      if (clearBtn) clearBtn.hidden = !landingState.searchQuery;
      renderLandingCatalog();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.hidden = true;
      landingState.searchQuery = "";
      renderLandingCatalog();
    });
  }

  // Hızlı Doğrulama Örnek Kod Butonu
  const quickFillBtn = document.getElementById("btn-quick-fill-sample");
  if (quickFillBtn) {
    quickFillBtn.addEventListener("click", () => {
      const codeInput = document.getElementById("verify-code-input");
      if (codeInput) {
        codeInput.value = "6xmUOqvkADsDT6N6FO3SiS18oG9tZEbd";
        document.getElementById("landing-verify-form")?.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  }
}

async function viewLandingProgramDetail(programId) {
  try {
    const { program: p } = await api(`/api/programs/${programId}`);
    const modeMap = { IN_PERSON: "Yüz yüze", ONLINE: "Uzaktan", HYBRID: "Hibrit" };
    modal(p.title, `${p.code} · TYÇ SEVİYE ${p.tyc_level} · ${p.ects_credits} AKTS`, `
      <div class="program-detail-view">
        <div class="callout callout--success" style="margin-bottom:16px">
          <span>✓</span>
          <div>
            <strong>Kapadokya Üniversitesi Senatosu Tarafından Akredite Edilmiştir</strong>
            <div>Bu program YÖK 2026 Mikro Yeterlilikler Çerçevesine tam uyumlu olarak 25 saat = 1 AKTS kuralına göre kredilendirilmiştir.</div>
          </div>
        </div>
        <div class="grid-3" style="margin-bottom:16px">
          <div class="detail-card"><small>Toplam Kredi</small><strong>${p.ects_credits} AKTS (${p.total_hours} Saat)</strong></div>
          <div class="detail-card"><small>Seviye</small><strong>TYÇ ${p.tyc_level} / EQF ${p.eqf_level}</strong></div>
          <div class="detail-card"><small>Eğitim Türü</small><strong>${modeMap[p.delivery_mode] || p.delivery_mode}</strong></div>
        </div>
        <div style="margin-bottom:16px">
          <h4 style="margin:0 0 6px;color:var(--wine);font-size:0.95rem">Programın Amacı ve Kapsamı</h4>
          <p style="font-size:0.86rem;color:var(--slate-600);line-height:1.6">${esc(p.description || p.summary || "Belirtilmemiş.")}</p>
        </div>
        <div style="margin-bottom:16px">
          <h4 style="margin:0 0 6px;color:var(--wine);font-size:0.95rem">Hedeflenen Öğrenme Çıktıları (Bloom Taksonomisi)</h4>
          <ul style="margin:0;padding-left:18px;font-size:0.84rem;color:var(--slate-700);line-height:1.6">
            ${(p.outcomes || []).map(o => `<li><strong>${esc(o.code)}:</strong> ${esc(o.description)} <small style="color:var(--gold-dark);font-weight:700">(${esc(o.bloom_level)})</small></li>`).join("")}
          </ul>
        </div>
        <div style="margin-bottom:16px">
          <h4 style="margin:0 0 6px;color:var(--wine);font-size:0.95rem">Ölçme ve Değerlendirme Koşulları</h4>
          <ul style="margin:0;padding-left:18px;font-size:0.84rem;color:var(--slate-700);line-height:1.6">
            ${(p.assessments || []).map(a => `<li><strong>${esc(a.title)}:</strong> Ağırlık %${a.weight}, Başarı Barajı ${a.threshold}/100</li>`).join("")}
          </ul>
        </div>
        <div class="form-footer">
          <button type="button" class="button button--secondary" data-close-modal>Kapat</button>
          <button class="button button--primary" data-open-login>Kurumsal Giriş Yaparak Başvur →</button>
        </div>
      </div>
    `);
  } catch (err) {
    toast(err.message, "error");
  }
}

function openLoginModal() {
  const modal = document.getElementById("login-modal");
  if (modal) {
    modal.hidden = false;
    modal.style.display = "grid";
  }
}

function closeLoginModal() {
  const modal = document.getElementById("login-modal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
}

window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;

// Landing verify form
document.getElementById("landing-verify-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = (document.getElementById("verify-code-input")?.value || new FormData(e.currentTarget).get("code") || "").trim();
  const resEl = document.getElementById("landing-verify-result");
  if (!resEl) return;
  resEl.innerHTML = '<div class="loading"><div class="spinner"></div><div>Kriptografik imza ve YÖK EK-1 doğrulanıyor…</div></div>';
  try {
    const res = await api(`/api/verify/${encodeURIComponent(code)}`);
    resEl.innerHTML = `
      <div class="callout callout--success" style="margin-top:16px;background:rgba(255,255,255,0.96);color:var(--slate-900);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,0.15)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--green);color:#fff;font-weight:900">✓</span>
          <div>
            <strong style="font-size:1.1rem;color:var(--wine)">${esc(res.program_name)}</strong>
            <div style="font-size:0.75rem;color:var(--slate-500)">Belge No: ${esc(res.certificate_number)} · Kod: ${esc(res.program_code)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:12px 0;background:var(--slate-50);padding:10px;border-radius:8px;font-size:0.8rem">
          <div><span style="color:var(--slate-500);display:block;font-size:0.7rem">ÖĞRENEN</span><strong>${esc(res.holder_name)}</strong></div>
          <div><span style="color:var(--slate-500);display:block;font-size:0.7rem">KREDİ & İŞ YÜKÜ</span><strong>${res.ects} AKTS (${res.total_hours} Saat)</strong></div>
          <div><span style="color:var(--slate-500);display:block;font-size:0.7rem">DÜZENLEME TARİHİ</span><strong>${res.issue_date}</strong></div>
        </div>
        <div style="font-size:0.74rem;color:var(--green-dark);font-weight:700;display:flex;gap:12px;flex-wrap:wrap">
          <span>✓ Ed25519 Dijital İmzası Geçerli</span>
          <span>✓ W3C Verifiable Credential Mühürlü</span>
          <span>✓ Open Badges 3.0 Uyumlu</span>
        </div>
      </div>`;
  } catch (err) {
    resEl.innerHTML = `<div class="callout callout--danger" style="margin-top:16px;background:rgba(255,255,255,0.95);color:var(--red-dark);border-radius:10px;padding:16px"><span>!</span><div><strong>Belge Doğrulanamadı</strong><br>${esc(err.message)}</div></div>`;
  }
});

document.getElementById("btn-open-login")?.addEventListener("click", openLoginModal);
document.getElementById("btn-close-login")?.addEventListener("click", closeLoginModal);
document.getElementById("login-backdrop")?.addEventListener("click", closeLoginModal);

