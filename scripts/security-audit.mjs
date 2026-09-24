import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const REVIEW_DEADLINE = Date.parse('2026-10-31T23:59:59Z');
const APPROVED_HIGH_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-xcpc-8h2w-3j85',
  'https://github.com/advisories/GHSA-vwc7-r8mq-g2x9',
  'https://github.com/advisories/GHSA-7q85-xj36-vmfc',
]);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (audit.error) {
  console.error(`SECURITY AUDIT FAIL: unable to run npm audit: ${audit.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout || '{}');
} catch {
  console.error('SECURITY AUDIT FAIL: npm audit did not return valid JSON.');
  if (audit.stderr) console.error(audit.stderr.trim());
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};
const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };
const isHighOrCritical = (severity) => (severityRank[severity] || 0) >= severityRank.high;

function collectRootAdvisories(packageName, seen = new Set()) {
  if (seen.has(packageName)) return [];
  seen.add(packageName);
  const record = vulnerabilities[packageName];
  if (!record) return [];
  const roots = [];
  for (const via of record.via || []) {
    if (typeof via === 'string') {
      roots.push(...collectRootAdvisories(via, seen));
      continue;
    }
    if (via && typeof via === 'object' && isHighOrCritical(via.severity)) roots.push(via);
  }
  return roots;
}

const severeRecords = Object.entries(vulnerabilities)
  .filter(([, record]) => isHighOrCritical(record?.severity));
const failures = [];
let usedTemporaryException = false;

for (const [packageName, record] of severeRecords) {
  if (record.severity === 'critical') {
    failures.push(`${packageName}: critical severity is never allowlisted`);
    continue;
  }

  const roots = collectRootAdvisories(packageName);
  if (roots.length === 0) {
    failures.push(`${packageName}: high severity has no auditable root advisory`);
    continue;
  }

  for (const advisory of roots) {
    const url = String(advisory.url || '');
    if (!APPROVED_HIGH_ADVISORIES.has(url)) {
      failures.push(`${packageName}: unapproved high advisory ${url || advisory.name || advisory.source || 'unknown'}`);
    } else {
      usedTemporaryException = true;
    }
  }
}

if (usedTemporaryException) {
  const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const adkVersion = lock.packages?.['node_modules/@google/adk']?.version;
  const admZip = lock.packages?.['node_modules/adm-zip'];
  const admZipVersion = admZip?.version;
  const admZipAudit = vulnerabilities['adm-zip'];

  if (Date.now() > REVIEW_DEADLINE) failures.push('temporary ADK/adm-zip exception review deadline has expired');
  if (adkVersion !== '2.1.0') failures.push(`temporary exception was reviewed only for @google/adk 2.1.0, found ${adkVersion || 'missing'}`);
  if (admZipVersion !== '0.5.18') failures.push(`temporary exception was reviewed only for adm-zip 0.5.18, found ${admZipVersion || 'missing'}`);
  if (!Array.isArray(admZipAudit?.effects) || !admZipAudit.effects.includes('@google/adk')) {
    failures.push('adm-zip high advisory is not attributable to the reviewed @google/adk dependency path');
  }
}

if (failures.length > 0) {
  console.error('SECURITY AUDIT FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities || {};
if (usedTemporaryException) {
  console.warn('SECURITY AUDIT TEMPORARY EXCEPTION: @google/adk 2.1.0 → adm-zip 0.5.18 high advisories are allowlisted only for the current non-ZIP, non-ADK-skills runtime path.');
  console.warn('Review deadline: 2026-10-31. Any new high/critical advisory fails this gate.');
}
console.log(`SECURITY AUDIT PASS: critical=${counts.critical || 0}, high=${counts.high || 0}, moderate=${counts.moderate || 0}, low=${counts.low || 0}`);
