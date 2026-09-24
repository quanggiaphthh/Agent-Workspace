import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, CheckSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TaskFormModal, type TaskFormValue } from './TaskFormModal';
import { useContextStore } from '../../core/context/contextStore';
import { eventBus } from '../../core/events/eventBus';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

type TaskItem = TaskFormValue & { id: string; createdAt?: string | null; updatedAt?: string | null };
type DueFilter = 'all' | 'today' | 'overdue';
type StatusFilter = 'all' | 'open' | TaskItem['status'];
type SortMode = 'due' | 'priority' | 'newest';

const priorityRank: Record<TaskItem['priority'], number> = { high: 0, medium: 1, low: 2 };
const statusLabel: Record<TaskItem['status'], string> = { todo: 'Cần làm', 'in-progress': 'Đang thực hiện', completed: 'Đã hoàn thành' };
const priorityLabel: Record<TaskItem['priority'], string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const todayKey = () => new Date().toLocaleDateString('en-CA');
const isOverdue = (task: TaskItem) => Boolean(task.dueDate && task.status !== 'completed' && task.dueDate < todayKey());
const isDueToday = (task: TaskItem) => task.dueDate === todayKey() && task.status !== 'completed';
const formatDueDate = (value: string) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`)) : 'Chưa đặt hạn';

export function TasksModule() {
  const selectedEntity = useContextStore((state) => state.selectedEntity);
  const setSelectedEntity = useContextStore((state) => state.setSelectedEntity);
  const appUser = useContextStore((state) => state.user);
  const { user } = useFirebaseAuth();
  const canWrite = appUser.permissions.includes('tasks.write') || appUser.roles.includes('admin');
  const canDelete = appUser.permissions.includes('tasks.delete') || appUser.roles.includes('admin');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskItem['priority']>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('due');
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<TaskItem | null>(null);

  const fetchTasks = async () => {
    if (!user) { setTasks([]); setLoading(false); setError(null); return; }
    try {
      setLoading(true); setError(null);
      const response = await authFetch('/api/tasks?status=all');
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Chưa thể tải danh sách công việc. Vui lòng thử lại.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchTasks(); }, [user]);

  useEffect(() => eventBus.on('canvas.refreshRequested', (payload: any) => {
    if (payload?.target === 'tasks' || payload?.target === 'current') void fetchTasks();
  }), [user]);

  const openCreateForm = () => {
    setEditingTask(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (task: TaskItem) => {
    setEditingTask(task);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingTask(null);
    setFormError(null);
  };

  const saveTask = async (value: TaskFormValue) => {
    if (!canWrite) return;
    const id = editingTask?.id;
    try {
      setBusyId(id ?? 'new'); setFormError(null);
      const response = await authFetch(id ? `/api/tasks/${encodeURIComponent(id)}` : '/api/tasks', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error('save');
      const data = await response.json();
      if (id && data.task) setTasks((current) => current.map((task) => task.id === id ? data.task : task));
      else if (id) await fetchTasks();
      else if (data.task) setTasks((current) => [data.task, ...current]); else await fetchTasks();
      closeForm();
    } catch (err) {
      console.error('Failed to save task:', err);
      setFormError('Chưa thể lưu công việc. Vui lòng kiểm tra thông tin và thử lại.');
    } finally { setBusyId(null); }
  };

  const setCompletion = async (task: TaskItem) => {
    if (!canWrite) return;
    const nextStatus: TaskItem['status'] = task.status === 'completed' ? 'todo' : 'completed';
    try {
      setBusyId(task.id); setError(null);
      const response = await authFetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (data.task) setTasks((current) => current.map((item) => item.id === task.id ? data.task : item));
      else await fetchTasks();
    } catch (err) {
      console.error('Failed to update task status:', err);
      setError('Chưa thể cập nhật trạng thái công việc. Vui lòng thử lại.');
    } finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    if (!deleteTask || !canDelete) return;
    const deletingId = deleteTask.id;
    try {
      setBusyId(deletingId); setError(null);
      const response = await authFetch(`/api/tasks/${encodeURIComponent(deletingId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('delete');
      setTasks((current) => current.filter((task) => task.id !== deletingId));
      if (selectedEntity?.moduleId === 'tasks' && selectedEntity.entityId === deletingId) setSelectedEntity(null);
      setDeleteTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      setError('Chưa thể xóa công việc. Vui lòng thử lại.');
    } finally { setBusyId(null); }
  };

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const q = searchQuery.trim().toLocaleLowerCase('vi');
    const statusMatches = statusFilter === 'all'
      || (statusFilter === 'open' ? task.status !== 'completed' : task.status === statusFilter);
    return (!q || `${task.title} ${task.description}`.toLocaleLowerCase('vi').includes(q))
      && statusMatches
      && (priorityFilter === 'all' || task.priority === priorityFilter)
      && (dueFilter === 'all' || (dueFilter === 'today' ? isDueToday(task) : isOverdue(task)));
  }).sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    if (sortMode === 'priority') return priorityRank[a.priority] - priorityRank[b.priority];
    if (sortMode === 'newest') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    if (!a.dueDate && b.dueDate) return 1; if (a.dueDate && !b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || priorityRank[a.priority] - priorityRank[b.priority];
  }), [tasks, searchQuery, statusFilter, priorityFilter, dueFilter, sortMode]);

  const openCount = tasks.filter((task) => task.status !== 'completed').length;
  const todayCount = tasks.filter(isDueToday).length;
  const overdueCount = tasks.filter(isOverdue).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-xl font-semibold text-neutral-900">Công việc</h1><p className="mt-1 text-sm text-neutral-500">Tập trung vào việc cần làm, ưu tiên và hạn hoàn thành.</p></div>
        {canWrite && <Button onClick={openCreateForm} className="gap-2"><Plus className="h-4 w-4" /> Tạo công việc</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button type="button" onClick={() => { setStatusFilter('open'); setDueFilter('all'); }} className="rounded-xl border border-neutral-200 bg-white p-4 text-left"><span className="text-xs text-neutral-500">Chưa xong</span><div className="mt-1 text-2xl font-semibold">{openCount}</div></button>
        <button type="button" onClick={() => { setStatusFilter('open'); setDueFilter('today'); }} className="rounded-xl border border-neutral-200 bg-white p-4 text-left"><span className="text-xs text-neutral-500">Hôm nay</span><div className="mt-1 text-2xl font-semibold">{todayCount}</div></button>
        <button type="button" onClick={() => { setStatusFilter('open'); setDueFilter('overdue'); }} className="rounded-xl border border-neutral-200 bg-white p-4 text-left"><span className="text-xs text-neutral-500">Quá hạn</span><div className="mt-1 text-2xl font-semibold text-rose-700">{overdueCount}</div></button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-col gap-2 lg:flex-row">
          <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><span className="sr-only">Tìm công việc</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm công việc…" className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" /></label>
          <select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"><option value="all">Mọi trạng thái</option><option value="open">Chưa xong</option><option value="todo">Cần làm</option><option value="in-progress">Đang thực hiện</option><option value="completed">Đã hoàn thành</option></select>
          <select aria-label="Lọc theo ưu tiên" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"><option value="all">Mọi ưu tiên</option><option value="high">Ưu tiên cao</option><option value="medium">Ưu tiên trung bình</option><option value="low">Ưu tiên thấp</option></select>
          <select aria-label="Lọc theo hạn" value={dueFilter} onChange={(e) => setDueFilter(e.target.value as DueFilter)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"><option value="all">Mọi thời hạn</option><option value="today">Hôm nay</option><option value="overdue">Quá hạn</option></select>
          <select aria-label="Sắp xếp công việc" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"><option value="due">Hạn gần nhất</option><option value="priority">Ưu tiên cao trước</option><option value="newest">Mới tạo trước</option></select>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><Button variant="ghost" size="sm" onClick={() => void fetchTasks()}>Thử lại</Button></div>}

      {loading ? <div aria-label="Đang tải công việc" className="space-y-2">{[0,1,2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />)}</div>
      : visibleTasks.length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center"><CheckSquare className="mx-auto h-9 w-9 text-neutral-300" /><h2 className="mt-3 text-sm font-semibold text-neutral-800">{tasks.length === 0 ? 'Chưa có công việc nào' : 'Không có công việc phù hợp'}</h2><p className="mt-1 text-sm text-neutral-500">{tasks.length === 0 ? 'Tạo công việc đầu tiên để bắt đầu theo dõi.' : 'Hãy đổi từ khóa hoặc bộ lọc.'}</p>{tasks.length === 0 && canWrite && <Button className="mt-4" onClick={openCreateForm}>Tạo công việc</Button>}</div>
      : <div className="space-y-2">{visibleTasks.map((task) => <article key={task.id} onClick={() => setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: task.id, label: task.title })} className={`flex gap-3 rounded-xl border bg-white p-4 ${isOverdue(task) ? 'border-rose-200' : 'border-neutral-200'}`}>
          <button type="button" disabled={!canWrite || busyId === task.id} aria-label={task.status === 'completed' ? `Mở lại ${task.title}` : `Hoàn thành ${task.title}`} onClick={(e) => { e.stopPropagation(); void setCompletion(task); }} className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${task.status === 'completed' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white'}`}>{task.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}</button>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-sm font-semibold ${task.status === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{task.title}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${task.priority === 'high' ? 'bg-rose-50 text-rose-700' : task.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}>Ưu tiên {priorityLabel[task.priority].toLocaleLowerCase('vi')}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{statusLabel[task.status]}</span></div>
            {task.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{task.description}</p>}
            <div className={`mt-2 flex items-center gap-1 text-xs ${isOverdue(task) ? 'font-medium text-rose-700' : isDueToday(task) ? 'font-medium text-amber-700' : 'text-neutral-500'}`}><Calendar className="h-3.5 w-3.5" />{isOverdue(task) ? 'Quá hạn · ' : isDueToday(task) ? 'Hôm nay · ' : ''}{formatDueDate(task.dueDate)}</div>
          </div>
          <div className="flex shrink-0 items-start gap-1">{canWrite && <Button variant="ghost" size="icon" aria-label={`Chỉnh sửa ${task.title}`} title="Chỉnh sửa" onClick={(e) => { e.stopPropagation(); openEditForm(task); }}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button variant="ghost" size="icon" aria-label={`Xóa ${task.title}`} title="Xóa" onClick={(e) => { e.stopPropagation(); setDeleteTask(task); }}><Trash2 className="h-4 w-4" /></Button>}</div>
        </article>)}</div>}

      <TaskFormModal isOpen={isFormOpen && canWrite} onClose={closeForm} onSave={saveTask} initialTask={editingTask} saving={busyId === 'new' || busyId === editingTask?.id} error={formError} />
      {deleteTask && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title"><button type="button" aria-label="Hủy xóa công việc" className="fixed inset-0 bg-black/40" onClick={() => setDeleteTask(null)} /><div className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl"><h2 id="delete-task-title" className="text-base font-semibold text-neutral-900">Xóa công việc?</h2><p className="mt-2 text-sm text-neutral-600">“{deleteTask.title}” sẽ bị xóa khỏi danh sách. Thao tác này không thể hoàn tác.</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTask(null)}>Hủy</Button><Button onClick={() => void confirmDelete()} disabled={busyId === deleteTask.id}>Xóa</Button></div></div></div>}
    </div>
  );
}
