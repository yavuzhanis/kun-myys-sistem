import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { hashPassword } from './security.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.evidencePath, { recursive: true });

export const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','COORDINATOR','UNIT_BOARD','COMMISSION','SENATE','EVALUATOR','QUALITY','STUDENT')),
  unit_name TEXT,
  identity_number TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  tyc_level INTEGER NOT NULL CHECK (tyc_level BETWEEN 5 AND 8),
  eqf_level INTEGER NOT NULL CHECK (eqf_level BETWEEN 5 AND 8),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('IN_PERSON','ONLINE','HYBRID')),
  target_audience TEXT NOT NULL,
  admission_requirements TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  quality_assurance TEXT NOT NULL,
  country_region TEXT NOT NULL DEFAULT 'TR',
  isced_code TEXT,
  esco_codes TEXT,
  stakeholder_report TEXT,
  total_hours INTEGER NOT NULL DEFAULT 0,
  ects_credits REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNIT_APPROVED','COMMISSION_APPROVED','SENATE_APPROVED','REJECTED','ARCHIVED')),
  version INTEGER NOT NULL DEFAULT 1,
  rejection_reason TEXT,
  submitted_at TEXT,
  decision_due_at TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS learning_outcomes (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  bloom_level TEXT NOT NULL,
  UNIQUE(program_id, code)
);
CREATE TABLE IF NOT EXISTS workloads (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  hours INTEGER NOT NULL CHECK (hours >= 0),
  description TEXT
);
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 100),
  threshold REAL NOT NULL CHECK (threshold >= 0 AND threshold <= 100),
  supervision TEXT NOT NULL,
  UNIQUE(program_id, code)
);
CREATE TABLE IF NOT EXISTS outcome_assessments (
  outcome_id TEXT NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  PRIMARY KEY(outcome_id, assessment_id)
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','SKIPPED')),
  decision_notes TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  due_at TEXT NOT NULL,
  UNIQUE(program_id, step_order)
);
CREATE TABLE IF NOT EXISTS offerings (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  code TEXT UNIQUE NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  quota INTEGER NOT NULL CHECK (quota > 0),
  instructor_name TEXT NOT NULL,
  delivery_mode TEXT NOT NULL,
  access_type TEXT NOT NULL DEFAULT 'OPEN' CHECK (access_type IN ('OPEN','CLOSED')),
  location TEXT,
  registration_deadline TEXT,
  fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RUNNING','COMPLETED','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL REFERENCES offerings(id),
  learner_name TEXT NOT NULL,
  learner_email TEXT NOT NULL,
  identity_number TEXT NOT NULL,
  learner_type TEXT NOT NULL CHECK (learner_type IN ('INTERNAL_KUN','EXTERNAL')),
  attendance_rate REAL NOT NULL DEFAULT 0,
  final_score REAL,
  letter_grade TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','FAILED','DROPPED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(offering_id, learner_email)
);
CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES learning_outcomes(id),
  evidence_type TEXT NOT NULL,
  original_name TEXT,
  file_path TEXT,
  source_url TEXT,
  mime_type TEXT,
  file_size_bytes INTEGER,
  file_hash_sha256 TEXT NOT NULL,
  score REAL NOT NULL,
  evaluator_notes TEXT,
  evaluator_id TEXT NOT NULL REFERENCES users(id),
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS degree_programs (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  total_ects REAL NOT NULL CHECK (total_ects > 0)
);
CREATE TABLE IF NOT EXISTS recognition_requests (
  id TEXT PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  student_id TEXT,
  degree_program_id TEXT NOT NULL REFERENCES degree_programs(id),
  source_institution TEXT NOT NULL,
  credential_title TEXT NOT NULL,
  credential_url TEXT,
  source_document_path TEXT,
  source_document_name TEXT,
  source_document_hash TEXT,
  requested_ects REAL NOT NULL,
  is_distance INTEGER NOT NULL DEFAULT 0,
  course_previously_taken INTEGER NOT NULL DEFAULT 0,
  already_transferred_ects REAL NOT NULL DEFAULT 0,
  already_transferred_count INTEGER NOT NULL DEFAULT 0,
  already_online_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED')),
  approved_ects REAL NOT NULL DEFAULT 0,
  decision_reason TEXT,
  evaluator_id TEXT REFERENCES users(id),
  evaluated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  certificate_number TEXT UNIQUE NOT NULL,
  enrollment_id TEXT UNIQUE NOT NULL REFERENCES enrollments(id),
  program_id TEXT NOT NULL REFERENCES programs(id),
  holder_name TEXT NOT NULL,
  holder_identity TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  verification_code TEXT UNIQUE NOT NULL,
  ek1_snapshot TEXT NOT NULL,
  open_badge_json TEXT NOT NULL,
  vc_json TEXT NOT NULL,
  vc_jwt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','REVOKED')),
  revocation_reason TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL REFERENCES offerings(id),
  enrollment_id TEXT REFERENCES enrollments(id),
  user_id TEXT REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_role TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  appellant_name TEXT NOT NULL,
  appellant_email TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('ENROLLMENT_RESULT','RECOGNITION','CREDENTIAL')),
  entity_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','RESOLVED','REJECTED')),
  decision TEXT,
  reviewer_id TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  ip_address TEXT,
  payload_before TEXT,
  payload_after TEXT,
  previous_hash TEXT,
  event_time TEXT,
  hash_chain TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_program_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_credential_code ON credentials(verification_code);
