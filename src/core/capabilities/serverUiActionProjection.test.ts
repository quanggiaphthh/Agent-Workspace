import { describe, expect, it } from 'vitest';
import { projectServerUiAction } from './capabilityRegistry';

describe('server UI action projection', () => {
  it('projects a nested Task mutation refresh through the canonical UI capability', () => {
    expect(projectServerUiAction({
      success: true,
      result: { success: true, taskId: 'task-1', uiAction: 'refresh', target: 'tasks' },
    })).toEqual({ capabilityId: 'ui.refresh', input: { target: 'tasks' } });
  });

  it('projects canonical server UI capability results', () => {
    expect(projectServerUiAction({ uiAction: 'openModule', moduleId: 'tasks' }))
      .toEqual({ capabilityId: 'ui.openModule', input: { moduleId: 'tasks' } });
    expect(projectServerUiAction({
      success: true,
      result: { uiAction: 'openEntity', entity: { moduleId: 'tasks', entityType: 'task', entityId: 'task-2', label: 'Báo cáo' } },
    })).toEqual({
      capabilityId: 'ui.openEntity',
      input: { moduleId: 'tasks', entityType: 'task', entityId: 'task-2', label: 'Báo cáo' },
    });
    expect(projectServerUiAction({
      uiAction: 'showNotification',
      notification: { message: 'Đã lưu', type: 'success' },
    })).toEqual({
      capabilityId: 'ui.showNotification',
      input: { message: 'Đã lưu', type: 'success' },
    });
  });

  it('fails closed for unsuccessful, unknown or malformed payloads', () => {
    expect(projectServerUiAction({ success: false, result: { uiAction: 'refresh', target: 'tasks' } })).toBeNull();
    expect(projectServerUiAction({ uiAction: 'openEntity', entity: { moduleId: 'tasks' } })).toBeNull();
    expect(projectServerUiAction({ uiAction: 'deleteEverything' })).toBeNull();
    expect(projectServerUiAction(null)).toBeNull();
  });
});
