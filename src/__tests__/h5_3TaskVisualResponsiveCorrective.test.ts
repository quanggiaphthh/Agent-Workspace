import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTaskMenuPosition } from '../modules/tasks/TaskBoard';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('H5.3 Task visual/responsive corrective behavior', () => {
  it('anchors the task menu bottom-end and flips/shifts inside the viewport', () => {
    expect(getTaskMenuPosition({ left: 700, right: 744, top: 100, bottom: 144 }, 768, 1024, 216, 180)).toMatchObject({ placement: 'bottom', left: 528 });
    const flipped = getTaskMenuPosition({ left: 700, right: 744, top: 830, bottom: 874 }, 768, 900, 216, 180);
    expect(flipped.placement).toBe('top');
    expect(flipped.top).toBeGreaterThanOrEqual(8);
    expect(flipped.left).toBeLessThanOrEqual(544);
  });
});

describe('H5.3 bounded source contracts', () => {
  it('hardens the shared TaskFields native control layout at the shared authority', () => {
    const source = read('src/modules/tasks/TaskFormModal.tsx');
    expect(source).toContain('minmax(0,');
    expect(source).toContain('min-w-0');
    expect(source).toContain('max-w-full');
    expect(source).toContain('box-border');
    expect(source).toContain('disabled={disabled || !form.dueDate}');
  });

  it('keeps Full Create modal distinct from inline Quick Add', () => {
    const modal = read('src/modules/tasks/TaskFormModal.tsx');
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(modal).toContain('Tạo công việc');
    expect(modal).toContain('TaskFields');
    expect(board).toContain('quick-task-');
    expect(board).toContain('Tên công việc…');
    expect(board).toContain('onQuickCreate');
    expect(board).not.toContain('<TaskFormModal');
  });

  it('keeps Quick Add input on create failure instead of clearing it', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain('try {');
    expect(board).toContain('await onQuickCreate');
    expect(board).toContain('catch');
    expect(board).toContain('Keep the title so the user can retry');
  });

  it('uses collision-safe anchored menu lifecycle without a popover dependency', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain('getTaskMenuPosition');
    expect(board).toContain('getBoundingClientRect');
    expect(board).toContain('className="fixed z-[70]');
    expect(board).toContain("document.addEventListener('pointerdown'");
    expect(board).toContain("event.key === 'Escape'");
    expect(board).toContain("document.addEventListener('scroll'");
    expect(board).toContain("window.addEventListener('resize'");
  });

  it('does not duplicate the primary status transition inside the overflow menu', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain('item.status !== primaryStatusAction.status');
    expect(board).toContain('Mở chi tiết');
    expect(board).toContain('Xóa công việc');
  });

  it('keeps the inspector nonmodal, independently scrollable and safe-area aware', () => {
    const detail = read('src/modules/tasks/TaskDetailPanel.tsx');
    expect(detail).not.toContain('aria-modal="true"');
    expect(detail).toContain('overflow-y-auto');
    expect(detail).toContain('env(safe-area-inset-bottom)');
    expect(detail).toContain('sm:w-[390px]');
  });

  it('keeps exactly three statuses and no drag-and-drop implementation', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain("status: 'todo'");
    expect(board).toContain("status: 'in-progress'");
    expect(board).toContain("status: 'completed'");
    expect(board).not.toContain("status: 'waiting'");
    expect(board).not.toContain('useDraggable');
    expect(board).not.toContain('useDroppable');
  });

  it('keeps card overdue emphasis on the deadline instead of the whole card border', () => {
    const board = read('src/modules/tasks/TaskBoard.tsx');
    expect(board).toContain("overdue ? 'font-medium text-rose-700'");
    expect(board).not.toContain("overdue ? 'border-rose-200'");
    expect(board).toContain('line-clamp-2');
  });

  it('preserves H5.2 Task context and routing authorities untouched by H5.3', () => {
    const header = read('src/app/shell/Header.tsx');
    const navigation = read('src/core/navigation/NavigationSync.tsx');
    expect(header).toContain("'Công việc'");
    expect(header).toContain('entity.label || entity.entityId');
    expect(navigation).toContain('agent-workspace:last-module-path');
    expect(navigation).toContain('replace: true');
  });
});
