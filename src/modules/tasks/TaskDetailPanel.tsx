import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  isTaskFormDirty,
  normalizeTaskFormValue,
  TaskFields,
  type TaskFormValue,
} from './TaskFormModal';
import type { TaskItem } from './TaskBoard';
import { formatTaskTimestamp } from './taskUtils';

type TaskDetailPanelProps = {
  task: TaskItem | null;
  canWrite: boolean;
  canDelete: boolean;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (value: TaskFormValue) => Promise<TaskItem | void> | TaskItem | void;
  onDelete: (task: TaskItem) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function taskToForm(task: TaskItem): TaskFormValue {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    dueDate: task.dueDate,
    dueTime: task.dueTime ?? '',
  };
}

export function TaskDetailPanel({ task, canWrite, canDelete, saving, error = null, onClose, onSave, onDelete, onDirtyChange }: TaskDetailPanelProps) {
  const [form, setForm] = useState<TaskFormValue | null>(null);
  const [baseline, setBaseline] = useState<TaskFormValue | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!task) {
      setForm(null);
      setBaseline(null);
      setSaveFeedback(null);
      return;
    }
    const next = taskToForm(task);
    setForm(next);
    setBaseline(next);
    setSaveFeedback(null);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      const target = previousFocusRef.current;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    };
  }, [task?.id]);

  const dirty = useMemo(() => Boolean(form && baseline && isTaskFormDirty(form, baseline)), [form, baseline]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // Keep a clean inspector synchronized with canonical Task mutations performed from the Board.
  // Unsaved local edits remain authoritative until the user saves or closes the inspector.
  useEffect(() => {
    if (!task || !form || !baseline || dirty) return;
    const incoming = taskToForm(task);
    if (!isTaskFormDirty(incoming, baseline)) return;
    setForm(incoming);
    setBaseline(incoming);
    setSaveFeedback(null);
  }, [baseline, dirty, form, task]);

  const requestClose = useCallback(() => {
    if (!task || saving) return;
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đóng mà không lưu?')) return;
    onClose();
  }, [dirty, onClose, saving, task]);

  useEffect(() => {
    if (!task) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose, task]);

  if (!task || !form || !baseline) return null;

  const updateForm = (next: TaskFormValue) => {
    setForm(next);
    if (saveFeedback) setSaveFeedback(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || saving || !dirty || !form.title.trim() || !form.category.trim()) return;
    const normalized = normalizeTaskFormValue(form);
    const savedTask = await onSave({
      ...normalized,
      title: normalized.title.trim(),
      description: normalized.description.trim(),
      category: normalized.category.trim(),
    });
    if (!savedTask) return;
    const savedForm = taskToForm(savedTask);
    setForm(savedForm);
    setBaseline(savedForm);
    setSaveFeedback('Đã lưu');
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[45] flex w-full max-w-full flex-col border-l border-neutral-200 bg-white shadow-2xl sm:w-[390px] xl:w-[420px] 2xl:w-[440px]"
      role="dialog"
      aria-labelledby="task-detail-title"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 sm:px-5">
        <h2 id="task-detail-title" className="text-sm font-semibold tracking-tight text-slate-950">Chi tiết công việc</h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          disabled={saving}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
          aria-label="Đóng chi tiết công việc"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <TaskFields form={form} onChange={updateForm} disabled={!canWrite} notesRows={5} />

          <dl className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-neutral-50 px-3 text-xs">
            <div className="flex min-w-0 items-center justify-between gap-4 py-2.5">
              <dt className="shrink-0 font-semibold text-neutral-500">Tạo</dt>
              <dd className="min-w-0 text-right text-neutral-700">{formatTaskTimestamp(task.createdAt)}</dd>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-4 py-2.5">
              <dt className="shrink-0 font-semibold text-neutral-500">Cập nhật</dt>
              <dd className="min-w-0 text-right text-neutral-700">{formatTaskTimestamp(task.updatedAt)}</dd>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-4 py-2.5">
              <dt className="shrink-0 font-semibold text-neutral-500">Hoàn thành</dt>
              <dd className="min-w-0 text-right text-neutral-700">{formatTaskTimestamp(task.completedAt)}</dd>
            </div>
          </dl>
        </div>

        <footer
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-white px-4 pt-3 sm:px-5"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {canDelete && (
              <Button type="button" variant="ghost" onClick={() => onDelete(task)} disabled={saving} className="h-11 gap-2 px-3 text-rose-700 hover:bg-rose-50 hover:text-rose-800">
                <Trash2 className="h-4 w-4" /> Xóa
              </Button>
            )}
            <span className={`truncate text-xs ${saveFeedback ? 'font-medium text-teal-700' : 'text-amber-700'}`} aria-live="polite">
              {saveFeedback ?? (dirty ? 'Chưa lưu' : '')}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={saving} className="h-11 px-3">Đóng</Button>
            {canWrite && (
              <Button type="submit" disabled={saving || !dirty || !form.title.trim() || !form.category.trim()} className="h-11 bg-slate-900 px-4 hover:bg-slate-800">
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            )}
          </div>
        </footer>
      </form>
    </aside>
  );
}
