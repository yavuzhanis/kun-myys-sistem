import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, audit, notify, verifyAuditChain } from './db.js';
import {
  calculateEcts,
  DELIVERY_MODES,
  PROGRAM_STATUSES,
  validateProgramForSubmission,
  validateRecognitionLimits,
  maskIdentity,
  maskName
} from './rules.js';
import {
  createCredentialBundle,
  publicKeyDocument,
  verifyDocumentProof,
  verifyJwt
} from './credentials.js';
import {
  clearSessionCookie,
  hashPassword,
  parseCookies,
  randomToken,
  safeEqual,
  sessionCookie,
  verifyPassword
} from './security.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const routes = [];
const loginAttempts = new Map();
const USER_ROLES = ['ADMIN', 'COORDINATOR', 'UNIT_BOARD', 'COMMISSION', 'SENATE', 'EVALUATOR', 'QUALITY', 'STUDENT'];
const EVIDENCE_TYPES = ['EXAM_SCRIPT', 'PROJECT_FILE', 'PORTFOLIO', 'RUBRIC_EVALUATION', 'PRACTICE_RECORD', 'EXAM_RECORD', 'EXTERNAL_URL'];

function addRoute(method, pattern, handler, options = {}) {
  routes.push({ method, pattern, handler, auth: options.auth !== false, roles: options.roles || null, csrf: options.csrf !== false });
}

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...headers
  });
  res.end(body);
}

function sendHtml(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.maxUploadBytes * 1.5 + 1024 * 1024) throw Object.assign(new Error('İstek boyutu izin verilen sınırı aşıyor.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Geçersiz JSON içeriği.'), { status: 400 });
  }
}

function clientIp(req) {
  if (config.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || null;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie || '').kun_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.csrf_token, s.expires_at, u.id, u.full_name, u.email, u.role, u.unit_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active=1`).get(tokenHash(token));
  return row ? { token, ...row } : null;
}

function assertRole(session, roles) {
  if (!roles || roles.includes(session.role) || session.role === 'ADMIN') return;
  throw Object.assign(new Error('Bu işlem için yetkiniz bulunmuyor.'), { status: 403 });
}

function requiredText(value, label, max = 2000) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${label} zorunludur.`), { status: 422 });
  if (text.length > max) throw Object.assign(new Error(`${label} en fazla ${max} karakter olabilir.`), { status: 422 });
  return text;
}

function emailAddress(value, label = 'E-posta') {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error(`${label} geçersizdir.`), { status: 422 });
  }
  return email;
}

function httpUrl(value, label = 'URL') {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error(`${label} yalnızca geçerli HTTP/HTTPS adresi olabilir.`), { status: 422 });
  }
}

function gradeForScore(score) {
  if (score >= 90) return 'AA';
  if (score >= 85) return 'BA';
  if (score >= 80) return 'BB';
  if (score >= 75) return 'CB';
  if (score >= 70) return 'CC';
  if (score >= 65) return 'DC';
  if (score >= 60) return 'DD';
  if (score >= 50) return 'FD';
  return 'FF';
}

function evidenceCoverage(enrollmentId, programId) {
  const total = Number(db.prepare('SELECT COUNT(*) count FROM learning_outcomes WHERE program_id=?').get(programId).count);
  const covered = Number(db.prepare(`SELECT COUNT(DISTINCT ev.outcome_id) count FROM evidences ev
    JOIN learning_outcomes lo ON lo.id=ev.outcome_id WHERE ev.enrollment_id=? AND lo.program_id=?`).get(enrollmentId, programId).count);
  return { total, covered, complete: total > 0 && covered === total };
}

function notifyEmail(email, details) {
  if (!email) return;
  const user = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?) AND is_active=1').get(email);
  if (user) notify({ ...details, userId: user.id });
}

async function storeBase64File({ contentBase64, originalName, prefix }) {
  if (!contentBase64) return null;
  const cleanName = String(originalName || 'belge.bin').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
  const buffer = Buffer.from(String(contentBase64), 'base64');
  if (!buffer.length || buffer.length > config.maxUploadBytes) throw Object.assign(new Error('Dosya boş veya boyut sınırını aşıyor.'), { status: 413 });
  const extension = path.extname(cleanName).slice(0, 12);
  const filePath = path.join(config.evidencePath, `${prefix}-${crypto.randomUUID()}${extension}`);
  await fsp.writeFile(filePath, buffer, { mode: 0o600 });
  return { filePath, originalName: cleanName, size: buffer.length, hash: crypto.createHash('sha256').update(buffer).digest('hex') };
}

function programCode() {
  const year = new Date().getFullYear();
  const count = Number(db.prepare('SELECT COUNT(*) count FROM programs WHERE code LIKE ?').get(`KUN-MY-${year}-%`).count) + 1;
  return `KUN-MY-${year}-${String(count).padStart(3, '0')}`;
}

function dueIn30Days() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString();
}

function getProgram(id) {
  const program = db.prepare(`SELECT p.*, u.full_name creator_name, u.unit_name creator_unit
    FROM programs p JOIN users u ON u.id=p.created_by WHERE p.id=?`).get(id);
  if (!program) return null;
  program.outcomes = db.prepare('SELECT * FROM learning_outcomes WHERE program_id=? ORDER BY code').all(id);
  program.workloads = db.prepare('SELECT * FROM workloads WHERE program_id=? ORDER BY rowid').all(id);
  program.assessments = db.prepare('SELECT * FROM assessments WHERE program_id=? ORDER BY code').all(id);
  program.mappings = db.prepare(`SELECT lo.code outcome_code, a.code assessment_code
    FROM outcome_assessments oa
    JOIN learning_outcomes lo ON lo.id=oa.outcome_id
    JOIN assessments a ON a.id=oa.assessment_id
    WHERE lo.program_id=? ORDER BY lo.code, a.code`).all(id);
  program.approvals = db.prepare(`SELECT a.*, u.full_name decided_by_name
    FROM approvals a LEFT JOIN users u ON u.id=a.decided_by
    WHERE a.program_id=? ORDER BY a.step_order`).all(id);
  return program;
}

function normaliseProgram(body, fallback = {}) {
  const workloads = Array.isArray(body.workloads) ? body.workloads : fallback.workloads || [];
  const calc = calculateEcts(workloads);
  return {
    code: String(body.code || fallback.code || programCode()).trim().toUpperCase(),
    title: String(body.title ?? fallback.title ?? '').trim(),
    summary: String(body.summary ?? fallback.summary ?? '').trim(),
    description: String(body.description ?? fallback.description ?? '').trim(),
    tyc_level: Number(body.tyc_level ?? fallback.tyc_level ?? 6),
    eqf_level: Number(body.eqf_level ?? body.tyc_level ?? fallback.eqf_level ?? 6),
    delivery_mode: String(body.delivery_mode ?? fallback.delivery_mode ?? 'IN_PERSON'),
    target_audience: String(body.target_audience ?? fallback.target_audience ?? '').trim(),
    admission_requirements: String(body.admission_requirements ?? fallback.admission_requirements ?? '').trim(),
    success_criteria: String(body.success_criteria ?? fallback.success_criteria ?? '').trim(),
    quality_assurance: String(body.quality_assurance ?? fallback.quality_assurance ?? config.institution.qualityApproach).trim(),
    country_region: String(body.country_region ?? fallback.country_region ?? 'TR').trim(),
    isced_code: String(body.isced_code ?? fallback.isced_code ?? '').trim(),
    esco_codes: String(body.esco_codes ?? fallback.esco_codes ?? '').trim(),
    stakeholder_report: String(body.stakeholder_report ?? fallback.stakeholder_report ?? '').trim(),
    total_hours: calc.totalHours,
    ects_credits: calc.ects,
    outcomes: Array.isArray(body.outcomes) ? body.outcomes : fallback.outcomes || [],
    workloads,
    assessments: Array.isArray(body.assessments) ? body.assessments : fallback.assessments || [],
    mappings: Array.isArray(body.mappings) ? body.mappings : fallback.mappings || []
  };
}

function replaceProgramChildren(programId, data) {
  db.prepare('DELETE FROM outcome_assessments WHERE outcome_id IN (SELECT id FROM learning_outcomes WHERE program_id=?)').run(programId);
  db.prepare('DELETE FROM assessments WHERE program_id=?').run(programId);
  db.prepare('DELETE FROM learning_outcomes WHERE program_id=?').run(programId);
  db.prepare('DELETE FROM workloads WHERE program_id=?').run(programId);

  const outcomes = new Map();
  for (const raw of data.outcomes) {
    const code = String(raw.code || '').trim().toUpperCase();
    if (!code) continue;
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO learning_outcomes (id, program_id, code, description, bloom_level) VALUES (?, ?, ?, ?, ?)')
      .run(id, programId, code, String(raw.description || '').trim(), String(raw.bloom_level || raw.bloom || 'Uygulama').trim());
    outcomes.set(code, id);
  }
  for (const raw of data.workloads) {
    db.prepare('INSERT INTO workloads (id, program_id, activity_type, hours, description) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), programId, String(raw.activity_type || 'THEORETICAL'), Math.max(0, Number(raw.hours || 0)), String(raw.description || '').trim());
  }
  const assessments = new Map();
  for (const raw of data.assessments) {
    const code = String(raw.code || '').trim().toUpperCase();
    if (!code) continue;
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO assessments
      (id, program_id, code, title, assessment_type, weight, threshold, supervision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, programId, code, String(raw.title || '').trim(), String(raw.assessment_type || 'PROJECT'), Number(raw.weight || 0), Number(raw.threshold || 60), String(raw.supervision || 'ONSITE_ID_VERIFIED'));
    assessments.set(code, id);
  }
  for (const raw of data.mappings) {
    const outcomeId = outcomes.get(String(raw.outcome_code || '').toUpperCase());
    const assessmentId = assessments.get(String(raw.assessment_code || '').toUpperCase());
    if (outcomeId && assessmentId) db.prepare('INSERT OR IGNORE INTO outcome_assessments (outcome_id, assessment_id) VALUES (?, ?)').run(outcomeId, assessmentId);
  }
}

function saveProgram(data, user, existing = null) {
  const id = existing?.id || crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (existing) {
      db.prepare(`UPDATE programs SET code=?, title=?, summary=?, description=?, tyc_level=?, eqf_level=?, delivery_mode=?,
        target_audience=?, admission_requirements=?, success_criteria=?, quality_assurance=?, country_region=?, isced_code=?,
        esco_codes=?, stakeholder_report=?, total_hours=?, ects_credits=?, version=version+1, status='DRAFT', rejection_reason=NULL,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(data.code, data.title, data.summary, data.description, data.tyc_level, data.eqf_level, data.delivery_mode,
          data.target_audience, data.admission_requirements, data.success_criteria, data.quality_assurance, data.country_region,
          data.isced_code, data.esco_codes, data.stakeholder_report, data.total_hours, data.ects_credits, id);
    } else {
      db.prepare(`INSERT INTO programs
        (id, code, title, summary, description, tyc_level, eqf_level, delivery_mode, target_audience,
         admission_requirements, success_criteria, quality_assurance, country_region, isced_code, esco_codes,
         stakeholder_report, total_hours, ects_credits, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, data.code, data.title, data.summary, data.description, data.tyc_level, data.eqf_level, data.delivery_mode,
          data.target_audience, data.admission_requirements, data.success_criteria, data.quality_assurance, data.country_region,
          data.isced_code, data.esco_codes, data.stakeholder_report, data.total_hours, data.ects_credits, user.id);
    }
    replaceProgramChildren(id, data);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error.message).includes('UNIQUE constraint failed: programs.code')) throw Object.assign(new Error('Program kodu daha önce kullanılmış.'), { status: 409 });
    throw error;
  }
  return getProgram(id);
}

