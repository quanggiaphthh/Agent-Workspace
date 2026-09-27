import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { TaskFormValue } from './TaskFormModal';
import {
  formatTaskDeadline,
  formatTaskTimestamp,
  getBoardTaskProjection,
  getPrimaryTaskStatusAction,
  isTaskOverdue,
  TASK_COMPLETED_BOARD_LIMIT,
} from './taskUtils';

export type TaskItem = TaskFormValue & { id: string; createdAt?: string | null; updatedAt?: string | null; completedAt?: string | null };

type TaskStatus = TaskItem['status'];

type TaskBoardProps = {
  tasks: TaskItem[];
  canWrite: boolean;
  canDelete: boolean;
  busyId: string | null;
  onOpenTask: (task: TaskItem) => void;
  onMoveTask: (task: TaskItem, status: TaskStatus) => void;
  onDeleteTask: (task: TaskItem) => void;
  onQuickCreate: (value: TaskFormValue) => Promise<void> | void;
};

type TaskMenuAnchorRect = { left: number; right: number; top: number; bottom: number };
type TaskMenuPosition = { top: number; left: number; width: number; placement: 'bottom' | 'top' };

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'Cần làm' },
  { status: 'in-progress', label: 'Đang thực hiện' },
  { status: 'completed', label: 'Hoàn thành' },
];

const priorityLabel: Record<TaskItem['priority'], string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const MENU_MARGIN = 8;
const MENU_GAP = 8;
const TASK_MENU_WIDTH = 216;
const TASK_MENU_ESTIMATED_HEIGHT = 196;

export function getTaskMenuPosition(
  anchorRect: TaskMenuAnchorRect,
  viewportWidth: number,
  viewportHeight: number,
  requestedWidth = TASK_MENU_WIDTH,
  menuHeight = TASK_MENU_ESTIMATED_HEIGHT,
): TaskMenuPosition {
  const usableWidth = Math.max(0, viewportWidth - MENU_MARGIN * 2);
  const width = Math.min(requestedWidth, usableWidth);
  const maxLeft = Math.max(MENU_MARGIN, viewportWidth - width - MENU_MARGIN);
  const left = Math.min(Math.max(MENU_MARGIN, anchorRect.right - width), maxLeft);
  const roomBelow = viewportHeight - anchorRect.bottom - MENU_GAP - MENU_MARGIN;
  const roomAbove = anchorRect.top - MENU_GAP - MENU_MARGIN;
  const placement: 'bottom' | 'top' = roomBelow >= menuHeight || roomBelow >= roomAbove ? 'bottom' : 'top';
  const preferredTop = placement === 'bottom'
    ? anchorRect.bottom + MENU_GAP
    : anchorRect.top - menuHeight - MENU_GAP;
  const maxTop = Math.max(MENU_MARGIN, viewportHeight - menuHeight - MENU_MARGIN);
  const top = Math.min(Math.max(MENU_MARGIN, preferredTop), maxTop);
  return { top, left, width, placement };
}

function statusActionClass(status: TaskStatus): string {
  if (status === 'in-progress') return 'border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 hover:text-teal-950';
  if (status === 'completed') return 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950';
  return 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 hover:text-sky-950';
}

