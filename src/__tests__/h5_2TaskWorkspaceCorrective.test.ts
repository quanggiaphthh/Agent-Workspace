import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useContextStore } from '../core/context/contextStore';
import { decideRouteRestoration } from '../core/navigation/NavigationSync';
import { EMPTY_TASK_FORM, isTaskFormDirty, normalizeTaskFormValue } from '../modules/tasks/TaskFormModal';
import {
  compareTaskDeadlines,
  getBoardTaskProjection,
  getPrimaryTaskStatusAction,
  getTaskAttentionCounts,
  matchesTaskAttention,
  type TaskUtilityItem,
} from '../modules/tasks/taskUtils';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const now = new Date(2026, 8, 27, 10, 0);
const task = (overrides: Partial<TaskUtilityItem> = {}): TaskUtilityItem => ({
  id: overrides.id || 'task',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  ...overrides,
});

afterEach(() => useContextStore.getState().setSelectedEntity(null));

describe('H5.2 Task workflow behavior', () => {
  it('refreshes the selected Task label for the same entity and clears it explicitly', () => {
    const store = useContextStore.getState();
    store.setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: 't-1', label: 'Tên cũ' });
    store.setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: 't-1', label: 'Tên mới' });
    expect(useContextStore.getState().selectedEntity?.label).toBe('Tên mới');
    store.setSelectedEntity(null);
    expect(useContextStore.getState().selectedEntity).toBeUndefined();
  });

  it('normalizes away time-only deadline state and only marks real field changes dirty', () => {
    const timeOnly = { ...EMPTY_TASK_FORM, dueTime: '08:00' };
    expect(normalizeTaskFormValue(timeOnly).dueTime).toBe('');
    expect(isTaskFormDirty(timeOnly, EMPTY_TASK_FORM)).toBe(false);
    expect(isTaskFormDirty({ ...EMPTY_TASK_FORM, title: 'Đã đổi' }, EMPTY_TASK_FORM)).toBe(true);
  });

  it('sorts equal due dates by due time and keeps tasks without deadlines last', () => {
    expect(compareTaskDeadlines(task({ dueDate: '2026-09-28', dueTime: '08:00' }), task({ dueDate: '2026-09-28', dueTime: '17:00' }))).toBeLessThan(0);
    expect(compareTaskDeadlines(task({ dueDate: '2026-09-28', dueTime: '17:00' }), task({ dueDate: '2026-09-28' }))).toBeLessThan(0);
    expect(compareTaskDeadlines(task(), task({ dueDate: '2026-09-28' }))).toBeGreaterThan(0);
  });

  it('uses the same rolling seven-day semantics for attention counters and filtering', () => {
    const tasks = [
      task({ id: 'today', dueDate: '2026-09-27' }),
      task({ id: 'day7', dueDate: '2026-10-03' }),
      task({ id: 'outside', dueDate: '2026-10-04' }),
      task({ id: 'done', status: 'completed', dueDate: '2026-09-28', priority: 'high' }),
      task({ id: 'high', priority: 'high' }),
    ];
    const counts = getTaskAttentionCounts(tasks, now);
    expect(counts.next7).toBe(tasks.filter((item) => matchesTaskAttention(item, 'next7', now)).length);
    expect(counts.next7).toBe(2);
    expect(counts.high).toBe(1);
  });

  it('maps exactly the three canonical statuses to direct Board workflow actions', () => {
    expect(getPrimaryTaskStatusAction('todo')).toEqual({ label: 'Bắt đầu', status: 'in-progress' });
    expect(getPrimaryTaskStatusAction('in-progress')).toEqual({ label: 'Hoàn thành', status: 'completed' });
    expect(getPrimaryTaskStatusAction('completed')).toEqual({ label: 'Mở lại', status: 'todo' });
  });

  it('keeps completed Board history bounded with an explicit expansion path', () => {
    const completed = Array.from({ length: 7 }, (_, index) => task({ id: `done-${index}`, status: 'completed', completedAt: `2026-09-${String(27 - index).padStart(2, '0')}T08:00:00Z` }));
    expect(getBoardTaskProjection(completed, false)).toMatchObject({ totalCompleted: 7, hiddenCompleted: 2 });
    expect(getBoardTaskProjection(completed, false).tasks).toHaveLength(5);
    expect(getBoardTaskProjection(completed, true).tasks).toHaveLength(7);
  });

  it('preserves H5.1 route restoration behavior without reopening routing', () => {
    const common = { canonicalModuleRoutes: ['/', '/tasks', '/settings'], enabledModuleRoutes: ['/', '/tasks', '/settings'] };
    expect(decideRouteRestoration({ currentPathname: '/tasks', savedPathname: '/settings', isEmbedded: true, isInitialSync: true, ...common })).toEqual({ restorePath: null, persistPath: '/tasks' });
    expect(decideRouteRestoration({ currentPathname: '/', savedPathname: '/tasks', isEmbedded: true, isInitialSync: false, ...common })).toEqual({ restorePath: null, persistPath: '/' });
  });
});

