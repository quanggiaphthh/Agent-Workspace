import {
  ModuleManifest,
  NavigationContribution,
  RouteContribution,
  DashboardWidgetContribution,
  AgentSuggestionContribution,
} from '../../../shared/contracts/module';
import { UserContext } from '../../../shared/contracts/capability';
import { eventBus } from '../events/eventBus';
import { authFetch } from '../../lib/authFetch';

class LocalModuleRegistry {
  private manifests: Map<string, ModuleManifest> = new Map();
  private enabledMap: Map<string, boolean> = new Map();

  public register(manifest: ModuleManifest): void {
    this.manifests.set(manifest.id, manifest);
    if (!this.enabledMap.has(manifest.id)) this.enabledMap.set(manifest.id, true);
    eventBus.emit('module.registered', { moduleId: manifest.id });
  }

  public unregister(moduleId: string): void {
    this.manifests.delete(moduleId);
    this.enabledMap.delete(moduleId);
    eventBus.emit('module.unregistered', { moduleId });
  }

  public reset(): void { this.manifests.clear(); this.enabledMap.clear(); }
  public async enable(moduleId: string, persist?: () => Promise<void>): Promise<void> { return this.setEnabled(moduleId, true, persist); }
  public async disable(moduleId: string, persist?: () => Promise<void>): Promise<void> { return this.setEnabled(moduleId, false, persist); }

  public async setEnabled(moduleId: string, enabled: boolean, persist?: () => Promise<void>): Promise<void> {
    if (!enabled && (moduleId === 'home' || moduleId === 'settings')) {
      console.warn(`Core module "${moduleId}" cannot be disabled.`);
      return;
    }
    const manifest = this.manifests.get(moduleId);
    if (!manifest || this.isEnabled(moduleId) === enabled) return;
    const lifecycle = enabled ? manifest.lifecycle?.onEnable : manifest.lifecycle?.onDisable;
    await lifecycle?.();
    await persist?.();
    this.enabledMap.set(moduleId, enabled);
    eventBus.emit('module.statusChanged', { moduleId, enabled });
  }

  public isEnabled(moduleId: string): boolean { return this.enabledMap.get(moduleId) ?? false; }

  public getPrimaryRoute(moduleId: string): string {
    const manifest = this.manifests.get(moduleId);
    return manifest?.routes?.[0]?.path || '/';
  }

  public resolveModuleByPath(pathname: string): string {
    const routes = this.getRoutes();
    const match = routes.find(r => r.path === pathname || (r.path !== '/' && pathname.startsWith(r.path)));
    if (match) {
      for (const mod of this.listAll()) {
        if (mod.routes?.some(r => r.path === match.path)) return mod.id;
      }
    }
    return 'home';
  }

  public resolve(moduleId: string): ModuleManifest | undefined { return this.manifests.get(moduleId); }
  public listAll(): ModuleManifest[] { return Array.from(this.manifests.values()).sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99)); }
  public listEnabled(): ModuleManifest[] { return this.listAll().filter(m => this.isEnabled(m.id)); }

  public hasAccess(moduleId: string, user?: UserContext): boolean {
    const manifest = this.manifests.get(moduleId);
    if (!manifest) return false;
    if (!user) return true;
    if (user.roles.includes('admin')) return true;
    return (manifest.permissions || []).every(permission => user.permissions.includes(permission));
  }

  public listEnabledFor(user?: UserContext): ModuleManifest[] { return this.listEnabled().filter(module => this.hasAccess(module.id, user)); }

  public getNavigation(user?: UserContext): NavigationContribution[] {
    return this.listEnabledFor(user).flatMap(mod => mod.navigation || []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  public getRoutes(user?: UserContext): RouteContribution[] { return this.listEnabledFor(user).flatMap(mod => mod.routes || []); }

  public getWidgets(user?: UserContext): DashboardWidgetContribution[] {
    return this.listEnabledFor(user).flatMap(mod => mod.widgets || []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  public getAgentSuggestions(
    moduleId: string,
    user?: UserContext,
    availableCapabilities: string[] = [],
  ): AgentSuggestionContribution[] {
    if (!this.isEnabled(moduleId) || !this.hasAccess(moduleId, user)) return [];
    const suggestions = this.manifests.get(moduleId)?.agent?.suggestions || [];
    const capabilities = new Set(availableCapabilities);
    return suggestions.filter(suggestion =>
      (suggestion.requiredCapabilities || []).every(capabilityId => capabilities.has(capabilityId)),
    );
  }

  public async syncWithServer(): Promise<void> {
    try {
      const res = await authFetch('/api/modules');
      if (res.ok) {
        const list: Array<{ id: string; enabled: boolean }> = await res.json();
        list.forEach(item => { if (this.manifests.has(item.id)) this.enabledMap.set(item.id, item.enabled); });
        eventBus.emit('modules.synced', {});
      }
    } catch (err) {
      console.warn('Could not sync module state with server:', err);
    }
  }
}

export const moduleRegistry = new LocalModuleRegistry();
