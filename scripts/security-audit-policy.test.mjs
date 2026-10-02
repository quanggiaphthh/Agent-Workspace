import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { isTemporaryFirebaseGrpcException, isValidAuditResult } from './security-audit-policy.mjs';

const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const url = 'https://github.com/advisories/GHSA-m9gg-hp2v-232j';
const grpcPath = 'node_modules/@firebase/firestore/node_modules/@grpc/grpc-js';
const chain = () => ({
  '@grpc/grpc-js': { severity: 'high', nodes: [grpcPath], effects: ['@firebase/firestore'], via: [{ url, name: '@grpc/grpc-js', severity: 'high' }] },
  '@firebase/firestore': { severity: 'high', nodes: ['node_modules/@firebase/firestore'], effects: ['@firebase/firestore-compat', 'firebase'], via: ['@grpc/grpc-js'] },
  '@firebase/firestore-compat': { severity: 'high', nodes: ['node_modules/@firebase/firestore-compat'], effects: ['firebase'], via: ['@firebase/firestore'] },
  firebase: { severity: 'high', nodes: ['node_modules/firebase'], effects: [], via: ['@firebase/firestore', '@firebase/firestore-compat'] },
});
const advisory = { url, name: '@grpc/grpc-js', severity: 'high' };
const beforeExpiry = new Date('2026-10-01T00:00:00Z');
const check = (packageName, vulnerabilities = chain(), resolvedLock = lock, rootAdvisory = advisory, now = beforeExpiry) =>
  isTemporaryFirebaseGrpcException(packageName, rootAdvisory, vulnerabilities, resolvedLock, now);

describe('time-boxed Firebase gRPC risk exception', () => {
  it('fails closed on an npm audit error or missing vulnerability inventory', () => {
    expect(isValidAuditResult({ error: { code: 'ENOAUDIT' }, vulnerabilities: {}, metadata: { vulnerabilities: {} } })).toBe(false);
    expect(isValidAuditResult({})).toBe(false);
    expect(isValidAuditResult({ vulnerabilities: chain(), metadata: { vulnerabilities: { high: 4 } } })).toBe(true);
  });
  it('allows only the four records in the verified inherited chain', () => {
    for (const name of ['@grpc/grpc-js', '@firebase/firestore', '@firebase/firestore-compat', 'firebase']) {
      expect(check(name)).toBe(true);
    }
    expect(check('@google/adk')).toBe(false);
  });

  it('accepts the same locked chain when npm omits the compat effects edge', () => {
    const withoutCompatEffect = chain();
    withoutCompatEffect['@firebase/firestore-compat'].effects = [];
    for (const name of ['@grpc/grpc-js', '@firebase/firestore', '@firebase/firestore-compat', 'firebase']) {
      expect(check(name, withoutCompatEffect)).toBe(true);
    }
    const unrelatedEffect = structuredClone(withoutCompatEffect);
    unrelatedEffect['@firebase/firestore-compat'].effects = ['@google/adk'];
    expect(check('firebase', unrelatedEffect)).toBe(false);
  });

  it('rejects a different advisory or a forged root package', () => {
    expect(check('firebase', chain(), lock, { ...advisory, url: 'https://github.com/advisories/GHSA-other' })).toBe(false);
    expect(check('firebase', chain(), lock, { ...advisory, name: 'adm-zip' })).toBe(false);
  });

  it('rejects the same GHSA when an extra dependency path is reported', () => {
    const affected = chain();
    affected['@grpc/grpc-js'].nodes.push('node_modules/@google/adk/node_modules/@grpc/grpc-js');
    expect(check('firebase', affected)).toBe(false);
    const inherited = chain();
    inherited['@grpc/grpc-js'].effects.push('@google/adk');
    expect(check('@firebase/firestore', inherited)).toBe(false);
    const duplicatedVia = chain();
    duplicatedVia.firebase.via = ['@firebase/firestore', '@firebase/firestore'];
    expect(check('firebase', duplicatedVia)).toBe(false);
    const duplicatedEffects = chain();
    duplicatedEffects['@firebase/firestore'].effects = ['firebase', 'firebase'];
    expect(check('firebase', duplicatedEffects)).toBe(false);
  });

  it('rejects a changed version, declared dependency, or inherited path', () => {
    const changedVersion = structuredClone(lock);
    changedVersion.packages[grpcPath].version = '1.9.17';
    expect(check('firebase', chain(), changedVersion)).toBe(false);
    const changedParent = structuredClone(lock);
    changedParent.packages['node_modules/@firebase/firestore'].dependencies['@grpc/grpc-js'] = '^1.14.5';
    expect(check('firebase', chain(), changedParent)).toBe(false);
    const inherited = chain();
    inherited.firebase.via = ['@firebase/firestore'];
    expect(check('firebase', inherited)).toBe(false);
  });

  it('expires immediately after the approved review date', () => {
    expect(check('firebase', chain(), lock, advisory, new Date('2026-10-31T00:00:00Z'))).toBe(true);
    expect(check('firebase', chain(), lock, advisory, new Date('2026-10-31T23:59:59Z'))).toBe(true);
    expect(check('firebase', chain(), lock, advisory, new Date('2026-11-01T00:00:00Z'))).toBe(false);
    expect(check('firebase', chain(), lock, advisory, new Date('invalid'))).toBe(false);
  });
});