describe('H5.2 bounded source contracts', () => {
  it('keeps Save inside the inspector and protects all dirty-close paths', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const detailSource = read('src/modules/tasks/TaskDetailPanel.tsx');
    expect(moduleSource).toContain('setEditingTask(savedTask)');
    expect(moduleSource).toContain("message: 'Đã lưu'");
    expect(detailSource).toContain('isTaskFormDirty');
    expect(detailSource).toContain('window.confirm');
    expect(detailSource).toContain("event.key !== 'Escape'");
    expect(moduleSource).toContain("Chuyển sang công việc khác mà không lưu?");
  });

  it('keeps inspector and Agent context lifecycles independent with concrete Task labels', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const headerSource = read('src/app/shell/Header.tsx');
    const agentSource = read('src/agent/ui/AgentPanel.tsx');
    expect(moduleSource).toContain('Inspector visibility and Agent context are deliberately independent');
    expect(headerSource).toContain("'Công việc'");
    expect(headerSource).toContain('entity.label || entity.entityId');
    expect(agentSource).toContain("'Công việc'");
    expect(agentSource).not.toContain('1 mục đang chọn');
    expect(headerSource).not.toContain('Đang chọn mục');
  });

  it('keeps canonical PATCH status movement, Quick Add, and no DnD dependency', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const boardSource = read('src/modules/tasks/TaskBoard.tsx');
    const packageJson = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(moduleSource).toContain("method: 'PATCH'");
    expect(moduleSource).toContain('JSON.stringify({ status: nextStatus })');
    expect(boardSource).toContain('getPrimaryTaskStatusAction');
    expect(boardSource).toContain('onQuickCreate');
    expect(boardSource).toContain("priority: 'medium'");
    expect(boardSource).toContain("dueDate: '', dueTime: ''");
    expect(packageJson.dependencies?.['@dnd-kit/core']).toBeUndefined();
    expect(packageJson.dependencies?.['react-beautiful-dnd']).toBeUndefined();
  });

  it('preserves filters across Board/List and separates Report from the representation switch', () => {
    const source = read('src/modules/tasks/TasksModule.tsx');
    expect(source).toContain("onClick={() => { setShowReport(false); setViewMode('board'); }}");
    expect(source).toContain("onClick={() => { setShowReport(false); setViewMode('list'); }}");
    expect(source).toContain('Xóa bộ lọc');
    expect(source).toContain('7 ngày tới');
    expect(source).toContain('visibleTasks.length}/{tasks.length} công việc');
    expect(source).toContain('variant={showReport ?');
  });

  it('supports arbitrary canonical category strings and prevents meaningless dueTime input', () => {
    const source = read('src/modules/tasks/TaskFormModal.tsx');
    expect(source).toContain('list={categorySuggestionsId}');
    expect(source).toContain('placeholder="Nhập hoặc chọn phân loại"');
    expect(source).toContain('disabled={disabled || !form.dueDate}');
    expect(source).toContain("dueTime: dueDate ? form.dueTime : ''");
    expect(source).toContain('Giờ hạn');
    expect(source).toContain('Ghi chú');
  });

  it('uses an intentional horizontal Kanban region and a responsive nonmodal inspector', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    const detail = read('src/modules/tasks/TaskDetailPanel.tsx');
    const shell = read('src/app/shell/AppShell.tsx');
    expect(board).toContain('overflow-x-auto');
    expect(board).toContain('min-w-[960px]');
    expect(detail).toContain('sm:w-[380px]');
    expect(detail).toContain('xl:w-[420px]');
    expect(detail).not.toContain('aria-modal="true"');
    expect(detail).not.toContain('bg-black/25');
    expect(shell).toContain('hidden min-[1400px]:flex');
    expect(shell).toContain("(min-width: 1600px)");
  });

  it('keeps completed history cleanup, readable card hierarchy and robust menu behavior', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain('projection.totalCompleted > TASK_COMPLETED_BOARD_LIMIT');
    expect(board).not.toContain('Đang hiển thị các công việc đã hoàn thành gần đây');
    expect(board).toContain('line-clamp-3');
    expect(board).not.toContain('line-through');
    expect(board).toContain("document.addEventListener('pointerdown'");
    expect(board).toContain("event.key === 'Escape'");
    expect(board).toContain('h-11 w-11');
  });
});