function certificateNumber() {
  const year = new Date().getFullYear();
  const count = Number(db.prepare('SELECT COUNT(*) count FROM credentials WHERE certificate_number LIKE ?').get(`KUN-MY-${year}-%`).count) + 1;
  return `KUN-MY-${year}-${String(count).padStart(6, '0')}`;
}

addRoute('GET', /^\/api\/health$/, ({ res }) => {
  const database = db.prepare('SELECT 1 ok').get();
  json(res, 200, {
    status: database?.ok === 1 ? 'ok' : 'degraded',
    service: 'KUN-MYYS',
    timestamp: new Date().toISOString()
  });
}, { auth: false, csrf: false });

addRoute('GET', /^\/api\/catalog$/, ({ res }) => {
  const programs = db.prepare(`SELECT p.id, p.code, p.title, p.summary, p.tyc_level, p.eqf_level, p.delivery_mode,
    p.total_hours, p.ects_credits, p.target_audience, p.admission_requirements,
    (SELECT COUNT(*) FROM learning_outcomes lo WHERE lo.program_id=p.id) outcome_count
    FROM programs p WHERE p.status='SENATE_APPROVED' ORDER BY p.title`).all();
  const offerings = db.prepare(`SELECT o.id, o.program_id, o.code, o.start_date, o.end_date, o.quota, o.instructor_name,
    o.delivery_mode, o.access_type, o.location, o.registration_deadline, o.fee, o.status,
    p.title program_title, p.code program_code,
    (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id=o.id AND e.status!='DROPPED') enrolled_count
    FROM offerings o JOIN programs p ON p.id=o.program_id
    WHERE o.status IN ('OPEN','RUNNING') AND p.status='SENATE_APPROVED' ORDER BY o.start_date`).all();
  json(res, 200, { institution: config.institution.name, programs, offerings });
}, { auth: false, csrf: false });

addRoute('POST', /^\/api\/auth\/login$/, async ({ req, res, body, ip }) => {
  const key = `${ip}|${String(body.email || '').toLowerCase()}`;
  const state = loginAttempts.get(key) || { count: 0, until: 0 };
  if (state.until > Date.now()) throw Object.assign(new Error('Çok fazla başarısız deneme. Lütfen 10 dakika sonra tekrar deneyin.'), { status: 429 });
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND is_active=1').get(String(body.email || '').trim());
  if (!user || !verifyPassword(String(body.password || ''), user.password_salt, user.password_hash)) {
    state.count += 1;
    if (state.count >= 5) state.until = Date.now() + 10 * 60 * 1000;
    loginAttempts.set(key, state);
    throw Object.assign(new Error('E-posta veya parola hatalı.'), { status: 401 });
  }
  loginAttempts.delete(key);
  const token = randomToken();
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
  db.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash(token), user.id, csrf, expires);
  audit({ actorId: user.id, action: 'AUTH_LOGIN', entityType: 'session', entityId: user.id, ipAddress: ip });
  json(res, 200, { user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, unit_name: user.unit_name }, csrf }, {
    'Set-Cookie': sessionCookie(token, config.sessionTtlHours * 3600, config.appUrl.startsWith('https://'))
  });
}, { auth: false, csrf: false });

addRoute('POST', /^\/api\/auth\/logout$/, ({ res, session, ip }) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(session.token));
  audit({ actorId: session.id, action: 'AUTH_LOGOUT', entityType: 'session', entityId: session.id, ipAddress: ip });
  json(res, 200, { message: 'Oturum kapatıldı.' }, { 'Set-Cookie': clearSessionCookie(config.appUrl.startsWith('https://')) });
});

addRoute('GET', /^\/api\/me$/, ({ res, session }) => json(res, 200, {
  user: { id: session.id, full_name: session.full_name, email: session.email, role: session.role, unit_name: session.unit_name },
  csrf: session.csrf_token
}));

addRoute('GET', /^\/api\/users$/, ({ res }) => {
  const users = db.prepare(`SELECT id, full_name, email, role, unit_name, is_active, created_at
    FROM users ORDER BY is_active DESC, full_name`).all();
  json(res, 200, { users, roles: USER_ROLES });
}, { roles: ['ADMIN'] });

