export const HOURS_PER_ECTS = 25;
export const MAX_TRANSFER_RATIO = 0.10;
export const MAX_ONLINE_TRANSFER_RATIO = 0.50;

export const PROGRAM_STATUSES = Object.freeze({
  DRAFT: 'Taslak',
  SUBMITTED: 'Birim Kurulu İncelemesinde',
  UNIT_APPROVED: 'Mikro Yeterlilik Komisyonunda',
  COMMISSION_APPROVED: 'Senato Onayında',
  SENATE_APPROVED: 'Senato Onaylı',
  REJECTED: 'Revizyon İstendi',
  ARCHIVED: 'Arşivlendi'
});

export const DELIVERY_MODES = Object.freeze({
  IN_PERSON: 'Yüz Yüze',
  ONLINE: 'Uzaktan',
  HYBRID: 'Hibrit'
});

export const WORKLOAD_TYPES = Object.freeze({
  THEORETICAL: 'Teorik eğitim',
  PRACTICAL: 'Uygulama',
  LAB: 'Laboratuvar',
  INDEPENDENT_STUDY: 'Bireysel çalışma',
  PROJECT: 'Proje / ödev',
  EXAM_PREP: 'Sınav hazırlığı ve değerlendirme'
});

export function calculateEcts(workloads = []) {
  const totalHours = workloads.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  if (!Number.isFinite(totalHours) || totalHours <= 0) {
    return { totalHours: 0, ects: 0, isExact: false };
  }
  return {
    totalHours,
    ects: Number((totalHours / HOURS_PER_ECTS).toFixed(2)),
    isExact: totalHours % HOURS_PER_ECTS === 0
  };
}

export function validateRecognitionLimits({
  degreeTotalEcts,
  alreadyTransferredEcts = 0,
  alreadyTransferredCount = 0,
  alreadyOnlineCount = 0,
  requestedEcts,
  isRequestedOnline = false,
  coursePreviouslyTaken = false
}) {
  const degree = Number(degreeTotalEcts);
  const prior = Number(alreadyTransferredEcts);
  const priorCount = Number(alreadyTransferredCount);
  const priorOnlineCount = Number(alreadyOnlineCount);
  const requested = Number(requestedEcts);
  const errors = [];

  if (![degree, prior, priorCount, priorOnlineCount, requested].every(Number.isFinite) || degree <= 0 || requested <= 0 || priorCount < 0 || priorOnlineCount < 0) {
    errors.push('AKTS değerleri pozitif ve sayısal olmalıdır.');
  }

  const maxTotal = Number((degree * MAX_TRANSFER_RATIO).toFixed(2));
  const projectedTotal = Number((prior + requested).toFixed(2));
  const projectedCount = priorCount + 1;
  const projectedOnlineCount = priorOnlineCount + (isRequestedOnline ? 1 : 0);
  const maxOnlineCount = Math.floor(projectedCount * MAX_ONLINE_TRANSFER_RATIO);

  if (projectedTotal > maxTotal) {
    errors.push(`Toplam mikro yeterlilik aktarımı ${maxTotal} AKTS (%10) sınırını aşamaz.`);
  }
  if (projectedOnlineCount > maxOnlineCount) {
    errors.push(`Uzaktan alınan mikro yeterlilik sayısı toplam transfer setinin %50’sini aşamaz (izin verilen: ${maxOnlineCount}, oluşacak: ${projectedOnlineCount}).`);
  }
  if (coursePreviouslyTaken) {
    errors.push('Muafiyet istenen ders daha önce alınmış olduğundan bu talep birleştirilerek kullanılamaz.');
  }

  return { allowed: errors.length === 0, errors, maxTotal, projectedTotal, maxOnlineCount, projectedOnlineCount, projectedCount };
}

export function validateProgramForSubmission(program) {
  const errors = [];
  const required = [
    ['title', 'Program adı'],
    ['summary', 'Program özeti'],
    ['description', 'Program açıklaması'],
    ['target_audience', 'Hedef kitle'],
    ['admission_requirements', 'Kabul koşulları'],
    ['success_criteria', 'Başarı kriterleri'],
    ['quality_assurance', 'Kalite güvencesi yaklaşımı']
  ];
  for (const [field, label] of required) {
    if (!String(program[field] || '').trim()) errors.push(`${label} zorunludur.`);
  }
  if (![5, 6, 7, 8].includes(Number(program.tyc_level))) errors.push('TYÇ düzeyi 5–8 arasında olmalıdır.');
  if (!['IN_PERSON', 'ONLINE', 'HYBRID'].includes(program.delivery_mode)) errors.push('Katılım şekli geçersizdir.');
  if (!program.outcomes?.length) errors.push('En az bir ölçülebilir öğrenme çıktısı tanımlanmalıdır.');
  if (!program.assessments?.length) errors.push('En az bir ölçme-değerlendirme yöntemi tanımlanmalıdır.');
  const totalWeight = (program.assessments || []).reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (program.assessments?.length && Math.abs(totalWeight - 100) > 0.001) errors.push('Ölçme yöntemlerinin ağırlıkları toplamı %100 olmalıdır.');

  const calculation = calculateEcts(program.workloads);
  if (!calculation.totalHours) errors.push('Öğrenen iş yükü tanımlanmalıdır.');
  if (calculation.totalHours && !calculation.isExact) errors.push('Toplam iş yükü 25 saatin tam katı olmalıdır.');

  const mapped = new Set((program.mappings || []).map((item) => item.outcome_code));
  for (const outcome of program.outcomes || []) {
    if (!mapped.has(outcome.code)) errors.push(`${outcome.code} öğrenme çıktısı bir değerlendirme yöntemiyle eşleştirilmelidir.`);
  }
  return { valid: errors.length === 0, errors, ...calculation };
}

export function maskName(value = '') {
  return String(value).trim().split(/\s+/).map((part) => {
    if (part.length <= 2) return `${part[0] || ''}*`;
    return `${part.slice(0, 2)}${'*'.repeat(Math.min(6, part.length - 2))}`;
  }).join(' ');
}

export function maskIdentity(value = '') {
  const input = String(value).trim();
  if (input.length < 5) return '***';
  return `${input.slice(0, 2)}${'*'.repeat(Math.max(3, input.length - 4))}${input.slice(-2)}`;
}
