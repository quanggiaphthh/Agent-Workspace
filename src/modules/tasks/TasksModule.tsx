import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, BarChart3, Calendar, CheckCircle2, CheckSquare, LayoutGrid, List, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TaskFormModal, type TaskFormValue } from './TaskFormModal';
import { TaskBoard, type TaskItem } from './TaskBoard';
import { TaskDetailPanel } from './TaskDetailPanel';
import { useContextStore } from '../../core/context/contextStore';
import { eventBus } from '../../core/events/eventBus';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { buildTaskReport, formatTaskDeadline, formatTaskTimestamp, isHighPriorityOpenTask, isTaskDueInNextSevenDays, isTaskDueToday, isTaskOverdue, type TaskReportPeriod } from './taskUtils';

type DueFilter = 'all' | 'today' | 'week' | 'overdue';
type StatusFilter = 'all' | 'open' | TaskItem['status'];
type SortMode = 'due' | 'priority' | 'newest';
type TaskViewMode = 'board' | 'list';
type ReportPeriod = 'today' | '7d' | '30d' | 'all';

const priorityRank: Record<TaskItem['priority'], number> = { high: 0, medium: 1, low: 2 };
const statusLabel: Record<TaskItem['status'], string> = { todo: 'Cần làm', 'in-progress': 'Đang thực hiện', completed: 'Hoàn thành' };
const priorityLabel: Record<TaskItem['priority'], string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

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
  const [viewMode, setViewMode] = useState<TaskViewMode>('board');
  const [showReport, setShowReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('7d');
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<TaskItem | null>(null);

  const fetchTasks = async () => {
    if (!user) { setTasks([]); setLoading(false); setError(null); return; }
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch('/api/tasks?status=all');
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      setError('Chưa thể tải danh sách công việc. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchTasks(); }, [user]);
  useEffect(() => eventBus.on('canvas.refreshRequested', (payload: any) => {
    if (payload?.target === 'tasks' || payload?.target === 'current') void fetchTasks();
  }), [user]);

  const openCreateForm = () => { setFormError(null); setIsFormOpen(true); };
  const closeCreateForm = () => { setIsFormOpen(false); setFormError(null); };
  const openTaskDetail = (task: TaskItem) => {
    setEditingTask(task);
    setFormError(null);
    setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: task.id, label: task.title });
  };
  const closeTaskDetail = () => { setEditingTask(null); setFormError(null); };

  const createTask = async (value: TaskFormValue) => {
    if (!canWrite) return;
    try {
      setBusyId('new');
      setFormError(null);
      const response = await authFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error('save');
      const data = await response.json();
      if (data.task) setTasks((current) => [data.task, ...current]);
      else await fetchTasks();
      setIsFormOpen(false);
    } catch (err) {
      console.error('Failed to create task:', err);
      setFormError('Chưa thể tạo công việc. Vui lòng kiểm tra thông tin và thử lại.');
      throw err;
    } finally {
      setBusyId(null);
    }
  };

  const saveTask = async (value: TaskFormValue) => {
    if (!canWrite || !editingTask) return;
    const id = editingTask.id;
    try {
      setBusyId(id);
      setFormError(null);
      const response = await authFetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error('save');
      const data = await response.json();
      if (data.task) {
        setTasks((current) => current.map((task) => task.id === id ? data.task : task));
        setSelectedEntity({ moduleId: 'tasks', entityType: 'task', entityId: id, label: data.task.title });
      } else {
        await fetchTasks();
      }
      setEditingTask(null);
    } catch (err) {
      console.error('Failed to save task:', err);
      setFormError('Chưa thể lưu công việc. Vui lòng kiểm tra thông tin và thử lại.');
    } finally {
      setBusyId(null);
    }
  };

  const updateTaskStatus = async (task: TaskItem, nextStatus: TaskItem['status']) => {
    if (!canWrite || task.status === nextStatus) return;
    try {
      setBusyId(task.id);
      setError(null);
      const response = await authFetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (data.task) {
        setTasks((current) => current.map((item) => item.id === task.id ? data.task : item));
        if (editingTask?.id === task.id) setEditingTask(data.task);
      } else {
        await fetchTasks();
      }
    } catch (err) {
      console.error('Failed to update task status:', err);
      setError('Chưa thể cập nhật trạng thái công việc. Vui lòng thử lại.');
    } finally {
      setBusyId(null);
    }
  };

  const setCompletion = async (task: TaskItem) => {
    const nextStatus: TaskItem['status'] = task.status === 'completed' ? 'todo' : 'completed';
    await updateTaskStatus(task, nextStatus);
  };

  const confirmDelete = async () => {
    if (!deleteTask || !canDelete) return;
    const deletingId = deleteTask.id;
    try {
      setBusyId(deletingId);
      setError(null);
      const response = await authFetch(`/api/tasks/${encodeURIComponent(deletingId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('delete');
      setTasks((current) => current.filter((task) => task.id !== deletingId));
      if (selectedEntity?.moduleId === 'tasks' && selectedEntity.entityId === deletingId) setSelectedEntity(null);
      if (editingTask?.id === deletingId) setEditingTask(null);
      setDeleteTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      setError('Chưa thể xóa công việc. Vui lòng thử lại.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const q = searchQuery.trim().toLocaleLowerCase('vi');
    const statusMatches = statusFilter === 'all'
      || (statusFilter === 'open' ? task.status !== 'completed' : task.status === statusFilter);
    const dueMatches = dueFilter === 'all'
      || (dueFilter === 'today'
        ? isTaskDueToday(task)
        : dueFilter === 'week'
          ? isTaskDueInNextSevenDays(task)
          : isTaskOverdue(task));
    return (!q || `${task.title} ${task.description} ${task.category}`.toLocaleLowerCase('vi').includes(q))
      && statusMatches
      && (priorityFilter === 'all' || task.priority === priorityFilter)
      && dueMatches;
  }).sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    if (sortMode === 'priority') return priorityRank[a.priority] - priorityRank[b.priority];
    if (sortMode === 'newest') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && !b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || priorityRank[a.priority] - priorityRank[b.priority];
  }), [tasks, searchQuery, statusFilter, priorityFilter, dueFilter, sortMode]);

  const todayCount = tasks.filter((task) => isTaskDueToday(task)).length;
  const weekCount = tasks.filter((task) => isTaskDueInNextSevenDays(task)).length;
  const overdueCount = tasks.filter((task) => isTaskOverdue(task)).length;
  const highPriorityCount = tasks.filter((task) => isHighPriorityOpenTask(task)).length;
  const report = useMemo(() => buildTaskReport(tasks, reportPeriod as TaskReportPeriod), [tasks, reportPeriod]);
  const activeAttention: 'today' | 'week' | 'overdue' | 'high' | null = statusFilter !== 'open'
    ? null
    : priorityFilter === 'high' && dueFilter === 'all'
      ? 'high'
      : dueFilter === 'today'
        ? 'today'
        : dueFilter === 'week'
          ? 'week'
          : dueFilter === 'overdue'
            ? 'overdue'
            : null;

  const applyAttentionFilter = (filter: 'today' | 'week' | 'overdue' | 'high') => {
    if (activeAttention === filter) {
      setStatusFilter('all');
      setDueFilter('all');
      setPriorityFilter('all');
      return;
    }
    setStatusFilter('open');
    setDueFilter(filter === 'high' ? 'all' : filter);
    setPriorityFilter(filter === 'high' ? 'high' : 'all');
  };

  const smartFilterClass = (active: boolean) => `rounded-full border px-2.5 py-1 text-sm transition-colors ${active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'}`;
  const reportPeriodLabel = reportPeriod === 'today'
    ? 'hôm nay'
    : reportPeriod === '7d'
      ? '7 ngày qua'
      : reportPeriod === '30d'
        ? '30 ngày qua'
        : 'toàn bộ dữ liệu';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Công việc</h1>
          <p className="mt-1 text-sm text-neutral-500">Quản lý việc cần làm, tiến độ và thời hạn.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1" aria-label="Chế độ hiển thị">
            <button
              type="button"
              aria-pressed={!showReport && viewMode === 'board'}
              onClick={() => { setShowReport(false); setViewMode('board'); setStatusFilter('all'); }}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ${!showReport && viewMode === 'board' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
            >
              <LayoutGrid className="h-4 w-4" /> Bảng
            </button>
            <button
              type="button"
              aria-pressed={!showReport && viewMode === 'list'}
              onClick={() => { setShowReport(false); setViewMode('list'); }}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ${!showReport && viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
            >
              <List className="h-4 w-4" /> Danh sách
            </button>
            <button
              type="button"
              aria-pressed={showReport}
              onClick={() => setShowReport(true)}
              className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ${showReport ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
            >
              <BarChart3 className="h-4 w-4" /> Báo cáo
            </button>
          </div>
          {canWrite && <Button onClick={openCreateForm} className="gap-2"><Plus className="h-4 w-4" /> Tạo công việc</Button>}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void fetchTasks()}>Thử lại</Button>
        </div>
      )}

      {showReport ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs" aria-labelledby="task-report-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-neutral-500" />
              <div>
                <h2 id="task-report-title" className="text-sm font-semibold text-neutral-900">Báo cáo công việc</h2>
                <p className="mt-1 text-xs text-neutral-500">Tổng hợp từ dữ liệu công việc hiện có.</p>
              </div>
            </div>
            <select aria-label="Phạm vi báo cáo" value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as ReportPeriod)} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
              <option value="all">Tất cả</option>
            </select>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl bg-neutral-50 p-3"><span className="text-xs text-neutral-500">Tổng công việc</span><strong className="mt-1 block text-xl text-neutral-900">{report.total}</strong></div>
            <div className="rounded-xl bg-emerald-50 p-3"><span className="text-xs text-emerald-700">Đã hoàn thành</span><strong className="mt-1 block text-xl text-emerald-800">{report.completed}</strong></div>
            <div className="rounded-xl bg-blue-50 p-3"><span className="text-xs text-blue-700">Đang thực hiện</span><strong className="mt-1 block text-xl text-blue-800">{report.inProgress}</strong></div>
            <div className="rounded-xl bg-amber-50 p-3"><span className="text-xs text-amber-700">Cần làm</span><strong className="mt-1 block text-xl text-amber-800">{report.todo}</strong></div>
            <div className="rounded-xl bg-rose-50 p-3"><span className="text-xs text-rose-700">Quá hạn</span><strong className="mt-1 block text-xl text-rose-800">{report.overdue}</strong></div>
          </div>
          <p className="mt-3 text-sm text-neutral-600">Đã hoàn thành <strong>{report.completed}/{report.total}</strong> công việc trong {reportPeriodLabel} — <strong>{report.completionRate}%</strong></p>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-2xs" aria-labelledby="task-attention-title">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h2 id="task-attention-title">Cần chú ý</h2>
              </div>
              <button type="button" aria-pressed={activeAttention === 'today'} onClick={() => applyAttentionFilter('today')} className={smartFilterClass(activeAttention === 'today')}>Hôm nay <strong className="ml-1 tabular-nums">{todayCount}</strong></button>
              <button type="button" aria-pressed={activeAttention === 'week'} onClick={() => applyAttentionFilter('week')} className={smartFilterClass(activeAttention === 'week')}>Tuần này <strong className="ml-1 tabular-nums">{weekCount}</strong></button>
              <button type="button" aria-pressed={activeAttention === 'overdue'} onClick={() => applyAttentionFilter('overdue')} className={`${smartFilterClass(activeAttention === 'overdue')} ${overdueCount > 0 && activeAttention !== 'overdue' ? 'text-rose-700' : ''}`}>Quá hạn <strong className="ml-1 tabular-nums">{overdueCount}</strong></button>
              <button type="button" aria-pressed={activeAttention === 'high'} onClick={() => applyAttentionFilter('high')} className={smartFilterClass(activeAttention === 'high')}>Ưu tiên cao <strong className="ml-1 tabular-nums">{highPriorityCount}</strong></button>
            </div>
          </section>

          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              <label className="relative min-w-0 basis-full md:basis-64 md:flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <span className="sr-only">Tìm công việc</span>
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm công việc…" className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </label>
              {viewMode === 'list' && (
                <select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="min-w-40 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm sm:flex-none">
                  <option value="all">Mọi trạng thái</option>
                  <option value="open">Chưa xong</option>
                  <option value="todo">Cần làm</option>
                  <option value="in-progress">Đang thực hiện</option>
                  <option value="completed">Hoàn thành</option>
                </select>
              )}
              <select aria-label="Lọc theo ưu tiên" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)} className="min-w-40 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm sm:flex-none">
                <option value="all">Mọi ưu tiên</option>
                <option value="high">Ưu tiên cao</option>
                <option value="medium">Ưu tiên trung bình</option>
                <option value="low">Ưu tiên thấp</option>
              </select>
              <select aria-label="Lọc theo hạn" value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)} className="min-w-40 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm sm:flex-none">
                <option value="all">Mọi thời hạn</option>
                <option value="today">Hôm nay</option>
                <option value="week">Tuần này</option>
                <option value="overdue">Quá hạn</option>
              </select>
              <select aria-label="Sắp xếp công việc" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="min-w-40 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm sm:flex-none">
                <option value="due">Hạn gần nhất</option>
                <option value="priority">Ưu tiên cao trước</option>
                <option value="newest">Mới tạo trước</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div aria-label="Đang tải công việc" className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />)}
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
              <CheckSquare className="mx-auto h-9 w-9 text-neutral-300" />
              <h2 className="mt-3 text-sm font-semibold text-neutral-800">{tasks.length === 0 ? 'Chưa có công việc nào' : 'Không có công việc phù hợp'}</h2>
              <p className="mt-1 text-sm text-neutral-500">{tasks.length === 0 ? 'Tạo công việc đầu tiên để bắt đầu theo dõi.' : 'Hãy đổi từ khóa hoặc bộ lọc.'}</p>
              {tasks.length === 0 && canWrite && <Button className="mt-4" onClick={openCreateForm}>Tạo công việc</Button>}
            </div>
          ) : viewMode === 'board' ? (
            <TaskBoard tasks={visibleTasks} canWrite={canWrite} busyId={busyId} onOpenTask={openTaskDetail} onMoveTask={(task, status) => void updateTaskStatus(task, status)} onQuickCreate={createTask} />
          ) : (
            <div className="space-y-2">
              {visibleTasks.map((task) => {
                const overdue = isTaskOverdue(task);
                return (
                  <article key={task.id} onClick={() => openTaskDetail(task)} className={`flex cursor-pointer gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm ${overdue ? 'border-rose-200' : 'border-neutral-200'}`}>
                    <button type="button" disabled={!canWrite || busyId === task.id} aria-label={task.status === 'completed' ? `Mở lại ${task.title}` : `Hoàn thành ${task.title}`} onClick={(event) => { event.stopPropagation(); void setCompletion(task); }} className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 ${task.status === 'completed' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white'}`}>
                      {task.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-sm font-semibold ${task.status === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{task.title}</h3>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{statusLabel[task.status]}</span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{priorityLabel[task.priority]}</span>
                      </div>
                      {task.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{task.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        {task.dueDate && (
                          <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-rose-700' : ''}`}>
                            <Calendar className="h-3.5 w-3.5" />
                            {overdue ? 'Quá hạn · ' : ''}{formatTaskDeadline(task)}
                          </span>
                        )}
                        {task.category && <span className="text-neutral-400">{task.category}</span>}
                      </div>
                      {task.status === 'completed' && task.completedAt && <div className="mt-1 text-xs text-neutral-400">Hoàn thành {formatTaskTimestamp(task.completedAt)}</div>}
                    </div>
                    {canDelete && (
                      <button type="button" disabled={busyId === task.id} aria-label={`Xóa ${task.title}`} onClick={(event) => { event.stopPropagation(); setDeleteTask(task); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <TaskFormModal isOpen={isFormOpen} onClose={closeCreateForm} onSave={createTask} saving={busyId === 'new'} error={formError} />
      <TaskDetailPanel task={editingTask} canWrite={canWrite} canDelete={canDelete} saving={Boolean(editingTask && busyId === editingTask.id)} error={formError} onClose={closeTaskDetail} onSave={saveTask} onDelete={(task) => setDeleteTask(task)} />

      {deleteTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
          <button type="button" aria-label="Đóng xác nhận xóa" className="fixed inset-0 bg-black/40" onClick={() => setDeleteTask(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="delete-task-title" className="font-semibold text-neutral-900">Xóa công việc?</h2>
            <p className="mt-2 text-sm text-neutral-600">“{deleteTask.title}” sẽ bị xóa và không thể hoàn tác.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTask(null)}>Hủy</Button>
              <Button onClick={() => void confirmDelete()} disabled={busyId === deleteTask.id} className="bg-rose-600 hover:bg-rose-700">{busyId === deleteTask.id ? 'Đang xóa…' : 'Xóa'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
