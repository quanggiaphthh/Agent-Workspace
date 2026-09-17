import { create } from 'zustand';
import { AppContext, EntityRef, UserContext } from '../../../shared/contracts/capability';
import { eventBus } from '../events/eventBus';

interface ContextStoreState extends AppContext {
  setActiveModule: (moduleId: string) => void;
  setActiveRoute: (route: string) => void;
  setSelectedEntity: (entity: EntityRef | null) => void;
  setCurrentView: (view: string) => void;
  setCurrentFilters: (filters: Record<string, unknown>) => void;
  setUser: (user: UserContext) => void;
  setAvailableCapabilities: (caps: string[]) => void;
  getAppContext: () => AppContext;
}

const DEFAULT_USER: UserContext = {
  id: 'usr_admin',
  email: 'tranhailx92@gmail.com',
  name: 'Hai Tran',
  roles: ['admin'],
  permissions: ['demo.read', 'demo.write', 'demo.delete'],
};

export const useContextStore = create<ContextStoreState>((set, get) => ({
  user: DEFAULT_USER,
  activeModule: 'home',
  activeRoute: '/',
  selectedEntity: undefined,
  currentView: 'dashboard',
  currentFilters: {},
  availableCapabilities: [],

  setActiveModule: (moduleId: string) => {
    if (get().activeModule === moduleId) return;
    set({ activeModule: moduleId });
    eventBus.emit('module.changed', { moduleId });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setActiveRoute: (route: string) => {
    if (get().activeRoute === route) return;
    set({ activeRoute: route });
    eventBus.emit('route.changed', { route });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setSelectedEntity: (entity: EntityRef | null) => {
    const current = get().selectedEntity;
    if (
      (!current && !entity) ||
      (current && entity && current.moduleId === entity.moduleId && current.entityType === entity.entityType && current.entityId === entity.entityId)
    ) {
      return;
    }
    set({ selectedEntity: entity || undefined });
    eventBus.emit('entity.selected', { entity });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setCurrentView: (view: string) => {
    if (get().currentView === view) return;
    set({ currentView: view });
    eventBus.emit('view.changed', { view });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setCurrentFilters: (filters: Record<string, unknown>) => {
    set({ currentFilters: filters });
    eventBus.emit('filters.changed', { filters });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setUser: (user: UserContext) => {
    set({ user });
    eventBus.emit('user.changed', { user });
    eventBus.emit('context.changed', get().getAppContext());
  },

  setAvailableCapabilities: (caps: string[]) => {
    set({ availableCapabilities: caps });
  },

  getAppContext: (): AppContext => {
    const s = get();
    return {
      user: s.user,
      activeModule: s.activeModule,
      activeRoute: s.activeRoute,
      selectedEntity: s.selectedEntity,
      currentView: s.currentView,
      currentFilters: s.currentFilters,
      availableCapabilities: s.availableCapabilities,
    };
  },
}));