addRoute('POST', /^\/api\/users$/, ({ res, body, session, ip }) => {
  const fullName = requiredText(body.full_name, 'Ad soyad', 150);
  const email = emailAddress(body.email);
  const role = String(body.role || 'STUDENT');
  if (!USER_ROLES.includes(role)) throw Object.assign(new Error('Kullanıcı rolü geçersizdir.'), { status: 422 });
  const password = String(body.password || '');
  if (password.length < 10) throw Object.assign(new Error('Parola en az 10 karakter olmalıdır.'), { status: 422 });
  const { salt, hash } = hashPassword(password);
  const id = crypto.randomUUID();
  try {
    db.prepare(`INSERT INTO users (id, full_name, email, password_hash, password_salt, role, unit_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, fullName, email, hash, salt, role, String(body.unit_name || '').trim());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Bu e-posta adresi zaten kullanılıyor.'), { status: 409 });
    throw error;
  }
  audit({ actorId: session.id, action: 'USER_CREATED', entityType: 'user', entityId: id, ipAddress: ip, after: { full_name: fullName, email, role, unit_name: body.unit_name } });
  json(res, 201, { user: db.prepare('SELECT id, full_name, email, role, unit_name, is_active, created_at FROM users WHERE id=?').get(id) });
}, { roles: ['ADMIN'] });

addRoute('PATCH', /^\/api\/users\/([0-9a-f-]+)$/, ({ res, body, session, match, ip }) => {
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(match[1]);
  if (!existing) throw Object.assign(new Error('Kullanıcı bulunamadı.'), { status: 404 });
  const fullName = body.full_name === undefined ? existing.full_name : requiredText(body.full_name, 'Ad soyad', 150);
  const email = body.email === undefined ? existing.email : emailAddress(body.email);
  const role = body.role === undefined ? existing.role : String(body.role);
  if (!USER_ROLES.includes(role)) throw Object.assign(new Error('Kullanıcı rolü geçersizdir.'), { status: 422 });
  const active = body.is_active === undefined ? existing.is_active : ([true, 1, '1', 'true'].includes(body.is_active) ? 1 : 0);
  if (existing.id === session.id && (!active || role !== 'ADMIN')) throw Object.assign(new Error('Kendi yönetici hesabınızı pasifleştiremez veya rolünü değiştiremezsiniz.'), { status: 409 });
  let passwordHash = existing.password_hash;
  let passwordSalt = existing.password_salt;
  if (body.new_password) {
    if (String(body.new_password).length < 10) throw Object.assign(new Error('Yeni parola en az 10 karakter olmalıdır.'), { status: 422 });
    const result = hashPassword(String(body.new_password));
    passwordHash = result.hash; passwordSalt = result.salt;
  }
  try {
    db.prepare(`UPDATE users SET full_name=?, email=?, role=?, unit_name=?, is_active=?, password_hash=?, password_salt=? WHERE id=?`)
      .run(fullName, email, role, String(body.unit_name ?? existing.unit_name ?? '').trim(), active, passwordHash, passwordSalt, existing.id);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Bu e-posta adresi zaten kullanılıyor.'), { status: 409 });
    throw error;
  }
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
  audit({
    actorId: session.id, action: 'USER_UPDATED', entityType: 'user', entityId: existing.id, ipAddress: ip,
    before: { full_name: existing.full_name, email: existing.email, role: existing.role, unit_name: existing.unit_name, is_active: existing.is_active },
    after: { full_name: fullName, email, role, unit_name: body.unit_name ?? existing.unit_name, is_active: active, password_changed: Boolean(body.new_password) }
  });
  json(res, 200, { user: db.prepare('SELECT id, full_name, email, role, unit_name, is_active, created_at FROM users WHERE id=?').get(existing.id) });
}, { roles: ['ADMIN'] });

addRoute('GET', /^\/api\/notifications$/, ({ res, session }) => {
  const notifications = db.prepare(`SELECT * FROM notifications
    WHERE user_id=? OR (user_id IS NULL AND (target_role=? OR target_role='ALL'))
    ORDER BY is_read, created_at DESC LIMIT 100`).all(session.id, session.role);
  const unread = Number(db.prepare(`SELECT COUNT(*) count FROM notifications
    WHERE is_read=0 AND (user_id=? OR (user_id IS NULL AND (target_role=? OR target_role='ALL')))`)
    .get(session.id, session.role).count);
  json(res, 200, { notifications, unread });
});

addRoute('PATCH', /^\/api\/notifications\/read-all$/, ({ res, session }) => {
  db.prepare(`UPDATE notifications SET is_read=1
    WHERE user_id=? OR (user_id IS NULL AND (target_role=? OR target_role='ALL'))`).run(session.id, session.role);
  json(res, 200, { message: 'Bildirimler okundu olarak işaretlendi.' });
});

addRoute('PATCH', /^\/api\/notifications\/([0-9a-f-]+)\/read$/, ({ res, session, match }) => {
  const result = db.prepare(`UPDATE notifications SET is_read=1 WHERE id=?
    AND (user_id=? OR (user_id IS NULL AND (target_role=? OR target_role='ALL')))`)
    .run(match[1], session.id, session.role);
  if (!result.changes) throw Object.assign(new Error('Bildirim bulunamadı.'), { status: 404 });
  json(res, 200, { message: 'Bildirim okundu.' });
});

addRoute('GET', /^\/api\/dashboard$/, ({ res }) => {
  const statusRows = db.prepare('SELECT status, COUNT(*) count FROM programs GROUP BY status').all();
  const programStatuses = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));
  const kpis = {
    programs: Number(db.prepare('SELECT COUNT(*) count FROM programs').get().count),
    approvedPrograms: Number(db.prepare("SELECT COUNT(*) count FROM programs WHERE status='SENATE_APPROVED'").get().count),
    activeOfferings: Number(db.prepare("SELECT COUNT(*) count FROM offerings WHERE status IN ('OPEN','RUNNING')").get().count),
    learners: Number(db.prepare('SELECT COUNT(*) count FROM enrollments').get().count),
    credentials: Number(db.prepare("SELECT COUNT(*) count FROM credentials WHERE status='VALID'").get().count),
    pendingRecognitions: Number(db.prepare("SELECT COUNT(*) count FROM recognition_requests WHERE status IN ('SUBMITTED','UNDER_REVIEW')").get().count),
    overdue: Number(db.prepare("SELECT COUNT(*) count FROM programs WHERE decision_due_at < CURRENT_TIMESTAMP AND status IN ('SUBMITTED','UNIT_APPROVED','COMMISSION_APPROVED')").get().count)
  };
  const recent = db.prepare(`SELECT id, code, title, status, tyc_level, ects_credits, updated_at FROM programs ORDER BY updated_at DESC LIMIT 6`).all();
  json(res, 200, { kpis, programStatuses, recent, labels: { statuses: PROGRAM_STATUSES, delivery: DELIVERY_MODES } });
});

addRoute('GET', /^\/api\/programs$/, ({ res, session }) => {
  const restricted = ['STUDENT', 'EVALUATOR'].includes(session.role);
  const rows = db.prepare(`SELECT p.*, u.full_name creator_name,
    (SELECT COUNT(*) FROM learning_outcomes lo WHERE lo.program_id=p.id) outcome_count
    FROM programs p JOIN users u ON u.id=p.created_by ${restricted ? "WHERE p.status='SENATE_APPROVED'" : ''}
    ORDER BY p.updated_at DESC`).all();
  json(res, 200, { programs: rows, labels: { statuses: PROGRAM_STATUSES, delivery: DELIVERY_MODES } });
});

addRoute('GET', /^\/api\/programs\/([0-9a-f-]+)$/, ({ res, session, match }) => {
  const program = getProgram(match[1]);
  if (!program) throw Object.assign(new Error('Program bulunamadı.'), { status: 404 });
  if (['STUDENT', 'EVALUATOR'].includes(session.role) && program.status !== 'SENATE_APPROVED') {
    throw Object.assign(new Error('Bu programı görüntüleme yetkiniz yok.'), { status: 403 });
  }
  json(res, 200, { program });
});

addRoute('POST', /^\/api\/programs$/, ({ res, body, session, ip }) => {
  const data = normaliseProgram(body);
  if (!data.title) throw Object.assign(new Error('Program adı zorunludur.'), { status: 422 });
  const program = saveProgram(data, session);
  audit({ actorId: session.id, action: 'PROGRAM_CREATED', entityType: 'program', entityId: program.id, ipAddress: ip, after: program });
  json(res, 201, { program });
}, { roles: ['COORDINATOR'] });

addRoute('PUT', /^\/api\/programs\/([0-9a-f-]+)$/, ({ res, body, session, match, ip }) => {
  const existing = getProgram(match[1]);
  if (!existing) throw Object.assign(new Error('Program bulunamadı.'), { status: 404 });
  if (!['DRAFT', 'REJECTED'].includes(existing.status)) throw Object.assign(new Error('Yalnızca taslak veya revizyon istenen program düzenlenebilir.'), { status: 409 });
  if (session.role !== 'ADMIN' && existing.created_by !== session.id) throw Object.assign(new Error('Bu programı düzenleme yetkiniz yok.'), { status: 403 });
  const data = normaliseProgram(body, existing);
  const program = saveProgram(data, session, existing);
  audit({ actorId: session.id, action: 'PROGRAM_UPDATED', entityType: 'program', entityId: program.id, ipAddress: ip, before: existing, after: program });
  json(res, 200, { program });
}, { roles: ['COORDINATOR'] });

addRoute('POST', /^\/api\/programs\/([0-9a-f-]+)\/submit$/, ({ res, session, match, ip }) => {
  const program = getProgram(match[1]);
  if (!program) throw Object.assign(new Error('Program bulunamadı.'), { status: 404 });
  if (!['DRAFT', 'REJECTED'].includes(program.status)) throw Object.assign(new Error('Program bu aşamada yeniden gönderilemez.'), { status: 409 });
  if (session.role !== 'ADMIN' && program.created_by !== session.id) throw Object.assign(new Error('Bu programı onaya gönderme yetkiniz yok.'), { status: 403 });
  const validation = validateProgramForSubmission(program);
  if (!validation.valid) return json(res, 422, { message: 'Program onaya hazır değil.', errors: validation.errors });
  const due = dueIn30Days();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE programs SET status='SUBMITTED', submitted_at=CURRENT_TIMESTAMP, decision_due_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(due, program.id);
    db.prepare('DELETE FROM approvals WHERE program_id=?').run(program.id);
    const steps = [[1, 'UNIT_BOARD'], [2, 'COMMISSION'], [3, 'SENATE']];
    for (const [order, role] of steps) db.prepare('INSERT INTO approvals (id, program_id, step_order, approver_role, due_at) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), program.id, order, role, due);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  audit({ actorId: session.id, action: 'PROGRAM_SUBMITTED', entityType: 'program', entityId: program.id, ipAddress: ip, before: { status: program.status }, after: { status: 'SUBMITTED', due } });
  notify({ role: 'UNIT_BOARD', title: 'Yeni program onayı bekliyor', message: `${program.code} — ${program.title} akademik birim kararına gönderildi.`, entityType: 'program', entityId: program.id });
  json(res, 200, { program: getProgram(program.id), validation });
}, { roles: ['COORDINATOR'] });

addRoute('POST', /^\/api\/programs\/([0-9a-f-]+)\/decision$/, ({ res, body, session, match, ip }) => {
  const program = getProgram(match[1]);
  if (!program) throw Object.assign(new Error('Program bulunamadı.'), { status: 404 });
  const flow = {
    SUBMITTED: { role: 'UNIT_BOARD', step: 1, next: 'UNIT_APPROVED' },
    UNIT_APPROVED: { role: 'COMMISSION', step: 2, next: 'COMMISSION_APPROVED' },
    COMMISSION_APPROVED: { role: 'SENATE', step: 3, next: 'SENATE_APPROVED' }
  };
  const current = flow[program.status];
  if (!current) throw Object.assign(new Error('Program karar verilebilir bir aşamada değil.'), { status: 409 });
  assertRole(session, [current.role]);
  const approved = body.decision === 'APPROVE';
  const notes = String(body.notes || '').trim();
  if (!approved && !notes) throw Object.assign(new Error('Revizyon veya ret gerekçesi zorunludur.'), { status: 422 });
  const nextStatus = approved ? current.next : 'REJECTED';
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE approvals SET status=?, decision_notes=?, decided_by=?, decided_at=CURRENT_TIMESTAMP
      WHERE program_id=? AND step_order=?`).run(approved ? 'APPROVED' : 'REJECTED', notes, session.id, program.id, current.step);
    if (!approved) db.prepare("UPDATE approvals SET status='SKIPPED' WHERE program_id=? AND step_order>? AND status='PENDING'").run(program.id, current.step);
    db.prepare(`UPDATE programs SET status=?, rejection_reason=?, approved_at=CASE WHEN ?='SENATE_APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nextStatus, approved ? null : notes, nextStatus, program.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  audit({ actorId: session.id, action: approved ? 'PROGRAM_APPROVED' : 'PROGRAM_REVISION_REQUESTED', entityType: 'program', entityId: program.id, ipAddress: ip, before: { status: program.status }, after: { status: nextStatus, notes } });
  if (approved && nextStatus !== 'SENATE_APPROVED') {
    const nextRole = nextStatus === 'UNIT_APPROVED' ? 'COMMISSION' : 'SENATE';
    notify({ role: nextRole, title: 'Program kararınıza iletildi', message: `${program.code} — ${program.title} onay sıranıza geldi.`, entityType: 'program', entityId: program.id });
  } else {
    notifyEmail(db.prepare('SELECT email FROM users WHERE id=?').get(program.created_by)?.email, {
      title: approved ? 'Program senato tarafından onaylandı' : 'Program için revizyon istendi',
      message: `${program.code} — ${program.title}: ${approved ? 'Eğitim açılışına hazır.' : notes}`,
      entityType: 'program', entityId: program.id
    });
  }
  json(res, 200, { program: getProgram(program.id) });
});

addRoute('POST', /^\/api\/programs\/([0-9a-f-]+)\/archive$/, ({ res, session, match, ip }) => {
  const program = getProgram(match[1]);
  if (!program) throw Object.assign(new Error('Program bulunamadı.'), { status: 404 });
  if (!['SENATE_APPROVED', 'REJECTED'].includes(program.status)) throw Object.assign(new Error('Program bu aşamada arşivlenemez.'), { status: 409 });
  const active = Number(db.prepare("SELECT COUNT(*) count FROM offerings WHERE program_id=? AND status IN ('OPEN','RUNNING')").get(program.id).count);
  if (active) throw Object.assign(new Error('Açık veya devam eden eğitimi bulunan program arşivlenemez.'), { status: 409 });
  db.prepare("UPDATE programs SET status='ARCHIVED', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(program.id);
  audit({ actorId: session.id, action: 'PROGRAM_ARCHIVED', entityType: 'program', entityId: program.id, ipAddress: ip, before: { status: program.status }, after: { status: 'ARCHIVED' } });
  json(res, 200, { program: getProgram(program.id) });
}, { roles: ['SENATE'] });

addRoute('GET', /^\/api\/offerings$/, ({ res }) => {
  const offerings = db.prepare(`SELECT o.*, p.title program_title, p.code program_code,
    (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id=o.id) enrolled_count
    FROM offerings o JOIN programs p ON p.id=o.program_id ORDER BY o.start_date DESC`).all();
  json(res, 200, { offerings });
});

addRoute('POST', /^\/api\/offerings$/, ({ res, body, session, ip }) => {
  const program = db.prepare('SELECT * FROM programs WHERE id=?').get(body.program_id);
  if (!program || program.status !== 'SENATE_APPROVED') throw Object.assign(new Error('Yalnızca senato onaylı program için eğitim açılabilir.'), { status: 422 });
  if (!body.start_date || !body.end_date || new Date(body.end_date) < new Date(body.start_date)) throw Object.assign(new Error('Eğitim tarihleri geçersiz.'), { status: 422 });
  const id = crypto.randomUUID();
  const code = String(body.code || `${program.code}-${new Date(body.start_date).getFullYear()}-01`).trim().toUpperCase();
  const instructor = requiredText(body.instructor_name, 'Eğitici', 200);
  const quota = Number(body.quota);
  if (!Number.isInteger(quota) || quota < 1) throw Object.assign(new Error('Kontenjan pozitif tam sayı olmalıdır.'), { status: 422 });
  const accessType = ['OPEN', 'CLOSED'].includes(body.access_type) ? body.access_type : 'OPEN';
  try {
    db.prepare(`INSERT INTO offerings
      (id, program_id, code, start_date, end_date, quota, instructor_name, delivery_mode, access_type, location, registration_deadline, fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, program.id, code, body.start_date, body.end_date, quota, instructor, body.delivery_mode || program.delivery_mode,
        accessType, String(body.location || '').trim(), body.registration_deadline || null, Number(body.fee || 0));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Bu eğitim kodu zaten kullanılıyor.'), { status: 409 });
    throw error;
  }
  audit({ actorId: session.id, action: 'OFFERING_CREATED', entityType: 'offering', entityId: id, ipAddress: ip, after: body });
  json(res, 201, { offering: db.prepare('SELECT * FROM offerings WHERE id=?').get(id) });
}, { roles: ['COORDINATOR'] });

addRoute('PATCH', /^\/api\/offerings\/([0-9a-f-]+)$/, ({ res, body, session, match, ip }) => {
  const existing = db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id=o.id AND e.status!='DROPPED') enrolled_count
    FROM offerings o WHERE o.id=?`).get(match[1]);
  if (!existing) throw Object.assign(new Error('Eğitim bulunamadı.'), { status: 404 });
  const transitions = { OPEN: ['OPEN', 'RUNNING', 'CANCELLED'], RUNNING: ['RUNNING', 'COMPLETED', 'CANCELLED'], COMPLETED: ['COMPLETED'], CANCELLED: ['CANCELLED'] };
  const status = body.status || existing.status;
  if (!transitions[existing.status].includes(status)) throw Object.assign(new Error(`${existing.status} durumundan ${status} durumuna geçilemez.`), { status: 409 });
  const quota = body.quota === undefined ? existing.quota : Number(body.quota);
  if (!Number.isInteger(quota) || quota < Number(existing.enrolled_count)) throw Object.assign(new Error('Kontenjan mevcut kayıt sayısından düşük olamaz.'), { status: 422 });
  const startDate = body.start_date || existing.start_date;
  const endDate = body.end_date || existing.end_date;
  if (new Date(endDate) < new Date(startDate)) throw Object.assign(new Error('Eğitim tarihleri geçersiz.'), { status: 422 });
  const accessType = body.access_type || existing.access_type || 'OPEN';
  if (!['OPEN', 'CLOSED'].includes(accessType)) throw Object.assign(new Error('Kayıt erişim türü geçersiz.'), { status: 422 });
  db.prepare(`UPDATE offerings SET start_date=?, end_date=?, quota=?, instructor_name=?, delivery_mode=?, access_type=?,
    location=?, registration_deadline=?, fee=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(startDate, endDate, quota, String(body.instructor_name ?? existing.instructor_name).trim(), body.delivery_mode || existing.delivery_mode,
      accessType, String(body.location ?? existing.location ?? '').trim(), body.registration_deadline ?? existing.registration_deadline,
      Number(body.fee ?? existing.fee), status, existing.id);
  audit({
    actorId: session.id, action: 'OFFERING_UPDATED', entityType: 'offering', entityId: existing.id, ipAddress: ip,
    before: existing, after: { start_date: startDate, end_date: endDate, quota, access_type: accessType, status }
  });
  json(res, 200, { offering: db.prepare('SELECT * FROM offerings WHERE id=?').get(existing.id) });
}, { roles: ['COORDINATOR'] });

