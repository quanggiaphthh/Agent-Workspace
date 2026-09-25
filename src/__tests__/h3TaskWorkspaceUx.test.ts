import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('H3 Personal Task Workspace UX contract', () => {
  it('provides Board/List dual view and keeps the three canonical statuses', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const boardSource = read('src/modules/tasks/TaskBoard.tsx');
    expect(moduleSource).toContain("type TaskViewMode = 'board' | 'list'");
    expect(moduleSource).toContain("useState<TaskViewMode>('board')");
    expect(moduleSource).toContain('Bảng');
    expect(moduleSource).toContain('Danh sách');
    expect(boardSource).toContain("status: 'todo'");
    expect(boardSource).toContain("status: 'in-progress'");
    expect(boardSource).toContain("status: 'completed'");
    expect(boardSource).not.toContain('waiting');
    expect(boardSource).not.toContain('review');
  });

  it('reuses canonical PATCH for status moves without adding a drag dependency', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    const packageJson = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(moduleSource).toContain('updateTaskStatus');
    expect(moduleSource).toContain("method: 'PATCH'");
    expect(moduleSource).toContain('JSON.stringify({ status: nextStatus })');
    expect(packageJson.dependencies?.['@dnd-kit/core']).toBeUndefined();
    expect(packageJson.dependencies?.['react-beautiful-dnd']).toBeUndefined();
    expect(packageJson.devDependencies?.['@dnd-kit/core']).toBeUndefined();
  });

  it('adds quick create using canonical task defaults and a column-derived status', () => {
    const boardSource = read('src/modules/tasks/TaskBoard.tsx');
    expect(boardSource).toContain('onQuickCreate');
    expect(boardSource).toContain("priority: 'medium'");
    expect(boardSource).toContain("category: 'Công việc'");
    expect(boardSource).toContain("description: ''");
    expect(boardSource).toContain("dueDate: ''");
  });

  it('uses a task detail side panel rather than the old centered edit modal', () => {
    const panelSource = read('src/modules/tasks/TaskDetailPanel.tsx');
    expect(panelSource).toContain('fixed inset-y-0 right-0');
    expect(panelSource).toContain('Chi tiết công việc');
    expect(panelSource).toContain('Lưu thay đổi');
    expect(panelSource).toContain('role="dialog"');
    expect(panelSource).toContain('aria-modal="true"');
  });

  it('keeps search/filter/sort and compact smart filters', () => {
    const moduleSource = read('src/modules/tasks/TasksModule.tsx');
    expect(moduleSource).toContain('searchQuery');
    expect(moduleSource).toContain('priorityFilter');
    expect(moduleSource).toContain('dueFilter');
    expect(moduleSource).toContain('sortMode');
    expect(moduleSource).toContain('Chưa xong');
    expect(moduleSource).toContain('Hôm nay');
    expect(moduleSource).toContain('Quá hạn');
  });

  it('does not introduce board entities or unsupported task features', () => {
    const boardSource = read('src/modules/tasks/TaskBoard.tsx');
    const panelSource = read('src/modules/tasks/TaskDetailPanel.tsx');
    for (const source of [boardSource, panelSource]) {
      expect(source).not.toContain('checklist');
      expect(source).not.toContain('comments');
      expect(source).not.toContain('watchers');
      expect(source).not.toContain('assignee');
      expect(source).not.toContain('position:');
    }
  });
});