`);

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

for (const [table, column, definition] of [
  ['offerings', 'access_type', "TEXT NOT NULL DEFAULT 'OPEN'"],
  ['offerings', 'location', 'TEXT'],
  ['offerings', 'registration_deadline', 'TEXT'],
  ['offerings', 'updated_at', 'TEXT'],
  ['enrollments', 'letter_grade', 'TEXT'],
  ['enrollments', 'updated_at', 'TEXT'],
  ['evidences', 'source_url', 'TEXT'],
  ['evidences', 'mime_type', 'TEXT'],
  ['evidences', 'file_size_bytes', 'INTEGER'],
  ['recognition_requests', 'source_document_path', 'TEXT'],
  ['recognition_requests', 'source_document_name', 'TEXT'],
  ['recognition_requests', 'source_document_hash', 'TEXT'],
  ['feedback', 'enrollment_id', 'TEXT REFERENCES enrollments(id)'],
  ['feedback', 'user_id', 'TEXT REFERENCES users(id)'],
  ['audit_logs', 'previous_hash', 'TEXT'],
  ['audit_logs', 'event_time', 'TEXT']
]) ensureColumn(table, column, definition);

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_enrollment ON feedback(enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_user ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_role ON notifications(target_role, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_appeal_status ON appeals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_enrollment ON evidences(enrollment_id, outcome_id);
`);

