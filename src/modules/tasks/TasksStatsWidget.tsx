import React, { useState, useEffect } from 'react';
import { CheckSquare, ArrowUpRight, Loader2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button';
import { auth, db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export function TasksStatsWidget() {
  const navigate = useNavigate();
  const [total, setTotal] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [completedPercent, setCompletedPercent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setTotal(0);
          setInProgress(0);
          setCompletedPercent(0);
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, 'agent_tasks'),
          where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        let tCount = 0;
        let cCount = 0;
        let ipCount = 0;

        querySnapshot.forEach((docSnap) => {
          tCount++;
          const data = docSnap.data();
          if (data.status === 'completed') cCount++;
          if (data.status === 'in-progress') ipCount++;
        });

        setTotal(tCount);
        setInProgress(ipCount);
        setCompletedPercent(tCount > 0 ? Math.round((cCount / tCount) * 100) : 0);
      } catch (err) {
        console.error('Failed to fetch tasks stats from Firestore:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Nhiệm vụ & Công việc (Cloud)</h3>
            <p className="text-[11px] text-neutral-500">Đồng bộ trực tiếp từ Firestore</p>
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
