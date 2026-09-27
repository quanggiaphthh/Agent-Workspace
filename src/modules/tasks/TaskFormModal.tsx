import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export type TaskFormValue = {
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category: string;
  dueDate: string;
  dueTime: string;
};

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskFormValue) => Promise<void> | void;
  initialTask?: TaskFormValue | null;
  saving?: boolean;
  error?: string | null;
}

type TaskFieldsProps = {
  form: TaskFormValue;
  onChange: (next: TaskFormValue) => void;
  disabled?: boolean;
  autoFocusTitle?: boolean;
  notesRows?: number;
  stackedDate?: boolean;
};

export const EMPTY_TASK_FORM: TaskFormValue = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  category: 'Công việc',
  dueDate: '',
  dueTime: '',
};

const fieldLabelClass = 'block w-full min-w-0 max-w-full box-border space-y-1.5 text-xs font-semibold text-neutral-700';
const fieldControlClass = 'mt-1 block w-full min-w-0 max-w-full box-border rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal text-neutral-900 outline-none transition-colors focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20 disabled:bg-neutral-50 disabled:text-neutral-400';

export function normalizeTaskFormValue(value: TaskFormValue): TaskFormValue {
  return {
    ...value,
    dueTime: value.dueDate ? value.dueTime : '',
  };
}

export function isTaskFormDirty(current: TaskFormValue, saved: TaskFormValue): boolean {
  const a = normalizeTaskFormValue(current);
  const b = normalizeTaskFormValue(saved);
  return a.title !== b.title
    || a.description !== b.description
    || a.status !== b.status
    || a.priority !== b.priority
    || a.category !== b.category
    || a.dueDate !== b.dueDate
    || a.dueTime !== b.dueTime;
}

export function TaskFields({ form, onChange, disabled = false, autoFocusTitle = false, notesRows = 4, stackedDate = false }: TaskFieldsProps) {
  const categorySuggestionsId = useId();
  const update = (patch: Partial<TaskFormValue>) => onChange({ ...form, ...patch });
  const updateDueDate = (dueDate: string) => onChange({ ...form, dueDate, dueTime: dueDate ? form.dueTime : '' });

  return (
    <div className="min-w-0 space-y-4">
      <label className={`block ${fieldLabelClass}`}>
        Tên công việc *
        <input
          autoFocus={autoFocusTitle}
          maxLength={300}
          required
          disabled={disabled}
          value={form.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Ví dụ: Hoàn thiện báo cáo quý III"
          className={fieldControlClass}
        />
      </label>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className={fieldLabelClass}>
          Trạng thái
          <select
            disabled={disabled}
            value={form.status}
            onChange={(event) => update({ status: event.target.value as TaskFormValue['status'] })}
            className={fieldControlClass}
          >
            <option value="todo">Cần làm</option>
            <option value="in-progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </label>
        <label className={fieldLabelClass}>
          Ưu tiên
          <select
            disabled={disabled}
            value={form.priority}
            onChange={(event) => update({ priority: event.target.value as TaskFormValue['priority'] })}
            className={fieldControlClass}
          >
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </label>
      </div>

      <label className={`block ${fieldLabelClass}`}>
        Phân loại
        <input
          list={categorySuggestionsId}
          maxLength={100}
          required
          disabled={disabled}
          value={form.category}
          onChange={(event) => update({ category: event.target.value })}
          placeholder="Nhập hoặc chọn phân loại"
          className={fieldControlClass}
        />
        <datalist id={categorySuggestionsId}>
          <option value="Công việc" />
          <option value="Cá nhân" />
          <option value="Học tập" />
        </datalist>
      </label>

      <div className={stackedDate ? "grid min-w-0 grid-cols-1 gap-3" : "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]"}>
        <label className={fieldLabelClass}>
          Hạn ngày
          <input
            type="date"
            disabled={disabled}
            value={form.dueDate}
            onChange={(event) => updateDueDate(event.target.value)}
            className={`${fieldControlClass} [min-inline-size:0]`}
          />
        </label>
        <label className={fieldLabelClass}>
          Giờ hạn
          <input
            type="time"
            disabled={disabled || !form.dueDate}
            value={form.dueDate ? form.dueTime : ''}
            onChange={(event) => update({ dueTime: event.target.value })}
            className={`${fieldControlClass} [min-inline-size:0]`}
          />
        </label>
      </div>

      <label className={`block ${fieldLabelClass}`}>
        Ghi chú
        <textarea
          rows={notesRows}
          maxLength={5000}
          disabled={disabled}
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="Thông tin cần nhớ khi thực hiện…"
          className={`${fieldControlClass} resize-none leading-relaxed`}
        />
      </label>
    </div>
  );
}

export function TaskFormModal({ isOpen, onClose, onSave, initialTask, saving = false, error = null }: TaskFormModalProps) {
  const [form, setForm] = useState<TaskFormValue>({ ...EMPTY_TASK_FORM });

  useEffect(() => {
    if (isOpen) setForm({ ...(initialTask ?? EMPTY_TASK_FORM) });
  }, [isOpen, initialTask]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saving]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.category.trim() || saving) return;
    const normalized = normalizeTaskFormValue(form);
    try {
      await onSave({
        ...normalized,
        title: normalized.title.trim(),
        description: normalized.description.trim(),
        category: normalized.category.trim(),
      });
    } catch {
      // Parent owns canonical error feedback; keep form values intact for retry.
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <button type="button" aria-label="Đóng biểu mẫu công việc" className="fixed inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={saving ? undefined : onClose} />
      <div className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id="task-form-title" className="text-base font-semibold text-slate-950">{initialTask ? 'Chỉnh sửa công việc' : 'Tạo công việc'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">Thêm thông tin cần thiết; có thể tiếp tục chỉnh sửa trong phần chi tiết.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40"
            aria-label="Đóng biểu mẫu công việc"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form id="task-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <TaskFields form={form} onChange={setForm} autoFocusTitle notesRows={3} stackedDate />
          </div>

          <footer
            className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 bg-white px-4 pt-3 sm:px-5"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className="h-11 px-4">Hủy</Button>
            <Button type="submit" disabled={saving || !form.title.trim() || !form.category.trim()} className="h-11 bg-slate-900 px-4 hover:bg-slate-800">
              {saving ? 'Đang lưu…' : initialTask ? 'Lưu thay đổi' : 'Tạo công việc'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
