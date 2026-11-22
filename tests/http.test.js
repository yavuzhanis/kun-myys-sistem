import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve(import.meta.dirname, '..');

async function waitForServer(url, child) {
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode !== null) throw new Error(`Sunucu erken kapandı: ${child.exitCode}`);
    try { const response = await fetch(`${url}/`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Test sunucusu başlamadı.');
}

test('giriş, belge düzenleme ve kamuya açık doğrulama uçtan uca çalışır', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kun-myys-test-'));
  const port = 21000 + (process.pid % 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), APP_URL: base, DATABASE_PATH: path.join(temp, 'test.sqlite'), EVIDENCE_PATH: path.join(temp, 'evidence'), KEYS_PATH: path.join(temp, 'keys') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await waitForServer(base, child);

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const catalog = await fetch(`${base}/api/catalog`);
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).programs.length >= 1);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@kapadokya.edu.tr', password: 'Kun2026!' })
  });
  assert.equal(login.status, 200);
  const auth = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'content-type': 'application/json', 'x-csrf-token': auth.csrf };

  const createdResponse = await fetch(`${base}/api/programs`, {
    method: 'POST', headers,
    body: JSON.stringify({
      code: 'KUN-TEST-001', title: 'Test Mikro Yeterliliği', summary: 'Test özeti', description: 'Test açıklaması',
      tyc_level: 6, delivery_mode: 'IN_PERSON', target_audience: 'Öğrenenler', admission_requirements: 'Ön koşul yok',
      success_criteria: 'En az 60 puan', quality_assurance: 'KÜN iç kalite sistemi',
      outcomes: [{ code: 'ÖÇ1', description: 'Test çıktısını uygular.', bloom_level: 'APPLY' }],
      workloads: [{ activity_type: 'THEORETICAL', hours: 25 }],
      assessments: [{ code: 'D1', title: 'Uygulama', assessment_type: 'PRACTICE', weight: 100, threshold: 60, supervision: 'ONSITE_ID_VERIFIED' }],
      mappings: [{ outcome_code: 'ÖÇ1', assessment_code: 'D1' }]
    })
  });
  assert.equal(createdResponse.status, 201);
  let program = (await createdResponse.json()).program;
  const submitted = await fetch(`${base}/api/programs/${program.id}/submit`, { method: 'POST', headers });
  assert.equal(submitted.status, 200);
  for (let i = 0; i < 3; i += 1) {
    const decision = await fetch(`${base}/api/programs/${program.id}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'APPROVE', notes: 'Test onayı' }) });
    assert.equal(decision.status, 200);
    program = (await decision.json()).program;
  }
  assert.equal(program.status, 'SENATE_APPROVED');

  const enrollmentsResponse = await fetch(`${base}/api/enrollments`, { headers: { cookie } });
  assert.equal(enrollmentsResponse.status, 200);
  const enrollments = (await enrollmentsResponse.json()).enrollments;
  const completed = enrollments.find((item) => item.status === 'COMPLETED');
  assert.ok(completed);
  assert.equal(typeof completed.evidence_count, 'number');

  const programDetail = await fetch(`${base}/api/programs/${completed.program_id}`, { headers: { cookie } });
  assert.equal(programDetail.status, 200);
  const completedProgram = (await programDetail.json()).program;
  const evidence = await fetch(`${base}/api/evidences`, {
    method: 'POST', headers,
    body: JSON.stringify({
      enrollment_id: completed.id,
      outcome_id: completedProgram.outcomes[0].id,
      evidence_type: 'PROJECT_FILE',
      original_name: 'kanit.txt',
      content_base64: Buffer.from('KÜN kanıt testi').toString('base64'),
      score: 88,
      notes: 'Uçtan uca test kanıtı'
    })
  });
  assert.equal(evidence.status, 201);
  assert.match((await evidence.json()).evidence.file_hash_sha256, /^[a-f0-9]{64}$/);

  const offering = (await (await fetch(`${base}/api/offerings`, { headers: { cookie } })).json()).offerings[0];
  const offeringUpdate = await fetch(`${base}/api/offerings/${offering.id}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ location: 'Uçhisar yerleşkesi', access_type: 'OPEN', status: offering.status })
  });
  assert.equal(offeringUpdate.status, 200);

  const userCreate = await fetch(`${base}/api/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ full_name: 'V2 Test Kullanıcısı', email: 'v2.test@kapadokya.edu.tr', role: 'STUDENT', password: 'V2TestPassword!' })
  });
  assert.equal(userCreate.status, 201);

  const studentLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ogrenci@kapadokya.edu.tr', password: 'Kun2026!' })
  });
  assert.equal(studentLogin.status, 200);
  const studentAuth = await studentLogin.json();
  const studentCookie = studentLogin.headers.get('set-cookie').split(';')[0];
  const studentHeaders = { cookie: studentCookie, 'content-type': 'application/json', 'x-csrf-token': studentAuth.csrf };
  const studentEnrollments = await fetch(`${base}/api/enrollments`, { headers: { cookie: studentCookie } });
  assert.equal(studentEnrollments.status, 200);
  const studentEnrollment = (await studentEnrollments.json()).enrollments[0];
  assert.equal(studentEnrollment.learner_email, 'ogrenci@kapadokya.edu.tr');
  const feedback = await fetch(`${base}/api/feedback`, { method: 'POST', headers: studentHeaders, body: JSON.stringify({ enrollment_id: studentEnrollment.id, score: 5, comment: 'V2 test geri bildirimi' }) });
  assert.equal(feedback.status, 201);
  const appeal = await fetch(`${base}/api/appeals`, { method: 'POST', headers: studentHeaders, body: JSON.stringify({ case_type: 'ENROLLMENT_RESULT', entity_id: studentEnrollment.id, subject: 'Test itirazı', description: 'V2 test itiraz açıklaması' }) });
  assert.equal(appeal.status, 201);
  const studentAppeals = await fetch(`${base}/api/appeals`, { headers: { cookie: studentCookie } });
  assert.equal((await studentAppeals.json()).appeals.length, 1);
  const audit = await fetch(`${base}/api/audit`, { headers: { cookie } });
  assert.equal(audit.status, 200);
  assert.equal((await audit.json()).integrity.valid, true);
  const quality = await fetch(`${base}/api/quality`, { headers: { cookie } });
  assert.equal(quality.status, 200);
  assert.equal((await quality.json()).auditIntegrity.valid, true);

  const issue = await fetch(`${base}/api/credentials`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ enrollment_id: completed.id })
  });
  if (issue.status !== 201) assert.fail(`Belge düzenleme başarısız: ${issue.status} ${await issue.text()}`);
  const issued = await issue.json();

  const verify = await fetch(`${base}/api/verify/${issued.credential.verification_code}`);
  assert.equal(verify.status, 200);
  const verified = await verify.json();
  assert.equal(verified.status, 'VALID');
  assert.equal(verified.signature_valid, true);
  assert.deepEqual(verified.signatures, { jwt: true, badge: true, vc: true });
  assert.match(verified.holder_name, /\*/);
  const certificate = await fetch(`${base}/api/credentials/${issued.credential.id}/certificate`, { headers: { cookie } });
  assert.equal(certificate.status, 200);
  assert.match(certificate.headers.get('content-type'), /text\/html/);
});
