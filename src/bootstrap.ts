import { moduleRegistry } from './core/modules/moduleRegistry';
import { registerPackagedClientModules } from './moduleComposition';
import { auth } from './lib/firebase';

export async function bootstrapClient() {
  console.log('[Client Bootstrap] Initializing module catalog...');

  registerPackagedClientModules();

  // Phase 1: Wait for auth before syncing protected data
  await auth.authStateReady();

  // Sync initial state with server if user is logged in
  if (auth.currentUser) {
    await moduleRegistry.syncWithServer();
  }

  console.log('[Client Bootstrap] Catalog ready.');
}
