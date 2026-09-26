import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
    expect(moduleSource).toContain('Tuần này');
    expect(moduleSource).toContain('Ưu tiên cao');
    expect(moduleSource).toContain('Báo cáo công việc');
    expect(moduleSource).toContain('buildTaskReport');
    expect(moduleSource).toContain("'today' | '7d' | '30d' | 'all'");
    expect(moduleSource).not.toContain('fetch(');
  });

  it('bounds completed Board history while keeping List history and detail metadata accessible', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const detail = read('src/modules/tasks/TaskDetailPanel.tsx');
    expect(board).toContain('getBoardTaskProjection');
    expect(board).toContain('Xem thêm');
    expect(moduleSource).toContain('Danh sách');
    expect(moduleSource).toContain('buildTaskReport');
    expect(detail).toContain('Hạn giờ');
    expect(detail).toContain('Ngày tạo');
    expect(detail).toContain('Cập nhật lúc');
    expect(detail).toContain('Hoàn thành lúc');
    expect(detail).toContain('type="time"');
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