addRoute('GET', /^\/api\/enrollments$/, ({ res, session }) => {
  const where = session.role === 'STUDENT' ? 'WHERE lower(e.learner_email)=lower(?)' : '';
  const args = session.role === 'STUDENT' ? [session.email] : [];
  const enrollments = db.prepare(`SELECT e.id, e.offering_id, e.learner_name, e.learner_email, e.learner_type,
    e.attendance_rate, e.final_score, e.letter_grade, e.status, e.created_at,
    o.code offering_code, p.id program_id, p.title program_title, p.code program_code,
    (SELECT COUNT(*) FROM evidences ev WHERE ev.enrollment_id=e.id) evidence_count
    FROM enrollments e JOIN offerings o ON o.id=e.offering_id JOIN programs p ON p.id=o.program_id
    ${where} ORDER BY e.created_at DESC`).all(...args);
  json(res, 200, { enrollments });
});

addRoute('POST', /^\/api\/enrollments$/, ({ res, body, session, ip }) => {
  const offering = db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id=o.id AND e.status!='DROPPED') enrolled
    FROM offerings o WHERE o.id=?`).get(body.offering_id);
  if (!offering || !['OPEN', 'RUNNING'].includes(offering.status)) throw Object.assign(new Error('Eğitim kayda açık değil.'), { status: 422 });
  if (session.role === 'STUDENT' && offering.access_type === 'CLOSED') throw Object.assign(new Error('Bu eğitim kapalı grup içindir; kayıt koordinatör tarafından yapılır.'), { status: 403 });
  if (offering.registration_deadline && new Date(offering.registration_deadline) < new Date()) throw Object.assign(new Error('Eğitimin kayıt süresi sona ermiştir.'), { status: 422 });
  if (Number(offering.enrolled) >= Number(offering.quota)) throw Object.assign(new Error('Eğitim kontenjanı dolmuştur.'), { status: 409 });
  const id = crypto.randomUUID();
  const learnerName = session.role === 'STUDENT' ? session.full_name : requiredText(body.learner_name, 'Öğrenen adı', 150);
  const learnerEmail = session.role === 'STUDENT' ? session.email : emailAddress(body.learner_email, 'Öğrenen e-postası');
  const identity = requiredText(body.identity_number, 'T.C. kimlik veya pasaport numarası', 50);
  try {
    db.prepare(`INSERT INTO enrollments (id, offering_id, learner_name, learner_email, identity_number, learner_type)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, offering.id, learnerName, learnerEmail, identity, session.role === 'STUDENT' ? 'INTERNAL_KUN' : body.learner_type || 'INTERNAL_KUN');
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Bu öğrenen eğitime daha önce kaydedilmiş.'), { status: 409 });
    throw error;
  }
  audit({ actorId: session.id, action: 'ENROLLMENT_CREATED', entityType: 'enrollment', entityId: id, ipAddress: ip, after: { ...body, identity_number: maskIdentity(body.identity_number) } });
  json(res, 201, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(id) });
}, { roles: ['COORDINATOR', 'STUDENT'] });

addRoute('PATCH', /^\/api\/enrollments\/([0-9a-f-]+)\/result$/, ({ res, body, session, match, ip }) => {
  const existing = db.prepare(`SELECT e.*, o.program_id FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE e.id=?`).get(match[1]);
  if (!existing) throw Object.assign(new Error('Kayıt bulunamadı.'), { status: 404 });
  const attendance = Math.min(100, Math.max(0, Number(body.attendance_rate || 0)));
  const score = Math.min(100, Math.max(0, Number(body.final_score || 0)));
  const status = String(body.status || (score >= 60 && attendance >= 80 ? 'COMPLETED' : 'FAILED'));
  if (!['ACTIVE', 'COMPLETED', 'FAILED', 'DROPPED'].includes(status)) throw Object.assign(new Error('Başarı durumu geçersiz.'), { status: 422 });
  const coverage = evidenceCoverage(existing.id, existing.program_id);
  if (status === 'COMPLETED' && attendance < 80) throw Object.assign(new Error('Başarılı tamamlama için devam oranı en az %80 olmalıdır.'), { status: 422 });
  if (status === 'COMPLETED' && score < 60) throw Object.assign(new Error('Başarılı tamamlama için puan en az 60 olmalıdır.'), { status: 422 });
  if (status === 'COMPLETED' && !coverage.complete) throw Object.assign(new Error(`Tüm öğrenme çıktıları kanıtlanmalıdır (${coverage.covered}/${coverage.total}).`), { status: 422 });
  const letterGrade = status === 'ACTIVE' || status === 'DROPPED' ? null : gradeForScore(score);
  db.prepare('UPDATE enrollments SET attendance_rate=?, final_score=?, letter_grade=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(attendance, score, letterGrade, status, existing.id);
  audit({ actorId: session.id, action: 'ENROLLMENT_RESULT_UPDATED', entityType: 'enrollment', entityId: existing.id, ipAddress: ip, before: existing, after: { attendance, score, letterGrade, status, coverage } });
  notifyEmail(existing.learner_email, { title: 'Mikro yeterlilik sonucu güncellendi', message: `Başarı durumunuz: ${status}; puan: ${score}; harf notu: ${letterGrade || '—'}.`, entityType: 'enrollment', entityId: existing.id });
  json(res, 200, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(existing.id) });
}, { roles: ['EVALUATOR', 'COORDINATOR'] });

addRoute('GET', /^\/api\/evidences$/, ({ res, session, url }) => {
  const enrollmentId = String(url.searchParams.get('enrollment_id') || '');
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollmentId);
  if (!enrollment) throw Object.assign(new Error('Öğrenen kaydı bulunamadı.'), { status: 404 });
  if (session.role === 'STUDENT' && enrollment.learner_email.toLowerCase() !== session.email.toLowerCase()) throw Object.assign(new Error('Bu kanıtları görüntüleme yetkiniz yok.'), { status: 403 });
  if (!['STUDENT', 'EVALUATOR', 'QUALITY', 'ADMIN', 'COORDINATOR', 'COMMISSION', 'UNIT_BOARD', 'SENATE'].includes(session.role)) throw Object.assign(new Error('Bu kanıtları görüntüleme yetkiniz yok.'), { status: 403 });
  const evidences = db.prepare(`SELECT ev.id, ev.evidence_type, ev.original_name, ev.source_url, ev.mime_type, ev.file_size_bytes,
    ev.file_hash_sha256, ev.score, ev.evaluator_notes, ev.verified_at, lo.code outcome_code, lo.description outcome_description,
    u.full_name evaluator_name, CASE WHEN ev.file_path IS NULL THEN 0 ELSE 1 END has_file
    FROM evidences ev JOIN learning_outcomes lo ON lo.id=ev.outcome_id JOIN users u ON u.id=ev.evaluator_id
    WHERE ev.enrollment_id=? ORDER BY lo.code, ev.verified_at DESC`).all(enrollmentId);
  json(res, 200, { evidences });
});

