import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEcts,
  validateProgramForSubmission,
  validateRecognitionLimits
} from '../src/rules.js';

test('25 saatlik iş yükü tam 1 AKTS üretir', () => {
  assert.deepEqual(calculateEcts([{ hours: 10 }, { hours: 15 }]), { totalHours: 25, ects: 1, isExact: true });
});

test('tam kat olmayan iş yükü taslakta hesaplanır fakat onaya uygun değildir', () => {
  const result = calculateEcts([{ hours: 33 }]);
  assert.equal(result.ects, 1.32);
  assert.equal(result.isExact, false);
});

test('diploma AKTS değerinin yüzde 10 üzerindeki aktarımı reddeder', () => {
  const result = validateRecognitionLimits({
    degreeTotalEcts: 240,
    alreadyTransferredEcts: 20,
    requestedEcts: 6,
    alreadyTransferredCount: 2,
    alreadyOnlineCount: 1,
    isRequestedOnline: false
  });
  assert.equal(result.allowed, false);
  assert.match(result.errors.join(' '), /%10/);
});

test('uzaktan eğitim sayısı transfer setinin yüzde 50 üzerindeyse reddeder', () => {
  const result = validateRecognitionLimits({
    degreeTotalEcts: 240,
    alreadyTransferredEcts: 4,
    requestedEcts: 2,
    alreadyTransferredCount: 2,
    alreadyOnlineCount: 1,
    isRequestedOnline: true
  });
  assert.equal(result.allowed, false);
  assert.match(result.errors.join(' '), /%50/);
});

test('eksik çıktı-değerlendirme matrisi program gönderimini engeller', () => {
  const result = validateProgramForSubmission({
    title: 'Örnek', summary: 'Özet', description: 'Açıklama', target_audience: 'Öğrenciler',
    admission_requirements: 'Yok', success_criteria: '60 puan', quality_assurance: 'İç kalite',
    tyc_level: 6, delivery_mode: 'HYBRID', workloads: [{ hours: 25 }],
    outcomes: [{ code: 'ÖÇ1' }], assessments: [{ code: 'D1', weight: 100 }], mappings: []
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /eşleştirilmelidir/);
});
