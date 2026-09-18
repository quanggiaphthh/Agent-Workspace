import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TaskFormModal } from './TaskFormModal';
import { useContextStore } from '../../core/context/contextStore';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category: string;
  dueDate: string;
  createdAt?: any;
}

export function TasksModule() {
  const setSelectedEntity = useContextStore((state) => state.setSelectedEntity);
  const appUser = useContextStore((state) => state.user);
  const { user } = useFirebaseAuth();
  const canWrite = appUser.permissions.includes('tasks.write') || appUser.roles.includes('admin');
  const canDelete = appUser.permissions.includes('tasks.delete') || appUser.roles.includes('admin');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchTasks = async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await authFetch('/api/tasks?status=all');
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải nhiệm vụ');
      const data = await response.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedSampleData = async () => {
    if (!user || !canWrite) return;
    try {
      setLoading(true);
      const initialSeed = [
        {
          title: 'Hoàn thành báo cáo tài chính quý 3',
          description: 'Tổng hợp doanh thu các chi nhánh và chuẩn bị slide thuyết trình cho cuộc họp hội đồng quản trị.',
          status: 'in-progress',
          priority: 'high',
          category: 'Công việc',
          dueDate: '2026-09-20',
        },
        {
          title: 'Lên lịch tập luyện và kiểm tra sức khỏe định kỳ',
          description: 'Duy trì chạy bộ 3km mỗi sáng và đặt lịch khám bác sĩ chuyên khoa.',
          status: 'todo',
          priority: 'medium',
          category: 'Cá nhân',
          dueDate: '2026-09-18',
        },
        {
          title: 'Nghiên cứu kiến trúc Micro-frontend mới',
          description: 'Đánh giá các giải pháp Module Federation và chia sẻ tài liệu với team kỹ thuật.',
          status: 'completed',
          priority: 'high',
          category: 'Học tập',
          dueDate: '2026-09-14',
        },
      ];
      for (const seed of initialSeed) {
        const response = await authFetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seed),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Không thể tạo dữ liệu mẫu');
      }
      await fetchTasks();
    } catch (err) {
      console.error('Failed to seed sample tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const handleCreateTask = async (newTaskData: any) => {
    if (!user || !canWrite) return;
    try {
      const response = await authFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTaskData),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tạo nhiệm vụ');
      await fetchTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    if (!canWrite) return;
    const nextStatus: 'todo' | 'in-progress' | 'completed' =
      currentStatus === 'todo' ? 'in-progress' : currentStatus === 'in-progress' ? 'completed' : 'todo';
    try {
      const response = await authFetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể cập nhật nhiệm vụ');
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t)));
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!canDelete || !window.confirm('Bạn có chắc chắn muốn xóa nhiệm vụ này không?')) return;
    try {
      const response = await authFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể xóa nhiệm vụ');
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  const urgent = tasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-white rounded-2xl border border-neutral-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
              Server-managed Firestore
            </span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1 tracking-tight">Quản lý Nhiệm vụ (Tasks)</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Dữ liệu được truy cập qua API server với kiểm soát quyền tập trung.
          </p>
        </div>

        {canWrite && <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-neutral-900 hover:bg-neutral-800 text-white gap-2 text-xs font-medium px-4 py-2.5 rounded-xl cursor-pointer shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm nhiệm vụ mới</span>
        </Button>}
      </div>

      {/* Bento Grid Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1">
          <span className="text-xs text-neutral-500 font-medium">Tổng nhiệm vụ</span>
          <div className="text-2xl font-extrabold text-neutral-900">{total}</div>
          <p className="text-[10px] text-neutral-400">Đồng bộ đám mây</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1">
          <span className="text-xs text-amber-600 font-medium">Đang thực hiện</span>
          <div className="text-2xl font-extrabold text-amber-700">{inProgress}</div>
          <p className="text-[10px] text-neutral-400">Cần tập trung hoàn thành</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1">
          <span className="text-xs text-emerald-600 font-medium">Đã hoàn thành</span>
          <div className="text-2xl font-extrabold text-emerald-700">{completed}</div>
          <p className="text-[10px] text-neutral-400">{total > 0 ? Math.round((completed / total) * 100) : 0}% tổng tiến độ</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1">
          <span className="text-xs text-rose-600 font-medium">Ưu tiên cao (Cần gấp)</span>
          <div className="text-2xl font-extrabold text-rose-700">{urgent}</div>
          <p className="text-[10px] text-neutral-400">Cần xử lý sớm</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 bg-white rounded-xl border border-neutral-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tiêu đề hoặc mô tả..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-200 bg-neutral-50/50 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-neutral-200 bg-neutral-50/50 text-neutral-700 focus:outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="todo">Cần làm (To do)</option>
            <option value="in-progress">Đang thực hiện</option>
            <option value="completed">Đã hoàn thành</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-neutral-200 bg-neutral-50/50 text-neutral-700 focus:outline-none"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="Công việc">Công việc</option>
            <option value="Cá nhân">Cá nhân</option>
            <option value="Học tập">Học tập</option>
            <option value="Dự án">Dự án</option>
          </select>
        </div>
      </div>

      {/* Task Cards List */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-neutral-200 text-neutral-400 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-800" />
          <p className="text-xs font-medium">Đang đồng bộ dữ liệu từ Firestore...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-neutral-200 text-neutral-400 flex flex-col items-center justify-center space-y-4">
          <div>
            <CheckSquare className="h-10 w-10 mx-auto mb-1 opacity-40" />
            <h3 className="text-sm font-bold text-neutral-700">Không tìm thấy nhiệm vụ nào</h3>
            <p className="text-xs text-neutral-500 mt-1">Thử thay đổi bộ lọc tìm kiếm hoặc tạo nhiệm vụ mới.</p>
          </div>
          {tasks.length === 0 && canWrite && (
            <Button onClick={handleSeedSampleData} variant="outline" className="text-xs gap-1.5 font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Tạo dữ liệu mẫu (Demo)
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: t.id })}
              className={`p-4 bg-white rounded-xl border transition-all shadow-2xs hover:shadow-md cursor-pointer flex items-start justify-between gap-4 ${
                t.status === 'completed' ? 'border-emerald-200 bg-emerald-50/20' : 'border-neutral-200/80'
              }`}
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStatus(t.id, t.status);
                  }}
                  className={`mt-0.5 h-5 w-5 disabled:cursor-not-allowed disabled:opacity-50 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                    t.status === 'completed'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-neutral-300 hover:border-neutral-800 bg-white'
                  }`}
                >
                  {t.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>

                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm font-bold ${
                        t.status === 'completed' ? 'line-through text-neutral-400' : 'text-neutral-900'
                      }`}
                    >
                      {t.title}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${
                        t.priority === 'high'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : t.priority === 'medium'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {t.priority === 'high' ? 'Ưu tiên: Cao' : t.priority === 'medium' ? 'Ưu tiên: Trung bình' : 'Ưu tiên: Thấp'}
                    </span>

                    <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600 text-[10px] font-mono">
                      {t.category}
                    </span>
                  </div>

                  {t.description && (
                    <p className={`text-xs line-clamp-2 ${t.status === 'completed' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {t.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 pt-1 text-[11px] text-neutral-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Hạn chót: {t.dueDate}
                    </span>
                    <span>•</span>
                    <span className="capitalize">
                      Trạng thái: {t.status === 'completed' ? 'Đã hoàn thành' : t.status === 'in-progress' ? 'Đang làm' : 'Cần làm'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {canDelete && <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTask(t.id);
                  }}
                  className="h-7 w-7 text-neutral-400 hover:text-rose-600"
                  title="Xóa nhiệm vụ"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskFormModal
        isOpen={isModalOpen && canWrite}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateTask}
      />
    </div>
  );
}