addRoute('POST', /^\/api\/evidences$/, async ({ res, body, session, ip }) => {
  const enrollment = db.prepare(`SELECT e.*, p.id program_id FROM enrollments e
    JOIN offerings o ON o.id=e.offering_id JOIN programs p ON p.id=o.program_id WHERE e.id=?`).get(body.enrollment_id);
  if (!enrollment) throw Object.assign(new Error('Öğrenci kaydı bulunamadı.'), { status: 404 });
  const outcome = db.prepare('SELECT * FROM learning_outcomes WHERE id=? AND program_id=?').get(body.outcome_id, enrollment.program_id);
  if (!outcome) throw Object.assign(new Error('Öğrenme çıktısı bu programa ait değil.'), { status: 422 });
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw Object.assign(new Error('Kanıt puanı 0 ile 100 arasında olmalıdır.'), { status: 422 });
  const evidenceType = String(body.evidence_type || 'PROJECT_FILE');
  if (!EVIDENCE_TYPES.includes(evidenceType)) throw Object.assign(new Error('Kanıt türü geçersizdir.'), { status: 422 });
  const sourceUrl = httpUrl(body.url, 'Kanıt URL’si');
  const stored = await storeBase64File({ contentBase64: body.content_base64, originalName: body.original_name, prefix: 'evidence' });
  if (!stored && !sourceUrl) throw Object.assign(new Error('Dosya veya kanıt URL’si zorunludur.'), { status: 422 });
  const hash = stored?.hash || crypto.createHash('sha256').update(sourceUrl).digest('hex');
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO evidences
    (id, enrollment_id, outcome_id, evidence_type, original_name, file_path, source_url, mime_type, file_size_bytes,
     file_hash_sha256, score, evaluator_notes, evaluator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, enrollment.id, outcome.id, evidenceType, stored?.originalName || null, stored?.filePath || null, sourceUrl || null,
      String(body.mime_type || '').slice(0, 100) || null, stored?.size || null, hash, score, String(body.notes || ''), session.id);
  audit({ actorId: session.id, action: 'EVIDENCE_VERIFIED', entityType: 'evidence', entityId: id, ipAddress: ip, after: { enrollment_id: enrollment.id, outcome: outcome.code, hash, score } });
  json(res, 201, { evidence: { id, file_hash_sha256: hash, outcome_code: outcome.code } });
}, { roles: ['EVALUATOR', 'COORDINATOR'] });

addRoute('GET', /^\/api\/evidences\/([0-9a-f-]+)\/download$/, ({ res, session, match }) => {
  const evidence = db.prepare(`SELECT ev.*, e.learner_email FROM evidences ev JOIN enrollments e ON e.id=ev.enrollment_id WHERE ev.id=?`).get(match[1]);
  if (!evidence || !evidence.file_path) throw Object.assign(new Error('Kanıt dosyası bulunamadı.'), { status: 404 });
  if (session.role === 'STUDENT' && evidence.learner_email.toLowerCase() !== session.email.toLowerCase()) throw Object.assign(new Error('Bu dosyayı indirme yetkiniz yok.'), { status: 403 });
  if (!['STUDENT', 'EVALUATOR', 'QUALITY', 'ADMIN', 'COORDINATOR', 'COMMISSION', 'UNIT_BOARD', 'SENATE'].includes(session.role)) throw Object.assign(new Error('Bu dosyayı indirme yetkiniz yok.'), { status: 403 });
  const resolved = path.resolve(evidence.file_path);
  if (!resolved.startsWith(`${path.resolve(config.evidencePath)}${path.sep}`) || !fs.existsSync(resolved)) throw Object.assign(new Error('Kanıt dosyası bulunamadı.'), { status: 404 });
  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream', 'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${evidence.original_name || 'kanit.bin'}"`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
  });
  fs.createReadStream(resolved).pipe(res);
});

addRoute('GET', /^\/api\/recognitions$/, ({ res, session }) => {
  const where = session.role === 'STUDENT' ? 'WHERE lower(r.applicant_email)=lower(?)' : '';
  const args = session.role === 'STUDENT' ? [session.email] : [];
  const requests = db.prepare(`SELECT r.id, r.applicant_name, r.applicant_email, r.student_id, r.degree_program_id,
    r.source_institution, r.credential_title, r.credential_url, r.requested_ects, r.is_distance,
    r.course_previously_taken, r.already_transferred_ects, r.already_transferred_count, r.already_online_count,
    r.status, r.approved_ects, r.decision_reason, r.evaluated_at, r.created_at,
    r.source_document_name, r.source_document_hash, CASE WHEN r.source_document_path IS NULL THEN 0 ELSE 1 END has_document,
    d.title degree_program_title, d.total_ects degree_total_ects, u.full_name evaluator_name
    FROM recognition_requests r JOIN degree_programs d ON d.id=r.degree_program_id
    LEFT JOIN users u ON u.id=r.evaluator_id ${where} ORDER BY r.created_at DESC`).all(...args);
  const degreePrograms = db.prepare('SELECT * FROM degree_programs ORDER BY total_ects, title').all();
  json(res, 200, { requests, degreePrograms });
});

