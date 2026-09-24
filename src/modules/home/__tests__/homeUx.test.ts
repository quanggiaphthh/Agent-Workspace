import { describe, expect, it, beforeEach } from 'vitest';
import { moduleRegistry } from '../../../core/modules/moduleRegistry';
import { registerPackagedClientModules } from '../../../moduleComposition';
import { getHomeQuickActions, HOME_OPEN_AGENT_EVENT } from '../HomeModule';

describe('W6 Home UX', () => {
  beforeEach(() => {
    moduleRegistry.reset();
    registerPackagedClientModules();
  });

  it('uses only canonical, working quick actions', () => {
    expect(getHomeQuickActions().map(action => action.label)).toEqual([
      'Mở Trợ lý',
      'Xem Công việc',
      'Mở Cài đặt',
    ]);
    expect(getHomeQuickActions().some(action => /tạo công việc/i.test(action.label))).toBe(false);
    expect(HOME_OPEN_AGENT_EVENT).toBe('workspace:open-agent');
  });

  it('removes Task-owned Home surfaces when Task is disabled', async () => {
    expect(moduleRegistry.getWidgets().some(widget => widget.id === 'tasks-stats')).toBe(true);
    expect(getHomeQuickActions().some(action => action.id === 'tasks')).toBe(true);

    await moduleRegistry.disable('tasks');

    expect(moduleRegistry.getWidgets().some(widget => widget.id === 'tasks-stats')).toBe(false);
    expect(getHomeQuickActions().some(action => action.id === 'tasks')).toBe(false);
  });
});
