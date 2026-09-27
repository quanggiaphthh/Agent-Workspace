import React, { useEffect, useRef, useState } from 'react';
import { Calendar, MoreHorizontal, Plus } from 'lucide-react';
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
  busyId: string | null;
  onOpenTask: (task: TaskItem) => void;
  onMoveTask: (task: TaskItem, status: TaskStatus) => void;
  onQuickCreate: (value: TaskFormValue) => Promise<void> | void;
};

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'Cần làm' },
  { status: 'in-progress', label: 'Đang thực hiện' },
  { status: 'completed', label: 'Hoàn thành' },
];

const priorityLabel: Record<TaskItem['priority'], string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

export function TaskBoard({ tasks, canWrite, busyId, onOpenTask, onMoveTask, onQuickCreate }: TaskBoardProps) {
  const [quickColumn, setQuickColumn] = useState<TaskStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const projection = getBoardTaskProjection(tasks, showAllCompleted);

  useEffect(() => {
    if (!menuTaskId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-task-menu-root]')) setMenuTaskId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const closingId = menuTaskId;
        setMenuTaskId(null);
        requestAnimationFrame(() => menuTriggerRefs.current[closingId]?.focus());
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuTaskId]);

  useEffect(() => {
    if (menuTaskId && !tasks.some((task) => task.id === menuTaskId)) setMenuTaskId(null);
  }, [menuTaskId, tasks]);

  const submitQuickCreate = async (status: TaskStatus) => {
    const title = quickTitle.trim();
    if (!title) return;
    await onQuickCreate({ title, description: '', status, priority: 'medium', category: 'Công việc', dueDate: '', dueTime: '' });
    setQuickTitle('');
    setQuickColumn(null);
  };

  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2" aria-label="Bảng công việc">
      <div className="grid min-w-[960px] grid-cols-3 gap-4">
        {columns.map((column) => {
          const columnTasks = projection.tasks.filter((task) => task.status === column.status);
          const columnTotal = column.status === 'completed' ? projection.totalCompleted : columnTasks.length;
          const hasHiddenCompletedHistory = column.status === 'completed' && projection.totalCompleted > TASK_COMPLETED_BOARD_LIMIT;
          return (
            <section key={column.status} className="min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3" aria-labelledby={`task-column-${column.status}`}>
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <h2 id={`task-column-${column.status}`} className="text-xs font-semibold uppercase tracking-wide text-neutral-700">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200">{columnTotal}</span>
                </div>
                {canWrite && column.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => { setQuickColumn(column.status); setQuickTitle(''); }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-white hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    aria-label={`Thêm công việc vào ${column.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {quickColumn === column.status && (
                <form className="mb-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm" onSubmit={(event) => { event.preventDefault(); void submitQuickCreate(column.status); }}>
                  <label className="sr-only" htmlFor={`quick-task-${column.status}`}>Tên công việc</label>
                  <input
                    id={`quick-task-${column.status}`}
                    autoFocus
                    maxLength={300}
                    value={quickTitle}
                    onChange={(event) => setQuickTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') setQuickColumn(null); }}
                    placeholder="Tên công việc…"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQuickColumn(null)}>Hủy</Button>
                    <Button type="submit" size="sm" disabled={!quickTitle.trim() || busyId === 'new'}>Thêm</Button>
                  </div>
                </form>
              )}

              {hasHiddenCompletedHistory && (
                <button
                  type="button"
                  onClick={() => setShowAllCompleted((value) => !value)}
                  className="mb-3 w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                  {showAllCompleted ? 'Thu gọn' : `Xem thêm ${projection.hiddenCompleted} công việc hoàn thành`}
                </button>
              )}

              <div className="space-y-2">
                {columnTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 bg-white/70 px-4 py-8 text-center text-xs text-neutral-400">Chưa có công việc</div>
                ) : columnTasks.map((task) => {
                  const overdue = isTaskOverdue(task);
                  const primaryStatusAction = getPrimaryTaskStatusAction(task.status);
                  return (
                    <article key={task.id} className={`group relative rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${overdue ? 'border-rose-200' : 'border-neutral-200'}`}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded-lg"
                        aria-label={`Mở chi tiết ${task.title}`}
                      >
                        <h3 className={`line-clamp-3 text-sm font-semibold leading-5 ${task.status === 'completed' ? 'text-neutral-600' : 'text-neutral-900'}`}>{task.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {task.dueDate && (
                            <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-rose-700' : 'text-neutral-500'}`}>
                              <Calendar className="h-3.5 w-3.5" />{overdue ? 'Quá hạn · ' : ''}{formatTaskDeadline(task)}
                            </span>
                          )}
                          {task.priority === 'high' && <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-800">Ưu tiên {priorityLabel[task.priority].toLowerCase()}</span>}
                          {task.category && <span className="text-neutral-400">{task.category}</span>}
                          {task.status === 'completed' && task.completedAt && <span className="text-neutral-400">Hoàn thành {formatTaskTimestamp(task.completedAt)}</span>}
                        </div>
                      </button>

                      {canWrite && (
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={task.status === 'in-progress' ? 'success' : 'ghost'}
                            disabled={busyId === task.id}
                            onClick={() => onMoveTask(task, primaryStatusAction.status)}
                            className="h-11 px-3"
                          >
                            {primaryStatusAction.label}
                          </Button>

                          <div className="relative" data-task-menu-root>
                            <button
                              ref={(node) => { menuTriggerRefs.current[task.id] = node; }}
                              type="button"
                              onClick={() => setMenuTaskId((current) => current === task.id ? null : task.id)}
                              aria-expanded={menuTaskId === task.id}
                              aria-haspopup="menu"
                              aria-label={`Thao tác với ${task.title}`}
                              className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuTaskId === task.id && (
                              <div className="absolute bottom-12 right-0 z-30 w-48 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg" role="menu">
                                <button type="button" role="menuitem" onClick={() => { setMenuTaskId(null); onOpenTask(task); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900">Mở chi tiết</button>
                                <div className="my-1 border-t border-neutral-100" />
                                {columns.filter((item) => item.status !== task.status).map((item) => (
                                  <button
                                    key={item.status}
                                    type="button"
                                    role="menuitem"
                                    disabled={busyId === task.id}
                                    onClick={() => { setMenuTaskId(null); onMoveTask(task, item.status); }}
                                    className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-50"
                                  >
                                    Chuyển sang {item.label.toLowerCase()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
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
