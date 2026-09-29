import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function ensureKeys() {
  fs.mkdirSync(config.keysPath, { recursive: true, mode: 0o700 });
  const privatePath = path.join(config.keysPath, 'issuer-ed25519-private.pem');
  const publicPath = path.join(config.keysPath, 'issuer-ed25519-public.pem');
  if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
  }
  return {
    privateKey: crypto.createPrivateKey(fs.readFileSync(privatePath)),
    publicKey: crypto.createPublicKey(fs.readFileSync(publicPath))
  };
}

function issuerProfile() {
  return {
    id: config.institution.issuerDid,
    type: ['Profile'],
    name: config.institution.name,
    url: config.institution.website,
    email: config.institution.credentialEmail,
    address: { addressCountry: config.institution.country }
  };
}

export function publicKeyDocument() {
  const { publicKey } = ensureKeys();
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: config.institution.issuerDid,
    verificationMethod: [{
      id: `${config.institution.issuerDid}#key-1`,
      type: 'JsonWebKey2020',
      controller: config.institution.issuerDid,
      publicKeyJwk: publicKey.export({ format: 'jwk' })
    }],
    assertionMethod: [`${config.institution.issuerDid}#key-1`]
  };
}

function signDocument(document, created) {
  const { privateKey } = ensureKeys();
  const proofConfig = {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-jcs-2022',
    created,
    verificationMethod: `${config.institution.issuerDid}#key-1`,
    proofPurpose: 'assertionMethod'
  };
  const signingInput = stableStringify({ document, proofConfig });
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
  return { ...proofConfig, proofValue: `u${signature.toString('base64url')}` };
}

export function verifyDocumentProof(document) {
  try {
    const { proof, ...unsigned } = document || {};
    if (!proof?.proofValue?.startsWith('u')) return false;
    const { proofValue, ...proofConfig } = proof;
    const signingInput = stableStringify({ document: unsigned, proofConfig });
    const { publicKey } = ensureKeys();
    return crypto.verify(null, Buffer.from(signingInput), publicKey, Buffer.from(proofValue.slice(1), 'base64url'));
  } catch {
    return false;
  }
}

function signJwt(payload) {
  const { privateKey } = ensureKeys();
  const header = { alg: 'EdDSA', kid: `${config.institution.issuerDid}#key-1`, typ: 'vc+jwt' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(null, Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

export function verifyJwt(jwt) {
  try {
    const [header, payload, signature] = String(jwt).split('.');
    if (!header || !payload || !signature) return false;
    const { publicKey } = ensureKeys();
    return crypto.verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

export function createCredentialBundle({
  id,
  certificateNumber,
  verificationCode,
  issueDate,
  enrollment,
  program,
  outcomes,
  assessments,
  evidences = [],
  baseUrl
}) {
  const validFrom = new Date(`${issueDate}T00:00:00.000Z`).toISOString();
  const holderHash = crypto.createHash('sha256').update(`${enrollment.identity_number}|${enrollment.learner_email}`).digest('hex');
  const subjectId = `urn:kun:learner:${holderHash}`;
  const verifyUrl = `${baseUrl}/verify/${verificationCode}`;

  // YÖK EK-1'deki 11 alan, mevzuattaki adlarıyla ayrı ve değişmez bir anlık görüntü olarak saklanır.
  const ek1 = {
    learner_identity: { full_name: enrollment.learner_name, identity_number: enrollment.identity_number },
    micro_credential_title: program.title,
    awarding_body: config.institution.name,
    issue_date: issueDate,
    learning_outcomes: outcomes.map((item) => ({ code: item.code, description: item.description })),
    notional_workload: { total_hours: program.total_hours, ects: program.ects_credits },
    level: { tyc: program.tyc_level, eqf: program.eqf_level },
    assessment: assessments.map((item) => ({ type: item.assessment_type, method: item.title, supervision: item.supervision })),
    participation_form: program.delivery_mode,
    success_criteria: program.success_criteria,
    quality_assurance: program.quality_assurance,
    supplementary: {
      certificate_number: certificateNumber,
      verification_url: verifyUrl,
      verification_code: verificationCode,
      final_score: enrollment.final_score,
      letter_grade: enrollment.letter_grade,
      evidence_hashes: evidences.map((item) => ({ outcome: item.outcome_code, sha256: item.file_hash_sha256 }))
    }
  };

  const badge = {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context.json'],
    id: `${baseUrl}/api/credentials/${id}/badge`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: issuerProfile(),
    validFrom,
    name: program.title,
    credentialSubject: {
      id: subjectId,
      type: ['AchievementSubject'],
      achievement: {
        id: `${baseUrl}/api/programs/${program.id}`,
        type: ['Achievement'],
        achievementType: 'MicroCredential',
        name: program.title,
        description: program.summary,
        criteria: { narrative: program.success_criteria },
        alignment: [
          { targetName: `TYÇ Seviye ${program.tyc_level}`, targetFramework: 'Türkiye Yeterlilikler Çerçevesi' },
          { targetName: `EQF Level ${program.eqf_level}`, targetFramework: 'European Qualifications Framework' }
        ],
        tag: outcomes.map((item) => item.code)
      }
    },
    evidence: evidences.map((item, index) => ({
      id: `${verifyUrl}#evidence-${index + 1}`,
      name: `${item.outcome_code} öğrenme kanıtı`,
      description: `SHA-256: ${item.file_hash_sha256}`
    }))
  };
  badge.proof = signDocument(badge, validFrom);

  const vc = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    id: `urn:uuid:${id}`,
    type: ['VerifiableCredential', 'MicroCredential'],
    issuer: issuerProfile(),
    validFrom,
    credentialSubject: {
      id: subjectId,
      microCredential: {
        title: program.title,
        code: program.code,
        learningOutcomes: outcomes.map((item) => ({ code: item.code, description: item.description })),
        workload: { value: program.total_hours, unit: 'hour' },
        credit: { value: program.ects_credits, framework: 'ECTS' },
        level: { tyc: program.tyc_level, eqf: program.eqf_level },
        participation: program.delivery_mode,
        assessment: assessments.map((item) => item.title),
        result: { score: enrollment.final_score, letterGrade: enrollment.letter_grade },
        evidenceDigest: evidences.map((item) => ({ outcome: item.outcome_code, algorithm: 'sha-256', digest: item.file_hash_sha256 })),
        qualityAssurance: program.quality_assurance
      }
    },
    credentialStatus: { id: verifyUrl, type: 'KUNCredentialStatus' }
  };
  vc.proof = signDocument(vc, validFrom);

  const epoch = Math.floor(new Date(validFrom).getTime() / 1000);
  const vcJwt = signJwt({
    iss: config.institution.issuerDid,
    sub: subjectId,
    jti: vc.id,
    nbf: epoch,
    vc
  });

  return { ek1, badge, vc, vcJwt };
}
