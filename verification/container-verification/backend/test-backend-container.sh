#!/usr/bin/env bash
set -euo pipefail
image="${1:?usage: test-backend-container.sh IMAGE}"
docker run --rm --network=none --entrypoint node "$image" --check dist/server.cjs
docker run --rm -i --network=none --entrypoint node "$image" - <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire,isBuiltin} = require('node:module');
const forbidden = ['gen-lang-client-0054211080', 'ai-studio-agentwebapp-ebbd636b-8ff1-41aa-b5eb-3f3599905882'];
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
const all = files('/app/dist');
assert.ok(all.length > 0);
for (const file of all) {
  const text = fs.readFileSync(file).toString('utf8');
  for (const marker of forbidden) assert.equal(text.includes(marker),false,`forbidden config in ${file}`);
}
const server = fs.readFileSync('/app/dist/server.cjs','utf8');
const frontend = all.filter(f => /\/assets\/.*\.js$/.test(f)).map(f => fs.readFileSync(f,'utf8')).join('\n');
assert.ok(frontend.length > 0);
for (const text of [server, frontend]) {
  assert.ok(text.includes('synthetic-staging-project'));
  assert.ok(text.includes('synthetic-staging-db'));
}
const req = createRequire('/app/dist/server.cjs');
const imports = [...new Set([...server.matchAll(/require\("([^"./][^"]*)"\)/g)].map(m => m[1]))];
for (const name of imports) if (!isBuiltin(name)) req.resolve(name);
assert.equal(process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED,'false');
console.log(JSON.stringify({status:'PASS',scope:'backend image artifacts',scannedFiles:all.length,resolvedImports:imports.length,
  syntheticConfigInBothBundles:true,productionConfigAbsent:true,backendStartup:'NOT VERIFIED'}));
JS
