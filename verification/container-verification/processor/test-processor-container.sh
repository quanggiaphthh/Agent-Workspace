#!/usr/bin/env bash
set -euo pipefail
image="${1:?usage: test-processor-container.sh IMAGE PROCESSOR_SOURCE}"
source_dir="${2:?processor source directory required}"
name="docfmt-verification-${RANDOM}-${RANDOM}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --detach --name "$name" --memory=1g --cpus=1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=268435456,mode=1777 \
  -p 127.0.0.1::8080 \
  -e DOCUMENT_PROCESSOR_SHARED_TOKEN=synthetic-local-only-token-with-more-than-32-bytes \
  "$image" >/dev/null
port="$(docker port "$name" 8080/tcp | awk -F: '{print $NF}')"
python3 - "$port" "$name" "$source_dir" <<'PY'
import hashlib, http.client, io, json, socket, subprocess, sys, time, zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

port, container, source_dir = sys.argv[1:]
base = 'http://127.0.0.1:' + port
token = 'synthetic-local-only-token-with-more-than-32-bytes'
mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
fixture = Path(source_dir) / 'v22-runtime/fixtures/docx/23-direct-alignment.docx'
source = fixture.read_bytes()
digest = lambda b: hashlib.sha256(b).hexdigest()
source_hash = digest(source)

def request(path, data=None, auth=token):
    headers = {} if auth is None else {'Authorization': 'Bearer ' + auth}
    if data is not None:
        headers['Content-Type'] = mime
    try:
        with urlopen(Request(base + path, data=data, headers=headers), timeout=45) as res:
            return res.status, res.headers, res.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()

def workspaces():
    value = subprocess.check_output(['docker','exec',container,'find','/tmp','-maxdepth','1','-type','d','-name','docx-*'], text=True)
    return value.strip()

def wait_clean():
    for _ in range(100):
        if not workspaces(): return
        time.sleep(.05)
    raise AssertionError('temporary workspace remains')

for _ in range(120):
    try:
        status, _, body = request('/health', auth=None)
        break
    except (URLError, TimeoutError, ConnectionError, socket.timeout):
        time.sleep(.25)
else:
    raise AssertionError('container did not become reachable')
assert status == 401
assert request('/health', auth='wrong-token')[0] == 401
status, _, body = request('/health')
assert status == 200 and json.loads(body)['status'] == 'ok'
status, _, body = request('/inspect', b'not a DOCX')
assert status == 422 and json.loads(body)['code'] == 'MALFORMED_DOCX'
wait_clean()
status, _, body = request('/inspect', source)
inspection = json.loads(body)
assert status == 200 and inspection['safeToMutate'] and inspection['packagePolicy'] == 'NORMAL'
assert inspection['sourceSha256'] == source_hash
target = next(p for p in inspection['paragraphs'] if p['directAlignment'] in ['LEFT','CENTER','RIGHT','JUSTIFY'])
before = target['directAlignment']
after = 'LEFT' if before == 'CENTER' else 'CENTER'
query = urlencode(dict(sourceSha256=source_hash, paragraphId=target['paragraphId'], expectedBefore=before, desiredAfter=after))
status, headers, output = request('/apply?' + query, source)
assert status == 200 and headers.get_content_type() == mime
assert headers['X-Output-SHA256'].lower() == digest(output)
assert headers['X-Document-Reopened'] == 'true' and headers['X-Document-Revalidated'] == 'true'
with zipfile.ZipFile(io.BytesIO(output)) as package:
    assert package.testzip() is None and 'word/document.xml' in package.namelist()
status, _, body = request('/inspect', output)
reopened = json.loads(body)
assert status == 200 and reopened['sourceSha256'] == digest(output) and reopened['safeToMutate']
assert next(p for p in reopened['paragraphs'] if p['paragraphId'] == target['paragraphId'])['directAlignment'] == after
assert digest(fixture.read_bytes()) == source_hash
wait_clean()

# Hold an unfinished upload to ensure the first request owns the same host's gate.
held = http.client.HTTPConnection('127.0.0.1',int(port),timeout=5)
try:
    held.putrequest('POST','/inspect')
    held.putheader('Authorization','Bearer ' + token)
    held.putheader('Content-Type',mime)
    held.putheader('Content-Length','1024')
    held.endheaders()
    held.send(b'PK\x03\x04')
    for _ in range(100):
        if workspaces(): break
        time.sleep(.05)
    else: raise AssertionError('held upload did not enter processor')
    status, _, body = request('/inspect', source)
    assert status == 429 and json.loads(body)['code'] == 'PROCESSOR_BUSY'
finally:
    held.close()
wait_clean()
print(json.dumps(dict(status='PASS',scope='processor container loopback',auth=True,
    inspectApplyReinspect=True,digest=True,sourceUnchanged=True,packageReopened=True,
    busy429=True,cleanupAfterDisconnect=True,cloudRunIAM='NOT VERIFIED')))
PY
