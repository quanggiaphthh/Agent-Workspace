import type { ModuleManifest } from '../shared/contracts/module';
import { moduleRegistry } from './core/modules/moduleRegistry';
import { homeManifest } from './modules/home/manifest';
import { settingsManifest } from './modules/settings/manifest';
import { tasksManifest } from './modules/tasks/manifest';

/**
 * Build-time composition of the packaged client modules.
 *
 * This is the only place where the client knows which first-party modules
 * ship with the application. LocalModuleRegistry remains the runtime
 * authority for registration, enablement and contributions.
 */
export const packagedClientModules: readonly ModuleManifest[] = [
  homeManifest,
  settingsManifest,
  tasksManifest,
];

export function registerPackagedClientModules(): void {
  packagedClientModules.forEach((manifest) => moduleRegistry.register(manifest));
}