addRoute('POST', /^\/api\/recognitions$/, async ({ res, body, session, ip }) => {
  const degree = db.prepare('SELECT * FROM degree_programs WHERE id=?').get(body.degree_program_id);
  if (!degree) throw Object.assign(new Error('Diploma programı türü bulunamadı.'), { status: 422 });
  const applicantName = session.role === 'STUDENT' ? session.full_name : requiredText(body.applicant_name || session.full_name, 'Başvuran adı', 150);
  const applicantEmail = session.role === 'STUDENT' ? session.email : emailAddress(body.applicant_email || session.email, 'Başvuran e-postası');
  const history = db.prepare(`SELECT COALESCE(SUM(approved_ects),0) ects, COUNT(*) count,
    COALESCE(SUM(CASE WHEN is_distance=1 THEN 1 ELSE 0 END),0) online_count
    FROM recognition_requests WHERE lower(applicant_email)=lower(?) AND degree_program_id=? AND status='APPROVED'`)
    .get(applicantEmail, degree.id);
  const validation = validateRecognitionLimits({
    degreeTotalEcts: degree.total_ects,
    alreadyTransferredEcts: history.ects,
    alreadyTransferredCount: history.count,
    alreadyOnlineCount: history.online_count,
    requestedEcts: body.requested_ects,
    isRequestedOnline: Boolean(body.is_distance),
    coursePreviouslyTaken: Boolean(body.course_previously_taken)
  });
  if (!validation.allowed) return json(res, 422, { message: 'Tanıma talebi YÖK sınırlarına uygun değil.', validation });
  const credentialUrl = httpUrl(body.credential_url, 'Belge doğrulama URL’si');
  const stored = await storeBase64File({ contentBase64: body.content_base64, originalName: body.original_name, prefix: 'recognition' });
  if (!credentialUrl && !stored) throw Object.assign(new Error('Kaynak belge dosyası veya doğrulama URL’si zorunludur.'), { status: 422 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO recognition_requests
    (id, applicant_name, applicant_email, student_id, degree_program_id, source_institution, credential_title, credential_url,
     source_document_path, source_document_name, source_document_hash,
     requested_ects, is_distance, course_previously_taken, already_transferred_ects, already_transferred_count, already_online_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, applicantName, applicantEmail, String(body.student_id || ''), degree.id,
      requiredText(body.source_institution, 'Kaynak kurum', 255), requiredText(body.credential_title, 'Yeterlilik adı', 255), credentialUrl || null,
      stored?.filePath || null, stored?.originalName || null, stored?.hash || null, Number(body.requested_ects),
      body.is_distance ? 1 : 0, body.course_previously_taken ? 1 : 0, Number(history.ects), Number(history.count), Number(history.online_count));
  audit({
    actorId: session.id, action: 'RECOGNITION_SUBMITTED', entityType: 'recognition', entityId: id, ipAddress: ip,
    after: {
      applicant: applicantEmail, source_institution: body.source_institution, credential_title: body.credential_title,
      requested_ects: body.requested_ects, is_distance: Boolean(body.is_distance), document_hash: stored?.hash || null, validation
    }
  });
  notify({ role: 'COMMISSION', title: 'Yeni dış kazanım tanıma başvurusu', message: `${applicantName}, ${body.credential_title} için ${body.requested_ects} AKTS talep etti.`, entityType: 'recognition', entityId: id });
  json(res, 201, { request: db.prepare('SELECT * FROM recognition_requests WHERE id=?').get(id), validation });
}, { roles: ['STUDENT', 'COORDINATOR'] });

addRoute('POST', /^\/api\/recognitions\/([0-9a-f-]+)\/decision$/, ({ res, body, session, match, ip }) => {
  const request = db.prepare(`SELECT r.*, d.total_ects degree_total_ects FROM recognition_requests r
    JOIN degree_programs d ON d.id=r.degree_program_id WHERE r.id=?`).get(match[1]);
  if (!request) throw Object.assign(new Error('Tanıma talebi bulunamadı.'), { status: 404 });
  const approved = body.decision === 'APPROVE';
  const approvedEcts = approved ? Number(body.approved_ects || request.requested_ects) : 0;
  const validation = validateRecognitionLimits({
    degreeTotalEcts: request.degree_total_ects,
    alreadyTransferredEcts: request.already_transferred_ects,
    alreadyTransferredCount: request.already_transferred_count,
    alreadyOnlineCount: request.already_online_count,
    requestedEcts: approvedEcts,
    isRequestedOnline: Boolean(request.is_distance),
    coursePreviouslyTaken: Boolean(request.course_previously_taken)
  });
  if (approved && !validation.allowed) return json(res, 422, { message: 'Onaylanan kredi YÖK sınırlarını aşıyor.', validation });
  const reason = String(body.reason || '').trim();
  if (!approved && !reason) throw Object.assign(new Error('Ret gerekçesi zorunludur.'), { status: 422 });
  db.prepare(`UPDATE recognition_requests SET status=?, approved_ects=?, decision_reason=?, evaluator_id=?, evaluated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(approved ? 'APPROVED' : 'REJECTED', approvedEcts, reason, session.id, request.id);
  audit({ actorId: session.id, action: approved ? 'RECOGNITION_APPROVED' : 'RECOGNITION_REJECTED', entityType: 'recognition', entityId: request.id, ipAddress: ip, before: request, after: { approvedEcts, reason } });
  notifyEmail(request.applicant_email, { title: 'Dış kazanım başvurunuz sonuçlandı', message: approved ? `${approvedEcts} AKTS uygun bulundu.` : `Başvuru reddedildi: ${reason}`, entityType: 'recognition', entityId: request.id });
  json(res, 200, { request: db.prepare('SELECT * FROM recognition_requests WHERE id=?').get(request.id), validation });
}, { roles: ['COMMISSION', 'EVALUATOR'] });

addRoute('GET', /^\/api\/recognitions\/([0-9a-f-]+)\/document$/, ({ res, session, match }) => {
  const request = db.prepare('SELECT * FROM recognition_requests WHERE id=?').get(match[1]);
  if (!request || !request.source_document_path) throw Object.assign(new Error('Başvuru belgesi bulunamadı.'), { status: 404 });
  if (session.role === 'STUDENT' && request.applicant_email.toLowerCase() !== session.email.toLowerCase()) throw Object.assign(new Error('Bu belgeyi görüntüleme yetkiniz yok.'), { status: 403 });
  if (!['STUDENT', 'COMMISSION', 'EVALUATOR', 'QUALITY', 'ADMIN'].includes(session.role)) throw Object.assign(new Error('Bu belgeyi görüntüleme yetkiniz yok.'), { status: 403 });
  const resolved = path.resolve(request.source_document_path);
  if (!resolved.startsWith(`${path.resolve(config.evidencePath)}${path.sep}`) || !fs.existsSync(resolved)) throw Object.assign(new Error('Başvuru belgesi bulunamadı.'), { status: 404 });
  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream', 'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${request.source_document_name || 'basvuru-belgesi.bin'}"`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
  });
  fs.createReadStream(resolved).pipe(res);
});

addRoute('GET', /^\/api\/credentials$/, ({ res, session }) => {
  const where = session.role === 'STUDENT' ? 'WHERE lower(e.learner_email)=lower(?)' : '';
  const args = session.role === 'STUDENT' ? [session.email] : [];
  const credentials = db.prepare(`SELECT c.id, c.enrollment_id, c.certificate_number, c.holder_name, c.issue_date, c.verification_code, c.status,
    c.revocation_reason, p.title program_title, p.code program_code
    FROM credentials c JOIN programs p ON p.id=c.program_id JOIN enrollments e ON e.id=c.enrollment_id
    ${where} ORDER BY c.created_at DESC`).all(...args);
  json(res, 200, { credentials });
});

addRoute('POST', /^\/api\/credentials$/, ({ res, body, session, ip }) => {
  const enrollment = db.prepare(`SELECT e.*, o.code offering_code,
    p.id program_id, p.code program_code, p.title program_title, p.summary program_summary,
    p.description program_description, p.total_hours program_total_hours, p.ects_credits program_ects_credits,
    p.tyc_level program_tyc_level, p.eqf_level program_eqf_level, p.delivery_mode program_delivery_mode,
    p.success_criteria program_success_criteria, p.quality_assurance program_quality_assurance,
    p.approved_at program_approved_at, p.status program_status
    FROM enrollments e JOIN offerings o ON o.id=e.offering_id JOIN programs p ON p.id=o.program_id WHERE e.id=?`).get(body.enrollment_id);
  if (!enrollment) throw Object.assign(new Error('Öğrenci kaydı bulunamadı.'), { status: 404 });
  if (enrollment.status !== 'COMPLETED') throw Object.assign(new Error('Belge yalnızca programı başarıyla tamamlayan öğrenene verilebilir.'), { status: 422 });
  if (enrollment.program_approved_at == null || enrollment.program_status !== 'SENATE_APPROVED') throw Object.assign(new Error('Program senato onaylı değil veya arşivlenmiş.'), { status: 422 });
  const coverage = evidenceCoverage(enrollment.id, enrollment.program_id);
  if (!coverage.complete) throw Object.assign(new Error(`Belge düzenlemek için tüm öğrenme çıktıları kanıtlanmalıdır (${coverage.covered}/${coverage.total}).`), { status: 422 });
  if (db.prepare('SELECT 1 FROM credentials WHERE enrollment_id=?').get(enrollment.id)) throw Object.assign(new Error('Bu kayıt için daha önce belge düzenlenmiş.'), { status: 409 });
  const id = crypto.randomUUID();
  const number = certificateNumber();
  const code = randomToken(24);
  const issueDate = new Date().toISOString().slice(0, 10);
  const outcomes = db.prepare('SELECT * FROM learning_outcomes WHERE program_id=? ORDER BY code').all(enrollment.program_id);
  const assessments = db.prepare('SELECT * FROM assessments WHERE program_id=? ORDER BY code').all(enrollment.program_id);
  const evidences = db.prepare(`SELECT ev.file_hash_sha256, lo.code outcome_code FROM evidences ev
    JOIN learning_outcomes lo ON lo.id=ev.outcome_id WHERE ev.enrollment_id=? ORDER BY lo.code, ev.verified_at`).all(enrollment.id);
  const program = {
    id: enrollment.program_id,
    code: enrollment.program_code,
    title: enrollment.program_title,
    summary: enrollment.program_summary,
    description: enrollment.program_description,
    total_hours: enrollment.program_total_hours,
    ects_credits: enrollment.program_ects_credits,
    tyc_level: enrollment.program_tyc_level,
    eqf_level: enrollment.program_eqf_level,
    delivery_mode: enrollment.program_delivery_mode,
    success_criteria: enrollment.program_success_criteria,
    quality_assurance: enrollment.program_quality_assurance
  };
  const bundle = createCredentialBundle({
    id, certificateNumber: number, verificationCode: code, issueDate,
    enrollment,
    program,
    outcomes,
    assessments,
    evidences,
    baseUrl: config.appUrl
  });
  db.prepare(`INSERT INTO credentials
    (id, certificate_number, enrollment_id, program_id, holder_name, holder_identity, issue_date, verification_code,
     ek1_snapshot, open_badge_json, vc_json, vc_jwt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, number, enrollment.id, enrollment.program_id, enrollment.learner_name, enrollment.identity_number, issueDate, code,
      JSON.stringify(bundle.ek1), JSON.stringify(bundle.badge), JSON.stringify(bundle.vc), bundle.vcJwt);
  audit({ actorId: session.id, action: 'CREDENTIAL_ISSUED', entityType: 'credential', entityId: id, ipAddress: ip, after: { certificate_number: number, enrollment_id: enrollment.id } });
  notifyEmail(enrollment.learner_email, { title: 'Mikro yeterlilik belgeniz düzenlendi', message: `${number} numaralı ${program.title} belgeniz doğrulamaya açıldı.`, entityType: 'credential', entityId: id });
  json(res, 201, { credential: { id, certificate_number: number, verification_code: code, verify_url: `${config.appUrl}/verify/${code}` } });
}, { roles: ['ADMIN', 'SENATE'] });

addRoute('POST', /^\/api\/credentials\/([0-9a-f-]+)\/revoke$/, ({ res, body, session, match, ip }) => {
  const credential = db.prepare('SELECT * FROM credentials WHERE id=?').get(match[1]);
  if (!credential) throw Object.assign(new Error('Belge bulunamadı.'), { status: 404 });
  const reason = String(body.reason || '').trim();
  if (!reason) throw Object.assign(new Error('İptal gerekçesi zorunludur.'), { status: 422 });
  db.prepare("UPDATE credentials SET status='REVOKED', revocation_reason=?, revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(reason, credential.id);
  audit({ actorId: session.id, action: 'CREDENTIAL_REVOKED', entityType: 'credential', entityId: credential.id, ipAddress: ip, before: { status: credential.status }, after: { status: 'REVOKED', reason } });
  json(res, 200, { message: 'Belge iptal edildi.' });
}, { roles: ['ADMIN', 'SENATE'] });

addRoute('GET', /^\/api\/credentials\/([0-9a-f-]+)\/(badge|vc|jwt|ek1)$/, ({ req, res, match }) => {
  const credential = db.prepare('SELECT * FROM credentials WHERE id=?').get(match[1]);
  if (!credential) throw Object.assign(new Error('Belge bulunamadı.'), { status: 404 });
  const format = match[2];
  if (format === 'jwt') return json(res, 200, { jwt: credential.vc_jwt, signature_valid: verifyJwt(credential.vc_jwt), status: credential.status });
  const field = format === 'badge' ? 'open_badge_json' : format === 'vc' ? 'vc_json' : 'ek1_snapshot';
  const document = JSON.parse(credential[field]);
  if (format === 'ek1' && !currentSession(req)) {
    document.learner_identity = { full_name: maskName(document.learner_identity.full_name), identity_number: maskIdentity(document.learner_identity.identity_number) };
  }
  json(res, 200, document);
}, { auth: false });

addRoute('POST', /^\/api\/credentials\/issue-batch$/, ({ res, session, ip }) => {
  const eligible = db.prepare(`SELECT e.id FROM enrollments e
    JOIN offerings o ON o.id=e.offering_id
    JOIN programs p ON p.id=o.program_id
    WHERE e.status='COMPLETED' AND p.status='SENATE_APPROVED'
    AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.enrollment_id=e.id)`).all();

  let issuedCount = 0;
  const results = [];
  for (const row of eligible) {
    const enrollment = db.prepare(`SELECT e.*, o.program_id, o.code offering_code,
      p.title program_title, p.code program_code, p.total_hours program_total_hours,
      p.ects_credits program_ects_credits, p.tyc_level program_tyc_level, p.eqf_level program_eqf_level,
      p.summary program_summary, p.description program_description, p.delivery_mode program_delivery_mode,
      p.success_criteria program_success_criteria, p.quality_assurance program_quality_assurance
      FROM enrollments e JOIN offerings o ON o.id=e.offering_id JOIN programs p ON p.id=o.program_id WHERE e.id=?`).get(row.id);

    const coverage = evidenceCoverage(enrollment.id, enrollment.program_id);
    if (!coverage.complete) continue;

    const id = crypto.randomUUID();
    const number = certificateNumber();
    const code = randomToken(24);
    const issueDate = new Date().toISOString().slice(0, 10);
    const outcomes = db.prepare('SELECT * FROM learning_outcomes WHERE program_id=? ORDER BY code').all(enrollment.program_id);
    const assessments = db.prepare('SELECT * FROM assessments WHERE program_id=? ORDER BY code').all(enrollment.program_id);
    const evidences = db.prepare(`SELECT ev.file_hash_sha256, lo.code outcome_code FROM evidences ev
      JOIN learning_outcomes lo ON lo.id=ev.outcome_id WHERE ev.enrollment_id=? ORDER BY lo.code, ev.verified_at`).all(enrollment.id);
    const program = {
      id: enrollment.program_id,
      code: enrollment.program_code,
      title: enrollment.program_title,
      summary: enrollment.program_summary,
      description: enrollment.program_description,
      total_hours: enrollment.program_total_hours,
      ects_credits: enrollment.program_ects_credits,
      tyc_level: enrollment.program_tyc_level,
      eqf_level: enrollment.program_eqf_level,
      delivery_mode: enrollment.program_delivery_mode,
      success_criteria: enrollment.program_success_criteria,
      quality_assurance: enrollment.program_quality_assurance
    };
    const bundle = createCredentialBundle({
      id, certificateNumber: number, verificationCode: code, issueDate,
      enrollment, program, outcomes, assessments, evidences, baseUrl: config.appUrl
    });
    db.prepare(`INSERT INTO credentials
      (id, certificate_number, enrollment_id, program_id, holder_name, holder_identity, issue_date, verification_code,
       ek1_snapshot, open_badge_json, vc_json, vc_jwt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, number, enrollment.id, enrollment.program_id, enrollment.learner_name, enrollment.identity_number, issueDate, code,
        JSON.stringify(bundle.ek1), JSON.stringify(bundle.badge), JSON.stringify(bundle.vc), bundle.vcJwt);
    audit({ actorId: session.id, action: 'CREDENTIAL_ISSUED_BATCH', entityType: 'credential', entityId: id, ipAddress: ip, after: { certificate_number: number, enrollment_id: enrollment.id } });
    issuedCount++;
    results.push({ id, certificate_number: number, learner_name: enrollment.learner_name });
  }
  json(res, 200, { message: `${issuedCount} adet öğrenen için dijital belge başarıyla üretildi.`, issuedCount, results });
}, { roles: ['ADMIN', 'SENATE'] });

