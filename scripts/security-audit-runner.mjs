import { spawnSync as nodeSpawnSync } from 'node:child_process';

const NPM_AUDIT_ARGS = ['audit', '--omit=dev', '--json'];

export function runNpmAudit({
  platform = process.platform,
  spawnSync = nodeSpawnSync,
} = {}) {
  return spawnSync('npm', NPM_AUDIT_ARGS, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...(platform === 'win32' ? { shell: true } : {}),
  });
}
