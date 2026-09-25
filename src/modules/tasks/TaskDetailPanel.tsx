import React, { useEffect, useState } from 'react';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { TaskFormValue } from './TaskFormModal';
import type { TaskItem } from './TaskBoard';

type TaskDetailPanelProps = {
  task: TaskItem | null;
  canWrite: boolean;
  canDelete: boolean;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (value: TaskFormValue) => Promise<void> | void;
  onDelete: (task: TaskItem) => void;
};

export function TaskDetailPanel({ task, canWrite, canDelete, saving, error = null, onClose, onSave, onDelete }: TaskDetailPanelProps) {
  const [form, setForm] = useState<TaskFormValue | null>(null);

  useEffect(() => { setForm(task ? { title: task.title, description: task.description, status: task.status, priority: task.priority, category: task.category, dueDate: task.dueDate } : null); }, [task]);
  useEffect(() => {
    if (!task) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, saving, onClose]);

  if (!task || !form) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || saving || !form.title.trim()) return;
    await onSave({ ...form, title: form.title.trim(), description: form.description.trim() });
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <button type="button" aria-label="Đóng chi tiết công việc" className="absolute inset-0 bg-black/25" onClick={saving ? undefined : onClose} />
      <aside className="fixed inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div><p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Chi tiết công việc</p><h2 id="task-detail-title" className="mt-1 truncate text-base font-semibold text-neutral-900">{task.title}</h2></div>
          <button type="button" onClick={onClose} disabled={saving} className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-700">Tên công việc *<input autoFocus maxLength={300} required disabled={!canWrite} value={form.title} onChange={(event) => setForm((value) => value && ({ ...value, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Trạng thái<select disabled={!canWrite} value={form.status} onChange={(event) => setForm((value) => value && ({ ...value, status: event.target.value as TaskFormValue['status'] }))} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal disabled:bg-neutral-50"><option value="todo">Cần làm</option><option value="in-progress">Đang thực hiện</option><option value="completed">Hoàn thành</option></select></label>
              <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Ưu tiên<select disabled={!canWrite} value={form.priority} onChange={(event) => setForm((value) => value && ({ ...value, priority: event.target.value as TaskFormValue['priority'] }))} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal disabled:bg-neutral-50"><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option></select></label>
              <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Phân loại<select disabled={!canWrite} value={form.category} onChange={(event) => setForm((value) => value && ({ ...value, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-normal disabled:bg-neutral-50"><option value="Công việc">Công việc</option><option value="Cá nhân">Cá nhân</option><option value="Học tập">Học tập</option></select></label>
              <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Hạn hoàn thành<input type="date" disabled={!canWrite} value={form.dueDate} onChange={(event) => setForm((value) => value && ({ ...value, dueDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal disabled:bg-neutral-50" /></label>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-neutral-700">Mô tả<textarea rows={7} maxLength={5000} disabled={!canWrite} value={form.description} onChange={(event) => setForm((value) => value && ({ ...value, description: event.target.value }))} placeholder="Thông tin cần nhớ khi thực hiện…" className="mt-1 w-full resize-y rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50" /></label>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-neutral-100 bg-white px-5 py-4">
            {canDelete ? <Button type="button" variant="ghost" onClick={() => onDelete(task)} disabled={saving} className="gap-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Xóa</Button> : <span />}
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Đóng</Button>{canWrite && <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>}</div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
