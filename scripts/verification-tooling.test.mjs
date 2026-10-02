import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runNpmAudit } from './security-audit-runner.mjs';
import { hasFailClosedTaskAndMemoryRules } from './qa-stage2-rules.mjs';
import { verifyProductionManifest } from './verify-production-source-manifest.mjs';

describe('Stage 2 Firestore deny rule portability', () => {
  const rules = [
    'match /agent_memories/{id} {',
    '      allow read, write: if false;',
    '}',
    'match /agent_tasks/{id} {',
    '      allow read, write: if false;',
    '}',
  ].join('\n');

  it('applies the same fail-closed assertions to LF and CRLF rule text', () => {
    expect(hasFailClosedTaskAndMemoryRules(rules)).toBe(true);
    expect(hasFailClosedTaskAndMemoryRules(rules.replace(/\n/g, '\r\n'))).toBe(true);
  });
});

describe('Windows-safe production security audit launcher', () => {
  it('uses fixed npm audit arguments and a shell only on Windows', () => {
    expect(runNpmAudit).toBeTypeOf('function');
    if (typeof runNpmAudit !== 'function') return;

    const calls = [];
    const expectedResult = { status: 1, stdout: '{"audit":"json"}', stderr: '' };
    const result = runNpmAudit({
      platform: 'win32',
      spawnSync: (...args) => {
        calls.push(args);
        return expectedResult;
      },
    });

    expect(result).toBe(expectedResult);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('npm');
    expect(calls[0][1]).toEqual(['audit', '--omit=dev', '--json']);
    expect(calls[0][2]).toEqual({
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: true,
    });
  });

  it('keeps direct npm execution on Unix and preserves non-zero audit output', () => {
    expect(runNpmAudit).toBeTypeOf('function');
    if (typeof runNpmAudit !== 'function') return;

    const calls = [];
    const expectedResult = { status: 1, stdout: '{"audit":"json"}', stderr: '' };
    const result = runNpmAudit({
      platform: 'linux',
      spawnSync: (...args) => {
        calls.push(args);
        return expectedResult;
      },
    });

    expect(result).toBe(expectedResult);
    expect(calls[0][0]).toBe('npm');
    expect(calls[0][1]).toEqual(['audit', '--omit=dev', '--json']);
    expect(calls[0][2]).toEqual({ encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  });
});

describe('cross-platform production source manifest verification', () => {
  const relativePath = 'src/example.ts';
  const source = Buffer.from('export const answer = 42;\n', 'utf8');
  let root;
  let sourcePath;
  let baselineCommit;

  function runGit(root, args) {
    const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${Buffer.from(result.stderr ?? '').toString('utf8')}`);
    }
    return Buffer.from(result.stdout ?? '');
  }

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manifest-verifier-'));
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.name', 'Manifest Test']);
    runGit(root, ['config', 'user.email', 'manifest-test@example.invalid']);
    runGit(root, ['config', 'core.autocrlf', 'false']);

    sourcePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, source);
    runGit(root, ['add', '--', relativePath]);
    runGit(root, ['commit', '--quiet', '-m', 'canonical baseline']);
    baselineCommit = runGit(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  }, 20_000);

  function manifestFor(bytes) {
    const digest = createHash('sha256').update(bytes).digest('hex');
    return `${digest}  ${relativePath}\n`;
  }

  beforeEach(() => {
    runGit(root, ['update-index', '--no-assume-unchanged', '--no-skip-worktree', '--', relativePath]);
    runGit(root, ['config', 'core.autocrlf', 'false']);
    runGit(root, ['reset', '--hard', baselineCommit]);
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('accepts an unchanged LF checkout on Windows and Unix', () => {
    expect(fs.readFileSync(sourcePath)).toEqual(source);

    expect(verifyProductionManifest(manifestFor(source), { root })).toEqual({ checkedFiles: 1, failures: [] });
  });

  it('accepts core.autocrlf=true CRLF worktree bytes for an unchanged LF HEAD blob', () => {
    runGit(root, ['config', 'core.autocrlf', 'true']);
    const crlfSource = Buffer.from(source.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    fs.writeFileSync(sourcePath, crlfSource);
    expect(fs.readFileSync(sourcePath)).toEqual(crlfSource);
    expect(verifyProductionManifest(manifestFor(source), { root })).toEqual({ checkedFiles: 1, failures: [] });
  });

  it('rejects a committed canonical content change against the old manifest', () => {
    const changedSource = Buffer.from('export const answer = 43;\n', 'utf8');
    fs.writeFileSync(sourcePath, changedSource);
    runGit(root, ['add', '--', relativePath]);
    runGit(root, ['commit', '--quiet', '-m', 'change canonical content']);

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe('SHA-256 mismatch against HEAD blob');
  });

  it('rejects a committed EOL-only canonical change against the old manifest', () => {
    const crlfSource = Buffer.from(source.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    fs.writeFileSync(sourcePath, crlfSource);
    runGit(root, ['add', '--', relativePath]);
    runGit(root, ['commit', '--quiet', '-m', 'change canonical line endings']);
    expect(runGit(root, ['show', `HEAD:${relativePath}`])).toEqual(crlfSource);

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe('SHA-256 mismatch against HEAD blob');
  });

  it('rejects staged protected changes when the worktree matches the staged content', () => {
    fs.writeFileSync(sourcePath, Buffer.from('export const answer = 99;\n', 'utf8'));
    runGit(root, ['add', '--', relativePath]);

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('staged changes');
  });

  it('rejects a staged index change when the worktree is restored to HEAD bytes', () => {
    fs.writeFileSync(sourcePath, Buffer.from('export const answer = 99;\n', 'utf8'));
    runGit(root, ['add', '--', relativePath]);
    fs.writeFileSync(sourcePath, source);

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('changes');
  });

  it('rejects unstaged protected changes', () => {
    fs.writeFileSync(sourcePath, Buffer.from('export const answer = 99;\n', 'utf8'));

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('unstaged changes');
  });

  it.each([
    ['assume-unchanged', ['--assume-unchanged']],
    ['skip-worktree', ['--skip-worktree']],
  ])('rejects protected edits hidden by %s', (_flagName, flag) => {
    runGit(root, ['update-index', ...flag, '--', relativePath]);
    fs.writeFileSync(sourcePath, Buffer.from('export const answer = 99;\n', 'utf8'));

    const result = verifyProductionManifest(manifestFor(source), { root });
    expect(result.checkedFiles).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('unstaged changes');
  });

  it('fails closed for unsafe and missing paths', () => {
    const unsafe = verifyProductionManifest(`${manifestFor(source).trimEnd().slice(0, 64)}  ../outside.ts\n`, { root });
    expect(unsafe.checkedFiles).toBe(0);
    expect(unsafe.failures).toHaveLength(1);

    const missingPath = 'src/missing.ts';
    const missing = verifyProductionManifest(`${manifestFor(source).slice(0, 64)}  ${missingPath}\n`, { root });
    expect(missing.checkedFiles).toBe(1);
    expect(missing.failures).toHaveLength(1);
    expect(missing.failures[0].reason).toContain('path is not present in the Git index');
  });
});
