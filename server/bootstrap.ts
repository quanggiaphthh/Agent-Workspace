import { registerUiCapabilities } from './core/capabilities/uiCapabilities';
import { registerSystemCapabilities } from './core/capabilities/systemCapabilities';
import { serverModuleCatalog } from './core/modules/moduleCatalog';
import { storage } from './infrastructure/storage';

export function bootstrapServer() {
  console.log('[Server Bootstrap] Initializing module catalog...');
  
  // 1. Register Module Metadata in Catalog
  // Core modules are usually registered here if not in their own modules
  
  // 2. Initialize Storage with complete catalog
  storage.initialize(serverModuleCatalog.listAll());

  // 3. Register capabilities
  console.log('[Server Bootstrap] Registering capabilities...');
  registerUiCapabilities();
  registerSystemCapabilities();

  console.log('[Server Bootstrap] System ready.');
}
