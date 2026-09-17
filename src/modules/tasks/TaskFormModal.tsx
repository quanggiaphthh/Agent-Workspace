import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { X, CheckSquare, Calendar, Tag, AlertCircle } from 'lucide-react';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: {
    title: string;
    description: string;
    status: 'todo' | 'in-progress' | 'completed';
    priority: 'low' | 'medium' | 'high';
    category: string;
    dueDate: string;
  }) => void;
}

export function TaskFormModal({ isOpen, onClose, onSave }: TaskFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'todo' | 'in-progress' | 'completed'>('todo');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [category, setCategory] = useState('Công việc');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      category,
      dueDate,
    });

    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <CheckSquare className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">Tạo nhiệm vụ mới</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-neutral-500 hover:text-neutral-900">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-700">Tiêu đề nhiệm vụ *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Soạn tài liệu họp hội đồng quản trị..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-700">Mô tả chi tiết</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú các bước thực hiện, tài liệu liên quan..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700">Phân loại</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="Công việc">Công việc</option>
                <option value="Cá nhân">Cá nhân</option>
                <option value="Học tập">Học tập</option>
                <option value="Dự án">Dự án</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700">Mức độ ưu tiên</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700">Trạng thái</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="todo">Cần làm (To do)</option>
                <option value="in-progress">Đang thực hiện</option>
                <option value="completed">Đã hoàn thành</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-700">Hạn chót (Due Date)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-xs">
              Hủy
            </Button>
            <Button type="submit" variant="default" className="text-xs bg-neutral-900 text-white hover:bg-neutral-800">
              Tạo nhiệm vụ
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
