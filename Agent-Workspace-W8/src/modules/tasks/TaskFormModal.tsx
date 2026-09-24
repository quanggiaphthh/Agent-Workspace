import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';

export type TaskFormValue = {
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category: string;
  dueDate: string;
};

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskFormValue) => Promise<void> | void;
  initialTask?: TaskFormValue | null;
  saving?: boolean;
}

const emptyTask: TaskFormValue = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  category: 'Công việc',
  dueDate: '',
};

export function TaskFormModal({ isOpen, onClose, onSave, initialTask, saving = false }: TaskFormModalProps) {
  const [form, setForm] = useState<TaskFormValue>(emptyTask);

  useEffect(() => {
    if (isOpen) setForm(initialTask ?? emptyTask);
  }, [isOpen, initialTask]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    await onSave({ ...form, title: form.title.trim(), description: form.description.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <button type="button" aria-label="Đóng biểu mẫu công việc" className="fixed inset-0 bg-black/40" onClick={saving ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-4">
          <h2 id="task-form-title" className="text-base font-semibold text-neutral-900">{initialTask ? 'Chỉnh sửa công việc' : 'Tạo công việc'}</h2>
          <p className="mt-1 text-xs text-neutral-500">Giữ thông tin ngắn gọn để dễ theo dõi và hoàn thành.</p>
        </div>
        <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="task-title" className="text-xs font-semibold text-neutral-700">Tên công việc *</label>
          <input id="task-title" autoFocus required maxLength={300} value={form.title}
            onChange={(e) => setForm((value) => ({ ...value, title: e.target.value }))}
            placeholder="Ví dụ: Hoàn thiện báo cáo quý III"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="task-description" className="text-xs font-semibold text-neutral-700">Ghi chú</label>
          <textarea id="task-description" rows={3} maxLength={5000} value={form.description}
            onChange={(e) => setForm((value) => ({ ...value, description: e.target.value }))}
            placeholder="Thông tin cần nhớ khi thực hiện…"
            className="w-full resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Trạng thái
            <select value={form.status} onChange={(e) => setForm((value) => ({ ...value, status: e.target.value as TaskFormValue['status'] }))}
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900">
              <option value="todo">Cần làm</option><option value="in-progress">Đang thực hiện</option><option value="completed">Đã hoàn thành</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Ưu tiên
            <select value={form.priority} onChange={(e) => setForm((value) => ({ ...value, priority: e.target.value as TaskFormValue['priority'] }))}
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900">
              <option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Phân loại
            <select value={form.category} onChange={(e) => setForm((value) => ({ ...value, category: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900">
              <option value="Công việc">Công việc</option><option value="Cá nhân">Cá nhân</option><option value="Học tập">Học tập</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-neutral-700">Hạn hoàn thành
            <input type="date" value={form.dueDate} onChange={(e) => setForm((value) => ({ ...value, dueDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
        </div>
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? 'Đang lưu…' : initialTask ? 'Lưu thay đổi' : 'Tạo công việc'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
