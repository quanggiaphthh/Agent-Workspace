import { moduleRegistry } from './core/modules/moduleRegistry';
import { homeManifest } from './modules/home/manifest';
import { settingsManifest } from './modules/settings/manifest';
import { tasksManifest } from './modules/tasks/manifest';
import { auth } from './lib/firebase';

export async function bootstrapClient() {
  console.log('[Client Bootstrap] Initializing module catalog...');

  // Register Core modules
  moduleRegistry.register(homeManifest);
  moduleRegistry.register(settingsManifest);

  // Register Domain modules
  moduleRegistry.register(tasksManifest);

  // Phase 1: Wait for auth before syncing protected data
  await auth.authStateReady();

  // Sync initial state with server
  await moduleRegistry.syncWithServer();

  console.log('[Client Bootstrap] Catalog ready.');
}