addRoute('GET', /^\/api\/credentials\/([0-9a-f-]+)\/certificate$/, ({ res, session, match }) => {
  const credential = db.prepare(`SELECT c.*, p.title program_title, p.code program_code, p.total_hours, p.ects_credits,
    p.tyc_level, p.eqf_level, e.final_score, e.letter_grade, e.learner_email
    FROM credentials c JOIN programs p ON p.id=c.program_id JOIN enrollments e ON e.id=c.enrollment_id WHERE c.id=?`).get(match[1]);
  if (!credential) throw Object.assign(new Error('Belge bulunamadı.'), { status: 404 });
  if (session.role === 'STUDENT' && credential.learner_email.toLowerCase() !== session.email.toLowerCase()) throw Object.assign(new Error('Bu belgeyi görüntüleme yetkiniz yok.'), { status: 403 });
  const allowedViewRoles = ['STUDENT', 'SENATE', 'QUALITY', 'ADMIN', 'COMMISSION', 'COORDINATOR', 'UNIT_BOARD', 'EVALUATOR'];
  if (!allowedViewRoles.includes(session.role)) throw Object.assign(new Error('Bu belgeyi görüntüleme yetkiniz yok.'), { status: 403 });
  const ek1 = JSON.parse(credential.ek1_snapshot);
  const outcomes = ek1.learning_outcomes.map((item) => `<li>${escapeHtml(item.code)} — ${escapeHtml(item.description)}</li>`).join('');
  const verifyUrl = `${config.appUrl}/verify/${credential.verification_code}`;
  const issueYear = new Date(credential.issue_date).getFullYear();
  const issueMonth = new Date(credential.issue_date).getMonth() + 1;
  const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(credential.program_title)}&organizationName=${encodeURIComponent('Kapadokya Üniversitesi')}&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(verifyUrl)}&certId=${encodeURIComponent(credential.certificate_number)}`;
  const body = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(credential.certificate_number)} — Kapadokya Üniversitesi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      color: #1a1016;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f4f5f8;
      display: flex;
      flex-direction: column;
      align-items: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      width: 100%;
      max-width: 277mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding: 10px 18px;
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .toolbar button, .toolbar a {
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      padding: 9px 18px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      background: #ffffff;
      color: #374151;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .toolbar button.primary {
      background: #721b36;
      color: #ffffff;
      border-color: #721b36;
    }
    .toolbar a.linkedin-btn {
      background: #0a66c2;
      color: #ffffff;
      border-color: #0a66c2;
    }
    .cert-sheet {
      width: 277mm;
      min-height: 190mm;
      background: #ffffff;
      padding: 12mm 16mm;
      position: relative;
      border: 8px double #721b36;
      outline: 2px solid #c49b55;
      outline-offset: -12px;
      box-shadow: 0 12px 35px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .cert-header {
      text-align: center;
      border-bottom: 2px solid #c49b55;
      padding-bottom: 8mm;
      position: relative;
    }
    .cert-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 4px;
    }
    .cert-logo {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid #721b36;
      display: grid;
      place-items: center;
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: bold;
      color: #721b36;
      font-size: 14px;
    }
    .cert-univ {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #721b36;
      text-transform: uppercase;
    }
    .cert-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 34px;
      font-weight: 700;
      color: #111827;
      margin: 6px 0 2px;
      letter-spacing: -0.02em;
    }
    .cert-subtitle {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #c49b55;
    }
    .cert-holder-section {
      text-align: center;
      margin: 6mm 0;
    }
    .cert-for {
      font-size: 13px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .cert-holder-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 32px;
      font-weight: 700;
      color: #721b36;
      margin: 3px 0 6px;
    }
    .cert-statement {
      font-size: 13px;
      color: #374151;
      max-width: 220mm;
      margin: 0 auto;
      line-height: 1.6;
    }
    .cert-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4mm;
      margin: 4mm 0;
    }
    .cert-box {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 3.5mm 4mm;
      background: #fafafa;
    }
    .cert-box small {
      display: block;
      color: #6b7280;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .cert-box strong {
      font-size: 12px;
      color: #111827;
      display: block;
    }
    .cert-outcomes {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 3mm 5mm;
      background: #fafafa;
      margin-top: 2mm;
    }
    .cert-outcomes small {
      display: block;
      color: #6b7280;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .cert-outcomes ul {
      margin: 2px 0 0 16px;
      padding: 0;
      font-size: 11px;
      color: #374151;
      line-height: 1.5;
    }
    .cert-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 4mm;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #4b5563;
    }
    .cert-seal {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cert-seal-badge {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #721b36;
      color: #c49b55;
      font-size: 18px;
      font-weight: bold;
    }
    .cert-qr-block {
      text-align: right;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none !important; }
      .cert-sheet { box-shadow: none; width: 100%; min-height: 100%; border-width: 6px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div style="font-weight:700;color:#721b36">Kapadokya Üniversitesi · Resmi Mikro Yeterlilik Belgesi</div>
    <div style="display:flex;gap:10px">
      <a href="${escapeHtml(linkedInUrl)}" target="_blank" class="linkedin-btn">💼 LinkedIn'e Ekle</a>
      <a href="${escapeHtml(verifyUrl)}" target="_blank">🔍 Çevrimiçi Doğrula</a>
      <button class="primary" onclick="window.print()">🖨 Yazdır / PDF Olarak Kaydet</button>
    </div>
  </div>

  <main class="cert-sheet">
    <header class="cert-header">
      <div class="cert-brand">
        <span class="cert-logo">KÜN</span>
        <span class="cert-univ">Kapadokya Üniversitesi</span>
      </div>
      <h1 class="cert-title">Mikro Yeterlilik Belgesi</h1>
      <span class="cert-subtitle">Micro-Credential Certificate · W3C Verifiable Credential & Open Badges 3.0</span>
    </header>

    <section class="cert-holder-section">
      <div class="cert-for">Bu belge başarıyla tamamlayan</div>
      <div class="cert-holder-name">${escapeHtml(credential.holder_name)}</div>
      <div class="cert-statement">
        adına, Kapadokya Üniversitesi Senatosu tarafından onaylanmış <strong>${escapeHtml(credential.program_title)}</strong> (${escapeHtml(credential.program_code)}) mikro yeterlilik programını başarıyla tamamlaması vesilesiyle düzenlenmiştir.
      </div>
    </section>

    <section class="cert-grid">
      <div class="cert-box"><small>Belge Sicil Numarası</small><strong>${escapeHtml(credential.certificate_number)}</strong></div>
      <div class="cert-box"><small>Düzenleme Tarihi</small><strong>${escapeHtml(credential.issue_date)}</strong></div>
      <div class="cert-box"><small>Kredi & İş Yükü</small><strong>${credential.ects_credits} AKTS (${credential.total_hours} Saat)</strong></div>
      <div class="cert-box"><small>TYÇ / EQF & Başarı</small><strong>Seviye ${credential.tyc_level} (EQF ${credential.eqf_level}) · ${credential.final_score}/100 (${escapeHtml(credential.letter_grade || '—')})</strong></div>
    </section>

    <section class="cert-outcomes">
      <small>Kazanılan ve Doğrulanan Öğrenme Çıktıları</small>
      <ul>${outcomes}</ul>
    </section>

    <footer class="cert-footer">
      <div class="cert-seal">
        <div class="cert-seal-badge">✓</div>
        <div>
          <strong style="color:#721b36;display:block">Kriptografik Ed25519 İmzalıdır</strong>
          <span>YÖK 2026 Çerçevesi · W3C JSON-LD DataIntegrity · Open Badges 3.0</span>
        </div>
      </div>
      <div class="cert-qr-block">
        <strong>Doğrulama Kodu: ${escapeHtml(credential.verification_code)}</strong><br>
        <span style="font-family:monospace;font-size:9px">${escapeHtml(verifyUrl)}</span>
      </div>
    </footer>
  </main>
</body>
</html>`;
  sendHtml(res, 200, body, {
    'Content-Disposition': `inline; filename="${credential.certificate_number}.html"`,
    'Content-Security-Policy': "default-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' https: data:; frame-ancestors 'self'"
  });
});

addRoute('GET', /^\/api\/verify\/([A-Za-z0-9_-]+)$/, ({ res, match }) => {
  const credential = db.prepare(`SELECT c.*, p.title program_title, p.code program_code, p.ects_credits, p.total_hours, p.tyc_level, p.eqf_level
    FROM credentials c JOIN programs p ON p.id=c.program_id WHERE c.verification_code=?`).get(match[1]);
  if (!credential) return json(res, 404, { status: 'INVALID', message: 'Belge bulunamadı veya doğrulama kodu geçersiz.' });
  if (credential.status === 'REVOKED') return json(res, 410, { status: 'REVOKED', message: 'Bu belge iptal edilmiştir.', reason: credential.revocation_reason, revoked_at: credential.revoked_at });
  const badge = JSON.parse(credential.open_badge_json);
  const vc = JSON.parse(credential.vc_json);
  const signatures = { jwt: verifyJwt(credential.vc_jwt), badge: verifyDocumentProof(badge), vc: verifyDocumentProof(vc) };
  if (!signatures.jwt || !signatures.badge || !signatures.vc) return json(res, 409, { status: 'TAMPERED', message: 'Belge imzalarından biri doğrulanamadı.', signatures });
  json(res, 200, {
    status: 'VALID',
    certificate_number: credential.certificate_number,
    holder_name: maskName(credential.holder_name),
    institution: config.institution.name,
    program_name: credential.program_title,
    program_code: credential.program_code,
    ects: credential.ects_credits,
    total_hours: credential.total_hours,
    tyc_level: credential.tyc_level,
    eqf_level: credential.eqf_level,
    issue_date: credential.issue_date,
    signature_valid: true,
    signatures,
    formats: {
      badge: `${config.appUrl}/api/credentials/${credential.id}/badge`,
      vc: `${config.appUrl}/api/credentials/${credential.id}/vc`,
      jwt: `${config.appUrl}/api/credentials/${credential.id}/jwt`,
      ek1: `${config.appUrl}/api/credentials/${credential.id}/ek1`
    }
  });
}, { auth: false });

addRoute('GET', /^\/api\/did\.json$/, ({ res }) => json(res, 200, publicKeyDocument()), { auth: false });

