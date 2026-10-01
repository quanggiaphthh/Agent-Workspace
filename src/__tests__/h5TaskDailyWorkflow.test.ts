import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildTaskPeriodActivity, buildTaskSnapshot, getTaskAttentionCounts } from '../modules/tasks/taskUtils';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('H5 Personal Task Daily Workflow contract', () => {
  it('extends the canonical Task contract with due time and server completion metadata', () => {
    const data = read('server/core/data/UserDataService.ts');
    const registration = read('server/modules/tasks/registration.ts');
    const server = read('server.ts');
    expect(data).toContain('dueTime?: string');
    expect(data).toContain('completedAt?: string | null');
    expect(registration).toContain('taskDueTimeSchema');
    expect(registration).toContain('dueTime: taskDueTimeSchema.optional()');
    expect(server).toContain('isValidTaskDueTime');
    expect(server).toContain('dueTime: z.string().max(5).refine(isValidTaskDueTime');
  });

  it('provides the compact attention center and secondary report without a new backend subsystem', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    expect(moduleSource).toContain('Cần chú ý');
    expect(moduleSource).toContain('7 ngày tới');
    expect(moduleSource).toContain('Ưu tiên cao');
    expect(moduleSource).toContain('Báo cáo công việc');
    const item = { id: '1', status: 'todo' as const, priority: 'high' as const, dueDate: '2026-09-28', createdAt: '2026-09-28T08:00:00' };
    const now = new Date(2026, 8, 28, 10);
    expect(getTaskAttentionCounts([item], now)).toMatchObject({ today: 1, high: 1 });
    expect(buildTaskSnapshot([item], now)).toMatchObject({ total: 1, todo: 1 });
    expect(['today', '7d', '30d', 'all'].map((period) => buildTaskPeriodActivity([item], period as 'today' | '7d' | '30d' | 'all', now).created)).toEqual([1, 1, 1, 1]);
    expect(moduleSource).not.toContain('fetch(');
  });

  it('bounds completed Board history while keeping List history and detail metadata accessible', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const detail = read('src/modules/tasks/TaskDetailPanel.tsx');
    const form = read('src/modules/tasks/TaskFormModal.tsx');
    expect(board).toContain('getBoardTaskProjection');
    expect(board).toContain('Xem thêm');
    expect(moduleSource).toContain('Danh sách');
    expect(form).toContain('Giờ hạn');
    expect(detail).toContain('>Tạo<');
    expect(detail).toContain('>Cập nhật<');
    expect(detail).toContain('>Hoàn thành<');
    expect(form).toContain('type="time"');
  });

  it('keeps exactly three canonical statuses and no drag-and-drop dependency', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    const packageJson = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(board).toContain("status: 'todo'");
    expect(board).toContain("status: 'in-progress'");
    expect(board).toContain("status: 'completed'");
    expect(board).not.toContain("status: 'waiting'");
    expect(packageJson.dependencies?.['@dnd-kit/core']).toBeUndefined();
    expect(packageJson.dependencies?.['react-beautiful-dnd']).toBeUndefined();
  });
});
