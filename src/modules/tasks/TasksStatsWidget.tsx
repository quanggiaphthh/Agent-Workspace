import React, { useState, useEffect } from 'react';
import { CheckSquare, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

export function TasksStatsWidget() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [total, setTotal] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [completedPercent, setCompletedPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) {
        setTotal(0);
        setInProgress(0);
        setCompletedPercent(0);
        setHasError(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setHasError(false);
        const response = await authFetch('/api/tasks/stats');
        if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải tổng quan công việc');
        const data = await response.json();
        setTotal(Number(data.total) || 0);
        setInProgress(Number(data.inProgress) || 0);
        setCompletedPercent(Number(data.completedPercent) || 0);
      } catch (err) {
        console.error('Failed to fetch tasks stats from server:', err);
        setTotal(0);
        setInProgress(0);
        setCompletedPercent(0);
        setHasError(true);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
    return eventBus.on('canvas.refreshRequested', (payload: any) => {
      if (payload?.target === 'tasks' || payload?.target === 'current') void fetchStats();
    });
  }, [user]);

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-900">Công việc</h3>
            <p className="text-xs text-neutral-500">Tổng quan tiến độ hiện tại</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/tasks' as any })} className="gap-1 text-xs text-neutral-600 hover:text-neutral-900">
          Xem tất cả <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center text-neutral-400" aria-label="Đang tải tổng quan công việc">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : hasError ? (
        <div role="alert" className="flex min-h-24 items-center gap-2 rounded-lg bg-neutral-50 px-4 text-sm text-neutral-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Chưa thể tải tổng quan công việc. Bạn vẫn có thể mở danh sách Công việc.
        </div>
      ) : total === 0 ? (
        <div className="min-h-24 rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-sm text-neutral-500">
          Chưa có công việc nào. Khi có dữ liệu, tổng quan tiến độ sẽ xuất hiện tại đây.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-neutral-50 p-3">
            <span className="text-xs text-neutral-500">Tổng số</span>
            <div className="mt-1 text-xl font-semibold text-neutral-900">{total}</div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3">
            <span className="text-xs text-neutral-500">Đang thực hiện</span>
            <div className="mt-1 text-xl font-semibold text-neutral-900">{inProgress}</div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3">
            <span className="text-xs text-neutral-500">Hoàn thành</span>
            <div className="mt-1 text-xl font-semibold text-neutral-900">{completedPercent}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
