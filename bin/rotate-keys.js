#!/usr/bin/env node
// İmza anahtarını rotate eder.
//
// Mevcut açık anahtar data/keys/retired/key-<n>-ed25519-public.pem konumuna taşınır
// ve özel anahtar silinir. Böylece:
//   - Eski belgeler retired açık anahtarı sayesinde doğrulanmaya devam eder.
//   - Bir sonraki sunucu başlatmasında ensureKeyPair() yeni bir Ed25519 çifti üretir.
//   - Yeni belgeler yeni anahtarla (bir sonraki boş key-<n> kimliğiyle) imzalanır.
//
// Kullanım: node bin/rotate-keys.js
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { currentIssuerKeyId } from '../src/credentials.js';

const privatePath = path.join(config.keysPath, 'issuer-ed25519-private.pem');
const publicPath = path.join(config.keysPath, 'issuer-ed25519-public.pem');

if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
  console.error('Aktif anahtar çifti bulunamadı; rotate edilecek bir şey yok.');
  process.exit(1);
}

const retiredId = currentIssuerKeyId();
const retiredDir = path.join(config.keysPath, 'retired');
fs.mkdirSync(retiredDir, { recursive: true });
const target = path.join(retiredDir, `${retiredId}-ed25519-public.pem`);

if (fs.existsSync(target)) {
  console.error(`${target} zaten mevcut; çakışma olmaması için elle düzenleyin.`);
  process.exit(1);
}

fs.renameSync(publicPath, target);
fs.rmSync(privatePath);

console.log(`Eski açık anahtar ${path.relative(config.root, target)} konumuna taşındı.`);
console.log('Eski özel anahtar silindi. Eski belgeler doğrulanmaya devam edecek.');
console.log('Yeni anahtar çifti ilk istekte otomatik üretilecek; ardından belge üretimini yeniden başlatın.');
