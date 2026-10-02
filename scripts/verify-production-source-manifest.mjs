import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function isSafeManifestPath(relativePath) {
  if (!relativePath || relativePath.includes('\\') || relativePath.includes(':')) return false;
  if (/[\u0000-\u001f\u007f]/.test(relativePath)) return false;
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return false;
  return !relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function runGit(args, { cwd, input, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: null,
    input,
    maxBuffer,
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`git ${args[0]} could not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8').trim() : '';
    throw new Error(`git ${args[0]} failed${stderr ? `: ${stderr}` : ''}`);
  }

  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
}

function readHeadBlob(repositoryRoot, relativePath) {
  const treeEntry = runGit(
    ['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', 'HEAD', '--', relativePath],
    { cwd: repositoryRoot },
  );
  const records = treeEntry.toString('utf8').split('\0').filter(Boolean);
  if (records.length !== 1) {
    throw new Error(records.length === 0 ? 'path is not present in HEAD' : 'path resolves to multiple HEAD entries');
  }

  const separatorIndex = records[0].indexOf('\t');
  if (separatorIndex < 0) throw new Error('HEAD entry is malformed');

  const [mode, type, objectId] = records[0].slice(0, separatorIndex).split(' ');
  const actualPath = records[0].slice(separatorIndex + 1);
  if (
    actualPath !== relativePath
    || !['100644', '100755'].includes(mode)
    || type !== 'blob'
    || !/^[a-f\d]{40,64}$/i.test(objectId ?? '')
  ) {
    throw new Error('path is not a canonical file blob in HEAD');
  }

  return runGit(['cat-file', 'blob', objectId], { cwd: repositoryRoot });
}

function assertGitDiffClean(repositoryRoot, args, changeKind) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: null,
    windowsHide: true,
  });

  if (result.error) throw new Error(`git diff could not run: ${result.error.message}`);
  if (result.status === 1) throw new Error(`protected path has ${changeKind} changes`);
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8').trim() : '';
    throw new Error(`git diff failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function assertNoWorkingTreeChanges(repositoryRoot, relativePath) {
  assertGitDiffClean(
    repositoryRoot,
    ['--literal-pathspecs', 'diff', '--quiet', '--', relativePath],
    'unstaged',
  );
  assertGitDiffClean(
    repositoryRoot,
    ['--literal-pathspecs', 'diff', '--cached', '--quiet', 'HEAD', '--', relativePath],
    'staged',
  );

  const indexEntries = runGit(
    ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', relativePath],
    { cwd: repositoryRoot },
  ).toString('utf8').split('\0').filter(Boolean);
  if (indexEntries.length !== 1) {
    throw new Error(indexEntries.length === 0 ? 'path is not present in the Git index' : 'path has multiple index stages');
  }

  const separatorIndex = indexEntries[0].indexOf('\t');
  if (separatorIndex < 0) throw new Error('Git index entry is malformed');
  const [mode, objectId, stage] = indexEntries[0].slice(0, separatorIndex).split(' ');
  const actualPath = indexEntries[0].slice(separatorIndex + 1);
  if (
    actualPath !== relativePath
    || !['100644', '100755'].includes(mode)
    || stage !== '0'
    || !/^[a-f\d]{40,64}$/i.test(objectId ?? '')
  ) {
    throw new Error('path is not a regular stage-0 file in the Git index');
  }

  // Hash the bytes directly as Git would clean this path; this still catches edits hidden by index flags.
  const workingTreePath = path.resolve(repositoryRoot, ...relativePath.split('/'));
  const workingTreeBytes = fs.readFileSync(workingTreePath);
  const workingTreeObjectId = runGit(
    ['hash-object', `--path=${relativePath}`, '--stdin'],
    { cwd: repositoryRoot, input: workingTreeBytes },
  ).toString('ascii').trim();
  if (!/^[a-f\d]{40,64}$/i.test(workingTreeObjectId) || workingTreeObjectId !== objectId) {
    throw new Error('protected path has unstaged changes');
  }
}

export function verifyProductionManifest(
  manifestText,
  {
    root = fileURLToPath(new URL('../', import.meta.url)),
  } = {},
) {
  const repositoryRoot = path.resolve(root);
  const failures = [];
  const lines = String(manifestText).replace(/\r\n?/g, '\n').split('\n');
  const entries = lines.filter((line) => line.length > 0);

  if (entries.length === 0) {
    failures.push({ line: 0, path: null, reason: 'manifest has no entries' });
  }

  let checkedFiles = 0;
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) continue;
    const match = /^([a-f\d]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line: index + 1, path: null, reason: 'invalid manifest entry' });
      continue;
    }

    const [, expectedDigest, relativePath] = match;
    if (!isSafeManifestPath(relativePath)) {
      failures.push({ line: index + 1, path: relativePath, reason: 'path is not a safe repository-relative path' });
      continue;
    }

    checkedFiles += 1;
    try {
      assertNoWorkingTreeChanges(repositoryRoot, relativePath);
      const canonicalBytes = readHeadBlob(repositoryRoot, relativePath);
      const actualDigest = createHash('sha256').update(canonicalBytes).digest('hex');
      if (actualDigest !== expectedDigest.toLowerCase()) {
        failures.push({ line: index + 1, path: relativePath, reason: 'SHA-256 mismatch against HEAD blob' });
      }
    } catch (error) {
      failures.push({ line: index + 1, path: relativePath, reason: `Git verification failed: ${error.message}` });
    }
  }

  return { checkedFiles, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const manifestText = fs.readFileSync(path.join(repositoryRoot, 'PRODUCTION_SOURCE_MANIFEST.sha256'), 'utf8');
  const result = verifyProductionManifest(manifestText, { root: repositoryRoot });

  for (const failure of result.failures) {
    const location = failure.path ? `${failure.path}: ` : '';
    console.error(`FAIL ${location}${failure.reason}`);
  }

  if (result.failures.length > 0) {
    console.error(`Production source manifest FAIL: ${result.checkedFiles} files checked, ${result.failures.length} failures.`);
    process.exitCode = 1;
  } else {
    console.log(`Production source manifest PASS: ${result.checkedFiles} files verified.`);
  }
}
