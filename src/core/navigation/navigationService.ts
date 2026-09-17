import { eventBus } from '../events/eventBus';
import { moduleRegistry } from '../modules/moduleRegistry';

export interface NavigationTarget {
  path?: string;
  moduleId?: string;
  entityId?: string;
  entityType?: string;
}

class NavigationService {
  private navigateFn: ((target: string) => void) | null = null;

  public setNavigateFn(fn: (target: string) => void) {
    this.navigateFn = fn;
  }

  public navigate(path: string) {
    if (this.navigateFn) {
      this.navigateFn(path);
    } else {
      // Fallback if router not yet ready
      window.location.href = path;
    }
    eventBus.emit('navigation.executed', { path });
  }

  public openModule(moduleId: string) {
    const path = moduleRegistry.getPrimaryRoute(moduleId);
    this.navigate(path);
  }

  public openEntity(moduleId: string, entityType: string, entityId: string) {
    const basePath = moduleRegistry.getPrimaryRoute(moduleId);
    const path = `${basePath}${basePath.includes('?') ? '&' : '?'}entityId=${entityId}&entityType=${entityType}`;
    this.navigate(path);
  }
}

export const navigationService = new NavigationService();
