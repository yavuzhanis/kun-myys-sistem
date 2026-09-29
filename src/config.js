import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export const config = Object.freeze({
  root,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8080),
  appUrl: (process.env.APP_URL || 'http://127.0.0.1:8080').replace(/\/$/, ''),
  databasePath: path.resolve(root, process.env.DATABASE_PATH || './data/kun-myys.sqlite'),
  evidencePath: path.resolve(root, process.env.EVIDENCE_PATH || './storage/evidence'),
  keysPath: path.resolve(root, process.env.KEYS_PATH || './data/keys'),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
  trustProxy: String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true',
  institution: {
    name: 'Kapadokya Üniversitesi',
    country: 'TR',
    website: 'https://kapadokya.edu.tr',
    credentialEmail: 'mikroyeterlilik@kapadokya.edu.tr',
    issuerDid: 'did:web:kapadokya.edu.tr:credentials:myys',
    qualityApproach: 'Kapadokya Üniversitesi iç kalite güvence sistemi; program, ölçme-değerlendirme, öğrenen geri bildirimi ve paydaş değerlendirmesi.'
  }
});
