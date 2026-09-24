import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const bootstrap = read('server/bootstrap.ts');
const tasksRegistration = read('server/modules/tasks/registration.ts');
const registry = read('src/core/modules/moduleRegistry.ts');
const router = read('src/router.tsx');
const sidebar = read('src/app/shell/ModuleSidebar.tsx');
const overlay = read('src/app/shell/GlobalOverlay.tsx');
const home = read('src/modules/home/HomeModule.tsx');
const settingsManifest = read('src/modules/settings/manifest.ts');
const tasksManifest = read('src/modules/tasks/manifest.ts');
const settingsModule = read('src/modules/settings/SettingsModule.tsx');
const permissions = read('shared/security/permissions.ts');
const serverRegistry = read('server/core/capabilities/serverCapabilityRegistry.ts');

check('server packaged composition includes tasks module', /packagedServerModules[\s\S]*?tasksServerModule/.test(bootstrap));
check('settings manifest no stale admin.manage permission', !settingsManifest.includes('admin.manage'));
check('settings manifest uses settings.read', settingsManifest.includes('settings.read'));
check('tasks manifest route requires only tasks.read', /permissions:\s*\[\s*['"]tasks\.read['"]\s*\]/.test(tasksManifest));
const ownerDefaults = permissions.match(/SINGLE_USER_OWNER_PERMISSIONS\s*=\s*\[([\s\S]*?)\] as const/)?.[1] || '';
check('canonical single-user owner permissions include settings.read', ownerDefaults.includes("'settings.read'"));
check('historical user defaults alias canonical owner permissions', /USER_DEFAULT_PERMISSIONS\s*=\s*SINGLE_USER_OWNER_PERMISSIONS/.test(permissions));
check('registry has permission-aware access helper', /hasAccess\(/.test(registry));
check('registry navigation accepts user context', /getNavigation\([^)]*user/.test(registry));
check('registry widgets accept user context', /getWidgets\([^)]*user/.test(registry));
check('router guard checks module access', /moduleRegistry\.hasAccess\(moduleId,\s*user\)/.test(router));
check('sidebar navigation is filtered by user', /moduleRegistry\.getNavigation\(user\)/.test(sidebar));
check('sidebar refreshes when user changes', /\[user\]/.test(sidebar) || /user\.permissions/.test(sidebar));
check('sidebar role label derives from verified roles', /user\.roles\.includes\('admin'\)[\s\S]*?Quản trị viên[\s\S]*?auditor[\s\S]*?Kiểm toán viên/.test(sidebar));
check('command palette navigation is filtered by user', /moduleRegistry\.getNavigation\(user\)/.test(overlay));
check('home widgets are filtered by user', /moduleRegistry\.getWidgets\(user\)/.test(home));
check('home module quick actions respect module registry status', /moduleRegistry\.isEnabled\(['"]tasks['"]\)/.test(home));
check('settings module gates module manager by module.manage', settingsModule.includes('module.manage'));
check(
  'settings primary UX excludes audit tab',
  settingsModule.includes("type SettingsTab = 'ai-agents' | 'modules'") &&
    !settingsModule.includes('AuditLogTab') &&
    !settingsModule.includes("'audit'"),
);
check('task capabilities are owned by tasks module', /id:\s*['"]system\.tasks\.(?:create|list)['"][\s\S]*?moduleId:\s*['"]tasks['"]/.test(tasksRegistration));
check('server registry enforces disabled module before capability discovery/execution', /moduleSetting[\s\S]*?!moduleSetting\.enabled/.test(serverRegistry));

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}`);
  if (!c.ok) failed++;
}
console.log(`\nStage4A: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