function insertUser(fullName, email, role, unitName, password = 'Kun2026!') {
  const { salt, hash } = hashPassword(password);
  db.prepare(`INSERT OR IGNORE INTO users
    (id, full_name, email, password_hash, password_salt, role, unit_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), fullName, email, hash, salt, role, unitName);
}

export function seed() {
  insertUser('Sistem Yöneticisi', 'admin@kapadokya.edu.tr', 'ADMIN', 'Bilgi İşlem Daire Başkanlığı');
  insertUser('Program Koordinatörü', 'koordinator@kapadokya.edu.tr', 'COORDINATOR', 'Sürekli Eğitim Merkezi');
  insertUser('Akademik Birim Kurulu', 'birim@kapadokya.edu.tr', 'UNIT_BOARD', 'Bilişim ve Yapay Zekâ Fakültesi');
  insertUser('Mikro Yeterlilik Komisyonu', 'komisyon@kapadokya.edu.tr', 'COMMISSION', 'Rektörlük');
  insertUser('Senato Sekretaryası', 'senato@kapadokya.edu.tr', 'SENATE', 'Genel Sekreterlik');
  insertUser('Ölçme Değerlendiricisi', 'degerlendirici@kapadokya.edu.tr', 'EVALUATOR', 'Ölçme ve Değerlendirme Birimi');
  insertUser('Kalite Güvencesi', 'kalite@kapadokya.edu.tr', 'QUALITY', 'Kalite Koordinatörlüğü');
  insertUser('Örnek Öğrenci', 'ogrenci@kapadokya.edu.tr', 'STUDENT', 'Bilişim ve Yapay Zekâ Fakültesi');

  const degrees = [
    ['KUN-ONLISANS', 'Ön Lisans Programları', 120],
    ['KUN-LISANS', 'Lisans Programları', 240],
    ['KUN-YL', 'Tezli Yüksek Lisans Programları', 120],
    ['KUN-DR', 'Doktora Programları', 240]
  ];
  for (const [code, title, ects] of degrees) {
    db.prepare('INSERT OR IGNORE INTO degree_programs (id, code, title, total_ects) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), code, title, ects);
  }

  if (Number(db.prepare('SELECT COUNT(*) count FROM programs').get().count) === 0) {
    const coordinator = db.prepare("SELECT id FROM users WHERE role='COORDINATOR' LIMIT 1").get();
    const unit = db.prepare("SELECT id FROM users WHERE role='UNIT_BOARD' LIMIT 1").get();
    const commission = db.prepare("SELECT id FROM users WHERE role='COMMISSION' LIMIT 1").get();
    const senate = db.prepare("SELECT id FROM users WHERE role='SENATE' LIMIT 1").get();
    const programId = crypto.randomUUID();
    db.prepare(`INSERT INTO programs
      (id, code, title, summary, description, tyc_level, eqf_level, delivery_mode, target_audience,
       admission_requirements, success_criteria, quality_assurance, isced_code, esco_codes, stakeholder_report,
       total_hours, ects_credits, status, approved_at, created_by)
      VALUES (?, 'KUN-MY-2026-001', ?, ?, ?, 6, 6, 'HYBRID', ?, ?, ?, ?, '0613', ?, ?, 50, 2, 'SENATE_APPROVED', CURRENT_TIMESTAMP, ?)`)
      .run(programId,
        'Üretken Yapay Zekâ ile Akademik Üretkenlik',
        'Üretken yapay zekâ araçlarını etik, güvenli ve ölçülebilir biçimde akademik iş akışlarında kullanma yeterliliği.',
        'Katılımcılar problem tanımlama, istem tasarımı, kaynak doğrulama, veri güvenliği ve özgün akademik çıktı üretme uygulamalarını tamamlar.',
        'Kapadokya Üniversitesi öğrencileri, mezunları ve akademik/idari çalışanları',
        'Temel dijital okuryazarlık; aktif e-posta hesabı; ön koşul sınavından en az 50 puan',
        'Toplam başarı puanı en az 60, devam oranı en az %80 ve proje rubriğinin tüm kritik ölçütlerinde yeterli düzey',
        config.institution.qualityApproach,
        'artificial intelligence,digital literacy,prompt engineering',
        'Bilişim sektörü temsilcileri ve öğrenen odak grubu ile 2026 ihtiyaç analizi yapılmıştır.',
        coordinator.id);

    const outcomeRows = [
      ['ÖÇ1', 'Üretken yapay zekâ sistemlerinin yetenek ve sınırlılıklarını etik ilkeler bağlamında açıklar.', 'ANALYZE'],
      ['ÖÇ2', 'Amaca uygun, sınanabilir ve yeniden kullanılabilir istem zincirleri tasarlar.', 'CREATE'],
      ['ÖÇ3', 'Yapay zekâ destekli akademik çıktıyı kaynak, doğruluk ve özgünlük bakımından değerlendirir.', 'EVALUATE']
    ];
    const outcomeIds = new Map();
    for (const [code, description, bloom] of outcomeRows) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO learning_outcomes (id, program_id, code, description, bloom_level) VALUES (?, ?, ?, ?, ?)').run(id, programId, code, description, bloom);
      outcomeIds.set(code, id);
    }
    const workloadRows = [
      ['THEORETICAL', 10, 'Kavramsal çerçeve ve etik'],
      ['PRACTICAL', 12, 'Atölye uygulamaları'],
      ['LAB', 6, 'Araç laboratuvarı'],
      ['INDEPENDENT_STUDY', 8, 'Okuma ve bireysel denemeler'],
      ['PROJECT', 10, 'Bitirme projesi'],
      ['EXAM_PREP', 4, 'Değerlendirme hazırlığı']
    ];
    for (const [type, hours, description] of workloadRows) db.prepare('INSERT INTO workloads (id, program_id, activity_type, hours, description) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), programId, type, hours, description);
    const assessmentRows = [
      ['D1', 'Uygulamalı istem tasarımı projesi', 'CAPSTONE_PROJECT', 60, 60, 'ONSITE_ID_VERIFIED'],
      ['D2', 'Etik ve kaynak doğrulama sınavı', 'WRITTEN_EXAM', 40, 60, 'ONLINE_PROCTORED']
    ];
    const assessmentIds = new Map();
    for (const [code, title, type, weight, threshold, supervision] of assessmentRows) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO assessments (id, program_id, code, title, assessment_type, weight, threshold, supervision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, programId, code, title, type, weight, threshold, supervision);
      assessmentIds.set(code, id);
    }
    for (const [outcomeCode, assessmentCode] of [['ÖÇ1', 'D2'], ['ÖÇ2', 'D1'], ['ÖÇ3', 'D1'], ['ÖÇ3', 'D2']]) {
      db.prepare('INSERT INTO outcome_assessments (outcome_id, assessment_id) VALUES (?, ?)').run(outcomeIds.get(outcomeCode), assessmentIds.get(assessmentCode));
    }
    const due = new Date(Date.now() + 30 * 86400000).toISOString();
    for (const [order, role, userId] of [[1, 'UNIT_BOARD', unit.id], [2, 'COMMISSION', commission.id], [3, 'SENATE', senate.id]]) {
      db.prepare(`INSERT INTO approvals (id, program_id, step_order, approver_role, status, decision_notes, decided_by, decided_at, due_at)
        VALUES (?, ?, ?, ?, 'APPROVED', 'Örnek veri: uygun bulunmuştur.', ?, CURRENT_TIMESTAMP, ?)`)
        .run(crypto.randomUUID(), programId, order, role, userId, due);
    }
    const offeringId = crypto.randomUUID();
    db.prepare(`INSERT INTO offerings
      (id, program_id, code, start_date, end_date, quota, instructor_name, delivery_mode, status)
      VALUES (?, ?, 'KUN-MY-2026-001-G01', '2026-09-15', '2026-10-15', 30, 'Dr. Öğr. Üyesi Örnek Eğitici', 'HYBRID', 'RUNNING')`)
      .run(offeringId, programId);
    const completedEnrollmentId = crypto.randomUUID();
    db.prepare(`INSERT INTO enrollments
      (id, offering_id, learner_name, learner_email, identity_number, learner_type, attendance_rate, final_score, letter_grade, status)
      VALUES (?, ?, 'Ayşe Örnek', 'ayse.ornek@example.com', '11111111111', 'EXTERNAL', 92, 84, 'BB', 'COMPLETED')`)
      .run(completedEnrollmentId, offeringId);
    db.prepare(`INSERT INTO enrollments
      (id, offering_id, learner_name, learner_email, identity_number, learner_type, attendance_rate, status)
      VALUES (?, ?, 'Örnek Öğrenci', 'ogrenci@kapadokya.edu.tr', '22222222222', 'INTERNAL_KUN', 75, 'ACTIVE')`)
      .run(crypto.randomUUID(), offeringId);

    const evaluator = db.prepare("SELECT id FROM users WHERE role='EVALUATOR' LIMIT 1").get();
    for (const [outcomeCode, outcomeId] of outcomeIds.entries()) {
      const hash = crypto.createHash('sha256').update(`seed:${completedEnrollmentId}:${outcomeCode}`).digest('hex');
      db.prepare(`INSERT INTO evidences
        (id, enrollment_id, outcome_id, evidence_type, source_url, file_hash_sha256, score, evaluator_notes, evaluator_id)
        VALUES (?, ?, ?, 'RUBRIC_EVALUATION', ?, ?, 84, 'Örnek veri: öğrenme çıktısı rubrik ile doğrulandı.', ?)`)
        .run(crypto.randomUUID(), completedEnrollmentId, outcomeId, `${config.institution.website}/ornek-kanit/${outcomeCode}`, hash, evaluator.id);
    }
  }

  // mikro.kapadokya.edu.tr resmi vitrin eğitimlerinin tohumlanması
  const extraPrograms = [
    {
      code: 'KUN-MY-2026-002',
      title: 'Bilgisayar Destekli Tasarım ve 2D Dijital Üretim – Detay Tasarımı',
      summary: 'İki boyutlu parametrik teknik çizim, lazer kesim ve CNC hazırlığı ile dijital üretim iş akışlarında detay tasarım yetkinliği.',
      description: 'Öğrenenler AutoCAD ve 2D CAD araçlarıyla teknik detaylandırma, tolerans belirleme ve lazer kesim / CNC tezgâhlarına uygun 2D imalat dosyası hazırlama yetkinliği kazanır.',
      tyc: 5, eqf: 5, mode: 'HYBRID', hours: 50, ects: 2, isced: '0715',
      instructor: 'Öğr. Gör. Mehmet Demir',
      outcomes: [
        ['ÖÇ1', 'Teknik resim standartlarına uygun 2D imalat çizimleri ve detaylandırmalar üretir.', 'CREATE'],
        ['ÖÇ2', 'Tolerans ve yüzey işleme sembollerini üretim kısıtlarına göre analiz eder.', 'ANALYZE'],
        ['ÖÇ3', 'Lazer kesim ve CNC işleme için optimize edilmiş vektörel yerleşim (nesting) hazırlar.', 'APPLY']
      ],
      workloads: [['THEORETICAL', 10, 'Teknik Resim Standartları'], ['PRACTICAL', 15, '2D Modelleme ve Çizim'], ['LAB', 15, 'CNC ve Lazer Atölyesi'], ['PROJECT', 10, 'Uygulamalı Detay Tasarım Projesi']],
      assessments: [['D1', 'CNC İmalat Çizim Projesi', 'CAPSTONE_PROJECT', 60, 60, 'ONSITE_ID_VERIFIED'], ['D2', 'Teknik Şartname ve Tolerans Testi', 'WRITTEN_EXAM', 40, 60, 'ONLINE_PROCTORED']]
    },
    {
      code: 'KUN-MY-2026-003',
      title: 'DNA ve RNA İzolasyonu ve Kalite Analizi',
      summary: 'Moleküler biyoloji ve tanı laboratuvarlarında nükleik asit ekstraksiyonu, spektrofotometrik saflık ölçümü ve kalite kontrol yetkinliği.',
      description: 'Katılımcılar doku ve kandan kolon bazlı DNA/RNA izolasyonu, Nanodrop/Qubit spektrofotometrik saflık değerlendirmesi ve agaroz jel elektroforez kalite kontrol süreçlerini bizzat uygular.',
      tyc: 6, eqf: 6, mode: 'IN_PERSON', hours: 75, ects: 3, isced: '0511',
      instructor: 'Doç. Dr. Elif Kaya',
      outcomes: [
        ['ÖÇ1', 'Biyolojik örneklerden kolon ve manyetik boncuk yöntemleriyle DNA/RNA ekstraksiyonu gerçekleştirir.', 'APPLY'],
        ['ÖÇ2', 'Spektrofotometrik verileri (A260/A280, A260/A230) yorumlayarak nükleik asit saflık ve konsantrasyonunu belirler.', 'ANALYZE'],
        ['ÖÇ3', 'Agaroz jel elektroforezi ile nükleik asit bütünlüğünü değerlendirir ve laboratuvar kalite raporu hazırlar.', 'EVALUATE']
      ],
      workloads: [['THEORETICAL', 15, 'Nükleik Asit Biyokimyası'], ['LAB', 35, 'Laboratuvar İzolasyon ve Analiz'], ['INDEPENDENT_STUDY', 10, 'Protokol ve Literatür İncelemesi'], ['PROJECT', 15, 'Kalite Güvence Laboratuvar Raporu']],
      assessments: [['D1', 'Laboratuvar Uygulama Sınavı', 'PRACTICAL_EXAM', 60, 70, 'ONSITE_ID_VERIFIED'], ['D2', 'Protokol Değerlendirme ve Vaka Analizi', 'WRITTEN_EXAM', 40, 60, 'ONSITE_ID_VERIFIED']]
    },
    {
      code: 'KUN-MY-2026-004',
      title: 'PLC Programlama ve Endüstriyel Otomasyon Sistemleri',
      summary: 'Endüstriyel otomasyon süreçlerinde IEC 61131-3 standartlarında PLC programlama, sensör entegrasyonu ve arıza tespit yetkinliği.',
      description: 'Siemens TIA Portal üzerinde merdiven diyagramı (LAD) ve fonksiyon blokları (FBD) ile fabrika otomasyonu, acil durdurma senaryoları ve dijital sensör entegrasyonu pratikleri.',
      tyc: 5, eqf: 5, mode: 'HYBRID', hours: 75, ects: 3, isced: '0714',
      instructor: 'Dr. Öğr. Üyesi Caner Yılmaz',
      outcomes: [
        ['ÖÇ1', 'Endüstriyel sensör ve aktüatör bağlantılarını PLC giriş/çıkış modülleriyle eşleştirir.', 'APPLY'],
        ['ÖÇ2', 'IEC 61131-3 standartlarında LAD ve FBD dilleriyle sıralı otomasyon algoritmaları kodlar.', 'CREATE'],
        ['ÖÇ3', 'Otomasyon hatlarındaki donanımsal ve yazılımsal arızaları teşhis ederek giderir.', 'ANALYZE']
      ],
      workloads: [['THEORETICAL', 15, 'Otomasyon Mimarisi'], ['LAB', 30, 'PLC Donanım ve Sensör Laboratuvarı'], ['PRACTICAL', 20, 'Algoritma ve Kodlama Pratiği'], ['PROJECT', 10, 'Fabrika Bandı Simülasyon Projesi']],
      assessments: [['D1', 'Otomasyon Bandı Programlama Projesi', 'CAPSTONE_PROJECT', 60, 60, 'ONSITE_ID_VERIFIED'], ['D2', 'PLC Teori ve Kod Analiz Sınavı', 'WRITTEN_EXAM', 40, 60, 'ONLINE_PROCTORED']]
    },
    {
      code: 'KUN-MY-2026-005',
      title: 'SolidWorks ile 3B Tasarım ve Mekanik Sistem Modelleme',
      summary: 'Parametrik 3B katı modelleme, montaj simülasyonu, teknik resim oluşturma ve toleranslandırma yetkinliği.',
      description: 'Mekanik parça modelleme, yüzey tasarımı, sac levha tasarımı, montaj çakışma analizi ve CSWA/CSWP sertifikasyon standartlarına uygun profesyonel mekanik tasarım.',
      tyc: 6, eqf: 6, mode: 'HYBRID', hours: 50, ects: 2, isced: '0715',
      instructor: 'Öğr. Gör. Burak Yıldız',
      outcomes: [
        ['ÖÇ1', 'Karmaşık makine elemanlarını parametrik katı ve yüzey modelleme teknikleriyle oluşturur.', 'CREATE'],
        ['ÖÇ2', 'Hareketli mekanik montajları birleştirir, dinamik serbestlik derecelerini ve çakışmaları analiz eder.', 'ANALYZE'],
        ['ÖÇ3', 'İmalata yönelik GD&T geometrik toleranslandırma kurallarına uygun teknik resim paftaları üretir.', 'APPLY']
      ],
      workloads: [['THEORETICAL', 10, 'Parametrik Modelleme İlkeleri'], ['PRACTICAL', 20, 'SolidWorks Atölye Uygulamaları'], ['LAB', 10, 'Montaj ve Hareket Analizi'], ['PROJECT', 10, 'Endüstriyel Mekanizma Projesi']],
      assessments: [['D1', 'Mekanik Sistem Modelleme Projesi', 'CAPSTONE_PROJECT', 60, 65, 'ONSITE_ID_VERIFIED'], ['D2', 'Hızlı Modelleme ve Geometri Testi', 'PRACTICAL_EXAM', 40, 60, 'ONSITE_ID_VERIFIED']]
    },
    {
      code: 'KUN-MY-2026-006',
      title: 'Yaklaşık Maliyet Analizi',
      summary: 'Kamu ihale ve özel sektör inşaat projelerinde Çevre ve Şehircilik Bakanlığı pozları ile birim fiyat ve yaklaşık maliyet cetveli hazırlama yetkinliği.',
      description: '4734 Sayılı Kamu İhale Kanunu uyarınca metraj çıkarma, rayiç analizleri, nakliye hesapları, pursantaj tabloları ve hakediş yazılımları ile yaklaşık maliyet hesaplama pratikleri.',
      tyc: 6, eqf: 6, mode: 'ONLINE', hours: 50, ects: 2, isced: '0732',
      instructor: 'Yük. Müh. Selim Arslan',
      outcomes: [
        ['ÖÇ1', 'Mimari ve statik projeler üzerinden mahal listelerine göre doğru metraj cetvelleri çıkarır.', 'APPLY'],
        ['ÖÇ2', 'Bakanlık güncel pozları ve piyasa rayiçleriyle birim fiyat analizi ve nakliye hesapları yapar.', 'ANALYZE'],
        ['ÖÇ3', 'İhale mevzuatına uygun standart yaklaşık maliyet hesap cetvelini ve pursantaj oranlarını hazırlar.', 'CREATE']
      ],
      workloads: [['THEORETICAL', 15, 'İhale Mevzuatı ve Birim Fiyat İlkeleri'], ['PRACTICAL', 15, 'Metraj ve Poz Eşleştirme'], ['INDEPENDENT_STUDY', 10, 'Rayiç ve Analiz Çalışmaları'], ['PROJECT', 10, 'Örnek Bina Yaklaşık Maliyet Dosyası']],
      assessments: [['D1', 'Örnek Proje Yaklaşık Maliyet Dosyası', 'CAPSTONE_PROJECT', 60, 60, 'ONLINE_PROCTORED'], ['D2', 'Birim Fiyat ve Mevzuat Sınavı', 'WRITTEN_EXAM', 40, 60, 'ONLINE_PROCTORED']]
    },
    {
      code: 'KUN-MY-2026-007',
      title: 'Yapay Zekâ Destekli Modern Yazılım Geliştirme',
      summary: 'Büyük dil modelleri, kod asistanları, birim test otomasyonu ve CI/CD süreçlerini modern yazılım mühendisliği pratikleriyle birleştirme yetkinliği.',
      description: 'Copilot, Cursor ve açık kaynak LLM araçlarıyla mimari planlama, test güdümlü geliştirme (TDD), güvenlik analizi ve konteynerize mikroservis mimarileri inşa etme.',
      tyc: 6, eqf: 6, mode: 'ONLINE', hours: 75, ects: 3, isced: '0613',
      instructor: 'Dr. Öğr. Üyesi Serdar Aktaş',
      outcomes: [
        ['ÖÇ1', 'Yapay zekâ kod asistanlarıyla mimari şablonlar, API sözleşmeleri ve temiz kod blokları üretir.', 'CREATE'],
        ['ÖÇ2', 'Üretilen kodların güvenlik açıklarını, performans darboğazlarını ve mantık hatalarını analiz eder.', 'ANALYZE'],
        ['ÖÇ3', 'Otomatik birim/entegrasyon testleri ve CI/CD iş akışları kurgulayarak yazılım dağıtımını gerçekleştirir.', 'APPLY']
      ],
      workloads: [['THEORETICAL', 15, 'LLM ve Yazılım Mühendisliği'], ['PRACTICAL', 25, 'İstem Odaklı Geliştirme ve TDD'], ['LAB', 20, 'CI/CD ve Otomasyon Laboratuvarı'], ['PROJECT', 15, 'AI Destekli Canlı Mikroservis Projesi']],
      assessments: [['D1', 'Modern Yazılım Geliştirme Capstone Projesi', 'CAPSTONE_PROJECT', 60, 65, 'ONLINE_PROCTORED'], ['D2', 'Kod İnceleme ve Güvenlik Sınavı', 'WRITTEN_EXAM', 40, 60, 'ONLINE_PROCTORED']]
    }
  ];

  const coordinatorUser = db.prepare("SELECT id FROM users WHERE role='COORDINATOR' LIMIT 1").get();
  const unitUser = db.prepare("SELECT id FROM users WHERE role='UNIT_BOARD' LIMIT 1").get();
  const commUser = db.prepare("SELECT id FROM users WHERE role='COMMISSION' LIMIT 1").get();
  const senateUser = db.prepare("SELECT id FROM users WHERE role='SENATE' LIMIT 1").get();

  for (const prog of extraPrograms) {
    const existing = db.prepare('SELECT id FROM programs WHERE code = ?').get(prog.code);
    if (!existing) {
      const pId = crypto.randomUUID();
      db.prepare(`INSERT INTO programs
        (id, code, title, summary, description, tyc_level, eqf_level, delivery_mode, target_audience,
         admission_requirements, success_criteria, quality_assurance, isced_code, esco_codes, stakeholder_report,
         total_hours, ects_credits, status, approved_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENATE_APPROVED', CURRENT_TIMESTAMP, ?)`)
        .run(
          pId, prog.code, prog.title, prog.summary, prog.description, prog.tyc, prog.eqf, prog.mode,
          'Kapadokya Üniversitesi öğrencileri, mezunları, sektör çalışanları ve bireysel öğrenenler',
          'İlgili alanda temel düzey ilgi veya ön lisans/lisans eğitimi; aktif e-posta hesabı',
          'Başarı puanı en az 60, devam oranı en az %80 ve belirlenen ölçütlerde yeterlilik',
          config.institution.qualityApproach,
          prog.isced, 'micro-credential,kapadokya,vocational',
          'Akademik birim ve sektör temsilcileri ihtiyaç analizi raporu onaylıdır.',
          prog.hours, prog.ects, coordinatorUser.id
        );

      const oMap = new Map();
      for (const [oCode, oDesc, oBloom] of prog.outcomes) {
        const oId = crypto.randomUUID();
        db.prepare('INSERT INTO learning_outcomes (id, program_id, code, description, bloom_level) VALUES (?, ?, ?, ?, ?)').run(oId, pId, oCode, oDesc, oBloom);
        oMap.set(oCode, oId);
      }

      for (const [wType, wHours, wDesc] of prog.workloads) {
        db.prepare('INSERT INTO workloads (id, program_id, activity_type, hours, description) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), pId, wType, wHours, wDesc);
      }

      const aMap = new Map();
      for (const [aCode, aTitle, aType, aWeight, aThresh, aSuper] of prog.assessments) {
        const aId = crypto.randomUUID();
        db.prepare('INSERT INTO assessments (id, program_id, code, title, assessment_type, weight, threshold, supervision) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(aId, pId, aCode, aTitle, aType, aWeight, aThresh, aSuper);
        aMap.set(aCode, aId);
      }

      for (const oId of oMap.values()) {
        for (const aId of aMap.values()) {
          db.prepare('INSERT INTO outcome_assessments (outcome_id, assessment_id) VALUES (?, ?)').run(oId, aId);
        }
      }

      const due = new Date(Date.now() + 30 * 86400000).toISOString();
      for (const [order, role, uId] of [[1, 'UNIT_BOARD', unitUser.id], [2, 'COMMISSION', commUser.id], [3, 'SENATE', senateUser.id]]) {
        db.prepare(`INSERT INTO approvals (id, program_id, step_order, approver_role, status, decision_notes, decided_by, decided_at, due_at)
          VALUES (?, ?, ?, ?, 'APPROVED', 'Senato kararıyla onaylanmıştır.', ?, CURRENT_TIMESTAMP, ?)`)
          .run(crypto.randomUUID(), pId, order, role, uId, due);
      }

      const offId = crypto.randomUUID();
      db.prepare(`INSERT INTO offerings
        (id, program_id, code, start_date, end_date, quota, instructor_name, delivery_mode, status)
        VALUES (?, ?, ?, '2026-10-01', '2026-11-15', 30, ?, ?, 'OPEN')`)
        .run(offId, pId, `${prog.code}-G01`, prog.instructor, prog.mode);
    }
  }
}

export function audit({ actorId = null, action, entityType, entityId, ipAddress = null, before = null, after = null }) {
  const previous = db.prepare('SELECT hash_chain FROM audit_logs ORDER BY id DESC LIMIT 1').get()?.hash_chain || 'GENESIS';
  const at = new Date().toISOString();
  const material = JSON.stringify({ previous, actorId, action, entityType, entityId, before, after, at });
  const hashChain = crypto.createHash('sha256').update(material).digest('hex');
  db.prepare(`INSERT INTO audit_logs
    (actor_id, action, entity_type, entity_id, ip_address, payload_before, payload_after, previous_hash, event_time, hash_chain, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(actorId, action, entityType, entityId, ipAddress, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, previous, at, hashChain, at);
}

export function notify({ userId = null, role = null, title, message, entityType = null, entityId = null }) {
  if (role && !userId) {
    const users = db.prepare('SELECT id FROM users WHERE role=? AND is_active=1').all(role);
    if (users.length) {
      for (const user of users) notify({ userId: user.id, title, message, entityType, entityId });
      return;
    }
  }
  db.prepare(`INSERT INTO notifications (id, user_id, target_role, title, message, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), userId, userId ? null : role, title, message, entityType, entityId);
}

export function verifyAuditChain() {
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id').all();
  let previous = 'GENESIS';
  for (const row of rows) {
    if (!row.event_time || !row.previous_hash) return { valid: false, checked: row.id - 1, total: rows.length, reason: 'LEGACY_RECORD' };
    const before = row.payload_before ? JSON.parse(row.payload_before) : null;
    const after = row.payload_after ? JSON.parse(row.payload_after) : null;
    const material = JSON.stringify({ previous, actorId: row.actor_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, before, after, at: row.event_time });
    const expected = crypto.createHash('sha256').update(material).digest('hex');
    if (row.previous_hash !== previous || row.hash_chain !== expected) {
      return { valid: false, checked: row.id - 1, total: rows.length, reason: 'HASH_MISMATCH', broken_at: row.id };
    }
    previous = row.hash_chain;
  }
  return { valid: true, checked: rows.length, total: rows.length, head: previous };
}

seed();
