// Auditoría de solo lectura: detecta docs de kiter_vip y mp_email de usuarios cuyo email
// no está normalizado (mayúsculas o espacios). No escribe nada en Firestore.
//
// Uso (PowerShell):
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"; node scripts/audit-vip-emails.mjs

import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const normalize = (email) => email.trim().toLowerCase();
const toDocId = (email) => email.replace(/[.#$[\]@]/g, '_');

const vipSnap = await db.collection('kiter_vip').get();
const byNormalizedId = new Map();
const issues = [];

for (const d of vipSnap.docs) {
    const v = d.data();
    const problems = [];
    if (d.id !== d.id.trim().toLowerCase()) problems.push('ID con mayúsculas/espacios');
    if (v.email && v.email !== normalize(v.email)) problems.push('campo email sin normalizar');
    if (v.email && toDocId(normalize(v.email)) !== d.id) problems.push(`ID no coincide con email normalizado (${toDocId(normalize(v.email))})`);

    const key = v.email ? toDocId(normalize(v.email)) : d.id.toLowerCase();
    byNormalizedId.set(key, [...(byNormalizedId.get(key) || []), d.id]);

    if (problems.length) issues.push({ id: d.id, email: v.email ?? null, active: v.active ?? null, status: v.status ?? null, manual: v.manual ?? false, problems: problems.join('; ') });
}

const collisions = [...byNormalizedId.entries()].filter(([, ids]) => ids.length > 1);

const usuariosSnap = await db.collection('usuarios').where('mp_email', '!=', null).get();
const mpEmailIssues = usuariosSnap.docs
    .filter(d => typeof d.data().mp_email === 'string' && d.data().mp_email !== normalize(d.data().mp_email))
    .map(d => ({ uid: d.id, mp_email: d.data().mp_email }));

console.log(`\nkiter_vip: ${vipSnap.size} docs, ${issues.length} con problemas`);
if (issues.length) console.table(issues);

console.log(`\nColisiones (docs distintos que normalizan al mismo email): ${collisions.length}`);
for (const [key, ids] of collisions) console.log(`  ${key} <- ${ids.join(', ')}`);

console.log(`\nusuarios con mp_email sin normalizar: ${mpEmailIssues.length}`);
if (mpEmailIssues.length) console.table(mpEmailIssues);