addRoute('GET', /^\/api\/quality$/, ({ res }) => {
  const stats = db.prepare(`SELECT
    (SELECT COUNT(*) FROM enrollments) enrollments,
    (SELECT COUNT(*) FROM enrollments WHERE status='COMPLETED') completed,
    (SELECT COUNT(*) FROM enrollments WHERE status='FAILED') failed,
    (SELECT ROUND(AVG(attendance_rate),1) FROM enrollments) avg_attendance,
    (SELECT ROUND(AVG(final_score),1) FROM enrollments WHERE final_score IS NOT NULL) avg_score,
    (SELECT ROUND(AVG(score),2) FROM feedback) avg_feedback,
    (SELECT COUNT(*) FROM feedback) feedback_count,
    (SELECT COUNT(*) FROM evidences) evidence_count,
    (SELECT COUNT(*) FROM appeals WHERE status IN ('SUBMITTED','UNDER_REVIEW')) open_appeals,
    (SELECT COUNT(*) FROM credentials WHERE status='REVOKED') revoked_credentials,
    (SELECT COUNT(*) FROM programs WHERE decision_due_at < CURRENT_TIMESTAMP AND status IN ('SUBMITTED','UNIT_APPROVED','COMMISSION_APPROVED')) overdue_programs`).get();
  const completionRate = Number(stats.enrollments) ? Number(((Number(stats.completed) / Number(stats.enrollments)) * 100).toFixed(1)) : 0;
  const programs = db.prepare(`SELECT p.id, p.code, p.title,
    (SELECT COUNT(*) FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE o.program_id=p.id) enrollments,
    (SELECT COUNT(*) FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE o.program_id=p.id AND e.status='COMPLETED') completed,
    (SELECT ROUND(AVG(e.final_score),1) FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE o.program_id=p.id AND e.final_score IS NOT NULL) avg_score,
    (SELECT ROUND(AVG(f.score),2) FROM feedback f JOIN offerings o ON o.id=f.offering_id WHERE o.program_id=p.id) avg_feedback
    FROM programs p WHERE p.status IN ('SENATE_APPROVED','ARCHIVED') ORDER BY p.title`).all();
  json(res, 200, { stats: { ...stats, completion_rate: completionRate }, programs, auditIntegrity: verifyAuditChain() });
}, { roles: ['QUALITY'] });

addRoute('POST', /^\/api\/feedback$/, ({ res, body, session, ip }) => {
  const enrollment = db.prepare(`SELECT e.*, o.id offering_id FROM enrollments e JOIN offerings o ON o.id=e.offering_id
    WHERE e.id=? AND lower(e.learner_email)=lower(?)`).get(body.enrollment_id, session.email);
  if (!enrollment) throw Object.assign(new Error('Geri bildirim yalnızca kendi eğitim kaydınız için gönderilebilir.'), { status: 403 });
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw Object.assign(new Error('Geri bildirim puanı 1 ile 5 arasında olmalıdır.'), { status: 422 });
  const id = crypto.randomUUID();
  try {
    db.prepare('INSERT INTO feedback (id, offering_id, enrollment_id, user_id, score, comment) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, enrollment.offering_id, enrollment.id, session.id, score, String(body.comment || '').trim());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Bu eğitim için daha önce geri bildirim gönderdiniz.'), { status: 409 });
    throw error;
  }
  audit({ actorId: session.id, action: 'FEEDBACK_CREATED', entityType: 'feedback', entityId: id, ipAddress: ip, after: { offering_id: enrollment.offering_id, enrollment_id: enrollment.id, score } });
  json(res, 201, { message: 'Geri bildiriminiz kaydedildi.' });
}, { roles: ['STUDENT'] });

addRoute('GET', /^\/api\/appeals$/, ({ res, session }) => {
  const where = session.role === 'STUDENT' ? 'WHERE a.submitted_by=?' : '';
  const args = session.role === 'STUDENT' ? [session.id] : [];
  const appeals = db.prepare(`SELECT a.*, u.full_name reviewer_name FROM appeals a
    LEFT JOIN users u ON u.id=a.reviewer_id ${where} ORDER BY a.created_at DESC`).all(...args);
  json(res, 200, { appeals });
});

addRoute('POST', /^\/api\/appeals$/, ({ res, body, session, ip }) => {
  const caseType = String(body.case_type || '');
  const entityId = String(body.entity_id || '');
  if (!['ENROLLMENT_RESULT', 'RECOGNITION', 'CREDENTIAL'].includes(caseType)) throw Object.assign(new Error('İtiraz türü geçersizdir.'), { status: 422 });
  let ownerEmail = null;
  if (caseType === 'ENROLLMENT_RESULT') ownerEmail = db.prepare('SELECT learner_email email FROM enrollments WHERE id=?').get(entityId)?.email;
  if (caseType === 'RECOGNITION') ownerEmail = db.prepare('SELECT applicant_email email FROM recognition_requests WHERE id=?').get(entityId)?.email;
  if (caseType === 'CREDENTIAL') ownerEmail = db.prepare(`SELECT e.learner_email email FROM credentials c JOIN enrollments e ON e.id=c.enrollment_id WHERE c.id=?`).get(entityId)?.email;
  if (!ownerEmail || ownerEmail.toLowerCase() !== session.email.toLowerCase()) throw Object.assign(new Error('Yalnızca kendi kaydınız için itiraz oluşturabilirsiniz.'), { status: 403 });
  const duplicate = db.prepare("SELECT 1 FROM appeals WHERE submitted_by=? AND case_type=? AND entity_id=? AND status IN ('SUBMITTED','UNDER_REVIEW')")
    .get(session.id, caseType, entityId);
  if (duplicate) throw Object.assign(new Error('Bu kayıt için açık bir itirazınız zaten bulunuyor.'), { status: 409 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO appeals (id, submitted_by, appellant_name, appellant_email, case_type, entity_id, subject, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, session.id, session.full_name, session.email, caseType, entityId,
    requiredText(body.subject, 'İtiraz konusu', 200), requiredText(body.description, 'İtiraz açıklaması', 4000));
  audit({ actorId: session.id, action: 'APPEAL_SUBMITTED', entityType: 'appeal', entityId: id, ipAddress: ip, after: { case_type: caseType, entity_id: entityId } });
  notify({ role: 'QUALITY', title: 'Yeni öğrenen itirazı', message: `${session.full_name} tarafından yeni bir itiraz oluşturuldu.`, entityType: 'appeal', entityId: id });
  json(res, 201, { appeal: db.prepare('SELECT * FROM appeals WHERE id=?').get(id) });
}, { roles: ['STUDENT'] });

addRoute('PATCH', /^\/api\/appeals\/([0-9a-f-]+)\/decision$/, ({ res, body, session, match, ip }) => {
  const appeal = db.prepare('SELECT * FROM appeals WHERE id=?').get(match[1]);
  if (!appeal) throw Object.assign(new Error('İtiraz bulunamadı.'), { status: 404 });
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(appeal.status)) throw Object.assign(new Error('Bu itiraz daha önce sonuçlandırılmış.'), { status: 409 });
  const status = String(body.status || 'RESOLVED');
  if (!['UNDER_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) throw Object.assign(new Error('İtiraz durumu geçersizdir.'), { status: 422 });
  const decision = status === 'UNDER_REVIEW' ? String(body.decision || '').trim() : requiredText(body.decision, 'Karar gerekçesi', 4000);
  db.prepare(`UPDATE appeals SET status=?, decision=?, reviewer_id=?, decided_at=CASE WHEN ? IN ('RESOLVED','REJECTED') THEN CURRENT_TIMESTAMP ELSE NULL END,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, decision, session.id, status, appeal.id);
  audit({ actorId: session.id, action: 'APPEAL_DECIDED', entityType: 'appeal', entityId: appeal.id, ipAddress: ip, before: appeal, after: { status, decision } });
  notifyEmail(appeal.appellant_email, { title: 'İtiraz durumunuz güncellendi', message: `${appeal.subject}: ${status}${decision ? ` — ${decision}` : ''}`, entityType: 'appeal', entityId: appeal.id });
  json(res, 200, { appeal: db.prepare('SELECT * FROM appeals WHERE id=?').get(appeal.id) });
}, { roles: ['QUALITY', 'COMMISSION'] });

addRoute('GET', /^\/api\/audit$/, ({ res }) => {
  const logs = db.prepare(`SELECT a.*, u.full_name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 250`).all();
  json(res, 200, { logs, integrity: verifyAuditChain() });
}, { roles: ['QUALITY'] });

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' || pathname.startsWith('/verify/') ? '/index.html' : pathname;
  const resolved = path.resolve(publicDir, `.${requested}`);
  if (resolved !== publicDir && !resolved.startsWith(`${publicDir}${path.sep}`)) return false;
  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) return false;
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, {
      'Content-Type': types[path.extname(resolved)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': path.extname(resolved) === '.html' ? 'no-store' : 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    fs.createReadStream(resolved).pipe(res);
    return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', config.appUrl);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return json(res, 400, { message: 'Geçersiz URL kodlaması.' }); }
  try {
    const route = routes.find((item) => item.method === req.method && item.pattern.test(pathname));
    if (route) {
      const match = pathname.match(route.pattern);
      const session = route.auth ? currentSession(req) : null;
      if (route.auth && !session) throw Object.assign(new Error('Oturum açmanız gerekiyor.'), { status: 401 });
      if (session) assertRole(session, route.roles);
      if (session && route.csrf && !['GET', 'HEAD'].includes(req.method || 'GET')) {
        const header = req.headers['x-csrf-token'];
        if (!header || !safeEqual(String(header), session.csrf_token)) throw Object.assign(new Error('Güvenlik doğrulaması başarısız. Sayfayı yenileyin.'), { status: 403 });
      }
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '') ? await readJson(req) : {};
      await route.handler({ req, res, url, match, body, session, ip: clientIp(req) });
      return;
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { message: 'API uç noktası bulunamadı.' });
    if (await serveStatic(req, res, pathname)) return;
    if (await serveStatic(req, res, '/index.html')) return;
    res.writeHead(404); res.end('Bulunamadı');
  } catch (error) {
    if (res.headersSent) return res.end();
    const status = Number(error.status || 500);
    if (status >= 500) console.error(error);
    if (pathname && pathname.endsWith('/certificate') && (req.headers.accept || '').includes('text/html')) {
      const errorHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Erişim Sınırı — Kapadokya Üniversitesi</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fdfaf7; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #ffffff; border-radius: 16px; padding: 40px 32px; max-width: 500px; text-align: center; box-shadow: 0 10px 30px rgba(114,27,54,0.08); border: 1px solid rgba(114,27,54,0.15); }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: #fee2e2; color: #991b1b; display: inline-flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 16px; }
    h1 { font-size: 20px; color: #721b36; margin: 0 0 10px; font-weight: 700; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
    .btn { display: inline-block; background: #721b36; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Görüntüleme Yetkiniz Bulunmuyor</h1>
    <p>${escapeHtml(error.message || 'Bu dijital mikro yeterlilik belgesine erişim izniniz bulunmamaktadır.')}</p>
    <a href="javascript:window.close()" class="btn">Pencereyi Kapat</a>
  </div>
</body>
</html>`;
      return sendHtml(res, status, errorHtml);
    }
    json(res, status, { message: status >= 500 ? 'Beklenmeyen bir sistem hatası oluştu.' : error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`KUN-MYYS ${config.appUrl} adresinde çalışıyor.`);
});
