import React, { useEffect, useId, useState } from 'react';
import { AlertCircle } from 'lucide-react';
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

export function TaskFields({ form, onChange, disabled = false, autoFocusTitle = false, notesRows = 4 }: TaskFieldsProps) {
  const categorySuggestionsId = useId();
  const update = (patch: Partial<TaskFormValue>) => onChange({ ...form, ...patch });
  const updateDueDate = (dueDate: string) => onChange({ ...form, dueDate, dueTime: dueDate ? form.dueTime : '' });

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5 text-xs font-semibold text-neutral-700">
        Tên công việc *
        <input
          autoFocus={autoFocusTitle}
          maxLength={300}
          required
          disabled={disabled}
          value={form.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Ví dụ: Hoàn thiện báo cáo quý III"
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-neutral-700">
          Trạng thái
          <select
            disabled={disabled}
            value={form.status}
            onChange={(event) => update({ status: event.target.value as TaskFormValue['status'] })}
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
          >
            <option value="todo">Cần làm</option>
            <option value="in-progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-neutral-700">
          Ưu tiên
          <select
            disabled={disabled}
            value={form.priority}
            onChange={(event) => update({ priority: event.target.value as TaskFormValue['priority'] })}
            className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
          >
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1.5 text-xs font-semibold text-neutral-700">
        Phân loại
        <input
          list={categorySuggestionsId}
          maxLength={100}
          required
          disabled={disabled}
          value={form.category}
          onChange={(event) => update({ category: event.target.value })}
          placeholder="Nhập hoặc chọn phân loại"
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
        />
        <datalist id={categorySuggestionsId}>
          <option value="Công việc" />
          <option value="Cá nhân" />
          <option value="Học tập" />
        </datalist>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-neutral-700">
          Hạn ngày
          <input
            type="date"
            disabled={disabled}
            value={form.dueDate}
            onChange={(event) => updateDueDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-neutral-700">
          Giờ hạn
          <input
            type="time"
            disabled={disabled || !form.dueDate}
            value={form.dueDate ? form.dueTime : ''}
            onChange={(event) => update({ dueTime: event.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
          />
        </label>
      </div>

      <label className="block space-y-1.5 text-xs font-semibold text-neutral-700">
        Ghi chú
        <textarea
          rows={notesRows}
          maxLength={5000}
          disabled={disabled}
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="Thông tin cần nhớ khi thực hiện…"
          className="mt-1 w-full resize-none rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50"
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.category.trim() || saving) return;
    const normalized = normalizeTaskFormValue(form);
    await onSave({
      ...normalized,
      title: normalized.title.trim(),
      description: normalized.description.trim(),
      category: normalized.category.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <button type="button" aria-label="Đóng biểu mẫu công việc" className="fixed inset-0 bg-black/40" onClick={saving ? undefined : onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 id="task-form-title" className="text-base font-semibold text-neutral-900">{initialTask ? 'Chỉnh sửa công việc' : 'Tạo công việc'}</h2>
          <p className="mt-1 text-xs text-neutral-500">Thêm thông tin cần thiết; có thể tiếp tục chỉnh sửa trong phần chi tiết.</p>
        </div>
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
          <TaskFields form={form} onChange={setForm} autoFocusTitle notesRows={3} />
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button type="submit" disabled={saving || !form.title.trim() || !form.category.trim()}>{saving ? 'Đang lưu…' : initialTask ? 'Lưu thay đổi' : 'Tạo công việc'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
