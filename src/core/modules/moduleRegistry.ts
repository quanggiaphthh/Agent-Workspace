import {
  ModuleManifest,
  NavigationContribution,
  RouteContribution,
  DashboardWidgetContribution,
} from '../../../shared/contracts/module';
import { UserContext } from '../../../shared/contracts/capability';
import { eventBus } from '../events/eventBus';

import { authFetch } from '../../lib/authFetch';

class LocalModuleRegistry {
  private manifests: Map<string, ModuleManifest> = new Map();
  private enabledMap: Map<string, boolean> = new Map();

  public register(manifest: ModuleManifest): void {
    this.manifests.set(manifest.id, manifest);
    if (!this.enabledMap.has(manifest.id)) {
      this.enabledMap.set(manifest.id, true);
    }
    eventBus.emit('module.registered', { moduleId: manifest.id });
  }

  public unregister(moduleId: string): void {
    this.manifests.delete(moduleId);
    this.enabledMap.delete(moduleId);
    eventBus.emit('module.unregistered', { moduleId });
  }

  public reset(): void {
    this.manifests.clear();
    this.enabledMap.clear();
  }

  public enable(moduleId: string): void {
    const manifest = this.manifests.get(moduleId);
    if (manifest) {
      this.enabledMap.set(moduleId, true);
      manifest.lifecycle?.onEnable?.();
      eventBus.emit('module.statusChanged', { moduleId, enabled: true });
    }
  }

  public disable(moduleId: string): void {
    if (moduleId === 'home' || moduleId === 'settings') {
      console.warn(`Core module "${moduleId}" cannot be disabled.`);
      return;
    }
    const manifest = this.manifests.get(moduleId);
    if (manifest) {
      this.enabledMap.set(moduleId, false);
      manifest.lifecycle?.onDisable?.();
      eventBus.emit('module.statusChanged', { moduleId, enabled: false });
    }
  }

  public isEnabled(moduleId: string): boolean {
    return this.enabledMap.get(moduleId) ?? false;
  }

  public getPrimaryRoute(moduleId: string): string {
    const manifest = this.manifests.get(moduleId);
    if (!manifest) return '/';
    // If there are specific routes, pick the first one marked as primary or just the first one
    if (manifest.routes && manifest.routes.length > 0) {
      return manifest.routes[0].path;
    }
    // Fallback if no routes defined
    return '/';
  }

  public resolveModuleByPath(pathname: string): string {
    // Exact match first
    const routes = this.getRoutes();
    const match = routes.find(r => r.path === pathname || (r.path !== '/' && pathname.startsWith(r.path)));
    
    if (match) {
      // Find which module this route belongs to
      for (const mod of this.listAll()) {
        if (mod.routes?.some(r => r.path === match.path)) {
          return mod.id;
        }
      }
    }
    
    return 'home';
  }

  public resolve(moduleId: string): ModuleManifest | undefined {
    return this.manifests.get(moduleId);
  }

  public listAll(): ModuleManifest[] {
    return Array.from(this.manifests.values()).sort(
      (a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99)
    );
  }

  public listEnabled(): ModuleManifest[] {
    return this.listAll().filter(m => this.isEnabled(m.id));
  }

  public hasAccess(moduleId: string, user?: UserContext): boolean {
    const manifest = this.manifests.get(moduleId);
    if (!manifest) return false;
    if (!user) return true;
    if (user.roles.includes('admin')) return true;
    const required = manifest.permissions || [];
    return required.every(permission => user.permissions.includes(permission));
  }

  public listEnabledFor(user?: UserContext): ModuleManifest[] {
    return this.listEnabled().filter(module => this.hasAccess(module.id, user));
  }

  public getNavigation(user?: UserContext): NavigationContribution[] {
    const navItems: NavigationContribution[] = [];
    for (const mod of this.listEnabledFor(user)) {
      if (mod.navigation) {
        navItems.push(...mod.navigation);
      }
    }
    return navItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  public getRoutes(user?: UserContext): RouteContribution[] {
    const routes: RouteContribution[] = [];
    for (const mod of this.listEnabledFor(user)) {
      if (mod.routes) {
        routes.push(...mod.routes);
      }
    }
    return routes;
  }

  public getWidgets(user?: UserContext): DashboardWidgetContribution[] {
    const widgets: DashboardWidgetContribution[] = [];
    for (const mod of this.listEnabledFor(user)) {
      if (mod.widgets) {
        widgets.push(...mod.widgets);
      }
    }
    return widgets.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  public async syncWithServer(): Promise<void> {
    try {
      const res = await authFetch('/api/modules');
      if (res.ok) {
        const list: Array<{ id: string; enabled: boolean }> = await res.json();
        list.forEach(item => {
          if (this.manifests.has(item.id)) {
            this.enabledMap.set(item.id, item.enabled);
          }
        });
        eventBus.emit('modules.synced', {});
      }
    } catch (err) {
      console.warn('Could not sync module state with server:', err);
    }
  }
}

export const moduleRegistry = new LocalModuleRegistry();
