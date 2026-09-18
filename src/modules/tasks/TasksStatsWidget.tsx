import React, { useState, useEffect } from 'react';
import { CheckSquare, ArrowUpRight, Loader2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

export function TasksStatsWidget() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [total, setTotal] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [completedPercent, setCompletedPercent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) {
        setTotal(0);
        setInProgress(0);
        setCompletedPercent(0);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await authFetch('/api/tasks/stats');
        if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải thống kê nhiệm vụ');
        const data = await response.json();
        setTotal(Number(data.total) || 0);
        setInProgress(Number(data.inProgress) || 0);
        setCompletedPercent(Number(data.completedPercent) || 0);
      } catch (err) {
        console.error('Failed to fetch tasks stats from server:', err);
        setTotal(0);
        setInProgress(0);
        setCompletedPercent(0);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [user]);

  return (
    <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Nhiệm vụ & Công việc (Cloud)</h3>
            <p className="text-[11px] text-neutral-500">Đồng bộ qua API server có kiểm soát quyền</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/tasks' as any })}
          className="text-xs text-neutral-600 hover:text-neutral-900 gap-1"
        >
          Chi tiết <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <span className="text-[10px] text-neutral-500 font-medium">Tổng số task</span>
              <div className="text-lg font-bold text-neutral-900 mt-0.5">{total}</div>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
              <span className="text-[10px] text-amber-700 font-medium">Đang thực hiện</span>
              <div className="text-lg font-bold text-amber-800 mt-0.5">{inProgress}</div>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <span className="text-[10px] text-emerald-700 font-medium">Hoàn thành</span>
              <div className="text-lg font-bold text-emerald-800 mt-0.5">{completedPercent}%</div>
            </div>
          </div>

          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-500 rounded-full"
              style={{ width: `${completedPercent}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
