import { registerUiCapabilities } from './core/capabilities/uiCapabilities';
import { registerSystemCapabilities } from './core/capabilities/systemCapabilities';
import { serverModuleCatalog, type ModuleMetadata } from './core/modules/moduleCatalog';
import { storage } from './infrastructure/storage';
import { tasksServerModule } from './modules/tasks/registration';

type PackagedServerModule = {
  metadata: ModuleMetadata;
  registerCapabilities?: () => void;
};

/**
 * Build-time composition of the packaged server modules. The catalog remains
 * the sole metadata authority; this list is only the assembly boundary.
 */
export const packagedServerModules: readonly PackagedServerModule[] = [
  {
    metadata: {
      id: 'home',
      name: 'Home Dashboard',
      enabled: true,
      canDisable: false,
      version: '1.0.0',
    },
  },
  {
    metadata: {
      id: 'settings',
      name: 'Module Manager & Settings',
      enabled: true,
      canDisable: false,
      version: '1.0.0',
    },
  },
  tasksServerModule,
];

export function registerPackagedServerModules(): void {
  packagedServerModules.forEach(({ metadata }) => serverModuleCatalog.register(metadata));
}

export function bootstrapServer() {
  console.log('[Server Bootstrap] Initializing module catalog...');

  // 1. Register the complete packaged composition in the canonical catalog.
  registerPackagedServerModules();

  // 2. Initialize Storage with complete catalog
  storage.initialize(serverModuleCatalog.listAll());

  // 3. Register capabilities
  console.log('[Server Bootstrap] Registering capabilities...');
  registerUiCapabilities();
  registerSystemCapabilities();
  packagedServerModules.forEach(({ registerCapabilities }) => registerCapabilities?.());

  console.log('[Server Bootstrap] System ready.');
}