export function TaskBoard({ tasks, canWrite, canDelete, busyId, onOpenTask, onMoveTask, onDeleteTask, onQuickCreate }: TaskBoardProps) {
  const [quickColumn, setQuickColumn] = useState<TaskStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<TaskMenuPosition | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projection = getBoardTaskProjection(tasks, showAllCompleted);

  const closeMenu = useCallback((restoreFocus = false) => {
    const closingId = menuTaskId;
    setMenuTaskId(null);
    setMenuPosition(null);
    if (restoreFocus && closingId) requestAnimationFrame(() => menuTriggerRefs.current[closingId]?.focus());
  }, [menuTaskId]);

  const toggleMenu = (taskId: string) => {
    if (menuTaskId === taskId) {
      closeMenu(true);
      return;
    }
    const trigger = menuTriggerRefs.current[taskId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition(getTaskMenuPosition(rect, window.innerWidth, window.innerHeight));
    setMenuTaskId(taskId);
  };

  useEffect(() => {
    if (!menuTaskId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-task-menu-root]') || target?.closest('[data-task-menu-trigger]')) return;
      closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const handleViewportChange = () => closeMenu(false);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, menuTaskId]);

  useEffect(() => {
    if (!menuTaskId) return;
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }, [menuTaskId]);

  useEffect(() => {
    if (menuTaskId && !tasks.some((task) => task.id === menuTaskId)) closeMenu(false);
  }, [closeMenu, menuTaskId, tasks]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    if (event.key === 'Home') items[0].focus();
    else if (event.key === 'End') items[items.length - 1].focus();
    else if (event.key === 'ArrowDown') items[(current + 1 + items.length) % items.length].focus();
    else items[(current - 1 + items.length) % items.length].focus();
  };

  const submitQuickCreate = async (status: TaskStatus) => {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await onQuickCreate({ title, description: '', status, priority: 'medium', category: 'Công việc', dueDate: '', dueTime: '' });
      setQuickTitle('');
      setQuickColumn(null);
    } catch {
      // Keep the title so the user can retry without retyping after a failed request.
    }
  };

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2 [scrollbar-gutter:stable]" aria-label="Bảng công việc">
      <div className="grid min-w-[960px] grid-cols-3 gap-3 lg:gap-4">
        {columns.map((column) => {
          const columnTasks = projection.tasks.filter((task) => task.status === column.status);
          const columnTotal = column.status === 'completed' ? projection.totalCompleted : columnTasks.length;
          const hasHiddenCompletedHistory = column.status === 'completed' && projection.totalCompleted > TASK_COMPLETED_BOARD_LIMIT;
          return (
            <section key={column.status} className="min-w-0 rounded-2xl border border-neutral-200 bg-slate-50/70 p-3" aria-labelledby={`task-column-${column.status}`}>
              <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 id={`task-column-${column.status}`} className="truncate text-xs font-semibold uppercase tracking-wide text-slate-700">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200">{columnTotal}</span>
                </div>
                {canWrite && column.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => { setQuickColumn(column.status); setQuickTitle(''); }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-white hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
                    aria-label={`Thêm công việc vào ${column.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {quickColumn === column.status && (
                <form className="mb-3 rounded-xl border border-sky-100 bg-white p-3 shadow-sm" onSubmit={(event) => { event.preventDefault(); void submitQuickCreate(column.status); }}>
                  <label className="sr-only" htmlFor={`quick-task-${column.status}`}>Tên công việc</label>
                  <input
                    id={`quick-task-${column.status}`}
                    autoFocus
                    maxLength={300}
                    value={quickTitle}
                    onChange={(event) => setQuickTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') setQuickColumn(null); }}
                    placeholder="Tên công việc…"
                    className="w-full min-w-0 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setQuickColumn(null)} className="h-11 px-3">Hủy</Button>
                    <Button type="submit" disabled={!quickTitle.trim() || busyId === 'new'} className="h-11 bg-slate-900 px-4 hover:bg-slate-800">{busyId === 'new' ? 'Đang thêm…' : 'Thêm'}</Button>
                  </div>
                </form>
              )}

              {hasHiddenCompletedHistory && (
                <button
                  type="button"
                  onClick={() => setShowAllCompleted((value) => !value)}
                  className="mb-3 w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
                >
                  {showAllCompleted ? 'Thu gọn' : `Xem thêm ${projection.hiddenCompleted} công việc hoàn thành`}
                </button>
              )}

              <div className="space-y-2">
                {columnTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 bg-white/70 px-4 py-7 text-center text-xs text-neutral-400">Chưa có công việc</div>
                ) : columnTasks.map((task) => {
                  const overdue = isTaskOverdue(task);
                  const primaryStatusAction = getPrimaryTaskStatusAction(task.status);
                  const alternateStatuses = columns.filter((item) => item.status !== task.status && item.status !== primaryStatusAction.status);
                  const menuOpen = menuTaskId === task.id && menuPosition;
                  return (
                    <article key={task.id} className="group relative rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition-[box-shadow,border-color] hover:border-neutral-300 hover:shadow-md">
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
                        aria-label={`Mở chi tiết ${task.title}`}
                      >
                        <h3 className={`line-clamp-2 text-sm font-semibold leading-5 ${task.status === 'completed' ? 'text-neutral-600' : 'text-slate-950'}`}>{task.title}</h3>
                        {task.dueDate && (
                          <div className={`mt-2 inline-flex items-center gap-1 text-xs ${overdue ? 'font-medium text-rose-700' : 'text-neutral-500'}`}>
                            <Calendar className="h-3.5 w-3.5" />{overdue ? 'Quá hạn · ' : ''}{formatTaskDeadline(task)}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                          {task.priority === 'high' && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-100">Ưu tiên {priorityLabel[task.priority].toLowerCase()}</span>}
                          {task.category && <span className="text-neutral-400">{task.category}</span>}
                          {task.status === 'completed' && task.completedAt && <span className="text-neutral-400">Hoàn thành {formatTaskTimestamp(task.completedAt)}</span>}
                        </div>
                      </button>

                      {canWrite && (
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busyId === task.id}
                            onClick={() => onMoveTask(task, primaryStatusAction.status)}
                            className={`h-11 px-3 ${statusActionClass(task.status)}`}
                          >
                            {primaryStatusAction.label}
                          </Button>

                          <button
                            ref={(node) => { menuTriggerRefs.current[task.id] = node; }}
                            type="button"
                            data-task-menu-trigger
                            onClick={() => toggleMenu(task.id)}
                            aria-expanded={menuTaskId === task.id}
                            aria-haspopup="menu"
                            aria-label={`Thao tác với ${task.title}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {menuOpen && createPortal(
                            <div
                              ref={menuRef}
                              data-task-menu-root
                              role="menu"
                              aria-label={`Thao tác với ${task.title}`}
                              onKeyDown={handleMenuKeyDown}
                              className="fixed z-[70] max-w-[calc(100vw-16px)] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
                              style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
                            >
                              <button type="button" role="menuitem" onClick={() => { closeMenu(false); onOpenTask(task); }} className="min-h-11 w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/30">Mở chi tiết</button>
                              {alternateStatuses.map((item) => (
                                <button
                                  key={item.status}
                                  type="button"
                                  role="menuitem"
                                  disabled={busyId === task.id}
                                  onClick={() => { closeMenu(false); onMoveTask(task, item.status); }}
                                  className="min-h-11 w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/30 disabled:opacity-50"
                                >
                                  Chuyển sang {item.label.toLowerCase()}
                                </button>
                              ))}
                              {canDelete && (
                                <>
                                  <div className="my-1 border-t border-neutral-100" />
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={busyId === task.id}
                                    onClick={() => { closeMenu(false); onDeleteTask(task); }}
                                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" /> Xóa công việc
                                  </button>
                                </>
                              )}
                            </div>,
                            document.body,
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
