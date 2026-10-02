const FIREBASE_GRPC_ADVISORY = 'https://github.com/advisories/GHSA-m9gg-hp2v-232j';
const FIREBASE_GRPC_REVIEW_DEADLINE = Date.parse('2026-10-31T23:59:59Z');
const GRPC_PATH = 'node_modules/@firebase/firestore/node_modules/@grpc/grpc-js';
const EXPECTED = {
  '@grpc/grpc-js': { nodes: [GRPC_PATH], effects: ['@firebase/firestore'], via: null },
  '@firebase/firestore': { nodes: ['node_modules/@firebase/firestore'], effects: ['@firebase/firestore-compat', 'firebase'], via: ['@grpc/grpc-js'] },
  '@firebase/firestore-compat': { nodes: ['node_modules/@firebase/firestore-compat'], effects: ['firebase'], via: ['@firebase/firestore'] },
  firebase: { nodes: ['node_modules/firebase'], effects: [], via: ['@firebase/firestore', '@firebase/firestore-compat'] },
};

export function isValidAuditResult(report) {
  return Boolean(report && !report.error && report.vulnerabilities && typeof report.vulnerabilities === 'object'
    && !Array.isArray(report.vulnerabilities) && report.metadata?.vulnerabilities
    && typeof report.metadata.vulnerabilities === 'object');
}

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === expected.length
    && actual.every((value) => typeof value === 'string' && expected.includes(value));
}

/**
 * Temporary risk acceptance, not a vulnerability fix. Firebase's stable
 * Firestore client still pins the affected ~1.9.0 Node gRPC line. This app
 * imports Firestore only in its browser client and does not use gRPC server
 * getAuthContext for authentication. An override exceeds Firestore's declared
 * range without compatibility evidence. Recheck on any Firebase/Firestore
 * release changing this graph, or by 2026-10-31, whichever comes first.
 */
export function isTemporaryFirebaseGrpcException(packageName, advisory, vulnerabilities, lock, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || now.getTime() > FIREBASE_GRPC_REVIEW_DEADLINE || advisory?.url !== FIREBASE_GRPC_ADVISORY
    || advisory.name !== '@grpc/grpc-js' || advisory.severity !== 'high' || !Object.hasOwn(EXPECTED, packageName)) return false;

  const packages = lock?.packages;
  if (packages?.['node_modules/firebase']?.version !== '12.19.0'
    || packages['node_modules/firebase'].dependencies?.['@firebase/firestore'] !== '4.17.2'
    || packages['node_modules/firebase'].dependencies?.['@firebase/firestore-compat'] !== '0.4.14'
    || packages['node_modules/@firebase/firestore']?.version !== '4.17.2'
    || packages['node_modules/@firebase/firestore'].dependencies?.['@grpc/grpc-js'] !== '~1.9.0'
    || packages['node_modules/@firebase/firestore-compat']?.version !== '0.4.14'
    || packages['node_modules/@firebase/firestore-compat'].dependencies?.['@firebase/firestore'] !== '4.17.2'
    || packages[GRPC_PATH]?.version !== '1.9.16') return false;

  const affectedGrpcCopies = Object.entries(packages)
    .filter(([path, entry]) => path.endsWith('node_modules/@grpc/grpc-js') && entry?.version === '1.9.16')
    .map(([path]) => path);
  if (!sameMembers(affectedGrpcCopies, [GRPC_PATH])) return false;

  return Object.entries(EXPECTED).every(([name, expected]) => {
    const record = vulnerabilities?.[name];
    return record?.severity === 'high' && sameMembers(record.nodes, expected.nodes)
      // npm audit has returned both shapes for this same pinned compat path.
      && (sameMembers(record.effects, expected.effects)
        || (name === '@firebase/firestore-compat' && sameMembers(record.effects, [])))
      && (expected.via ? sameMembers(record.via, expected.via)
        : record.via?.some((via) => typeof via === 'object' && via.url === FIREBASE_GRPC_ADVISORY
          && via.name === '@grpc/grpc-js' && via.severity === 'high'));
  });
}
