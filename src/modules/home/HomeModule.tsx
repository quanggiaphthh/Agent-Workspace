import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bot, BriefcaseBusiness, Settings, ArrowRight } from 'lucide-react';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { DashboardWidgetContribution } from '../../../shared/contracts/module';
import { useContextStore } from '../../core/context/contextStore';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { FileUploadCard } from './FileUploadCard';

export const HOME_OPEN_AGENT_EVENT = 'workspace:open-agent';

type HomeQuickAction = {
  id: 'agent' | 'tasks' | 'settings';
  label: string;
  description: string;
};

export function getHomeQuickActions(): HomeQuickAction[] {
  const actions: HomeQuickAction[] = [
    { id: 'agent', label: 'Mở Trợ lý', description: 'Trao đổi với Trợ lý AI trong bảng làm việc hiện tại.' },
  ];
  if (moduleRegistry.isEnabled('tasks')) {
    actions.push({ id: 'tasks', label: 'Xem Công việc', description: 'Xem và cập nhật danh sách công việc của bạn.' });
  }
  actions.push({ id: 'settings', label: 'Mở Cài đặt', description: 'Điều chỉnh các thiết lập của không gian làm việc.' });
  return actions;
}

export function HomeModule() {
  const [widgets, setWidgets] = useState<DashboardWidgetContribution[]>([]);
  const [quickActions, setQuickActions] = useState<HomeQuickAction[]>([]);
  const navigate = useNavigate();
  const user = useContextStore(state => state.user);

  const loadContributions = () => {
    setWidgets(moduleRegistry.getWidgets(user));
    setQuickActions(getHomeQuickActions());
  };

  useEffect(() => {
    loadContributions();
    const unsub1 = eventBus.on('module.statusChanged', loadContributions);
    const unsub2 = eventBus.on('modules.synced', loadContributions);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const runAction = (action: HomeQuickAction) => {
    if (action.id === 'agent') {
      eventBus.emit(HOME_OPEN_AGENT_EVENT, {});
      return;
    }
    const route = moduleRegistry.getPrimaryRoute(action.id);
    navigate({ to: route as any });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">Không gian làm việc cá nhân</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">Trang chủ</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">
            Tập trung vào công việc cần làm và mở nhanh những công cụ bạn dùng hằng ngày.
          </p>
        </div>
        <Button onClick={() => eventBus.emit(HOME_OPEN_AGENT_EVENT, {})} className="gap-2 self-start sm:self-auto">
          <Bot className="h-4 w-4" />
          Mở Trợ lý
        </Button>
      </section>

      {widgets.length > 0 && (
        <section aria-labelledby="home-attention-title" className="space-y-3">
          <div>
            <h2 id="home-attention-title" className="text-sm font-semibold text-neutral-900">Việc cần chú ý</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Thông tin từ các phần đang bật trong không gian làm việc.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {widgets.map(widget => {
              const WidgetComponent = widget.component;
              return (
                <div key={widget.id} className={widget.width === 'full' ? 'md:col-span-2' : ''}>
                  <WidgetComponent />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="home-actions-title" className="space-y-3">
        <h2 id="home-actions-title" className="text-sm font-semibold text-neutral-900">Truy cập nhanh</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {quickActions.map(action => {
            const Icon = action.id === 'agent' ? Bot : action.id === 'tasks' ? BriefcaseBusiness : Settings;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => runAction(action)}
                className="group flex min-h-28 items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-2xs transition hover:border-neutral-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-neutral-900">
                    {action.label}
                    <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-neutral-500">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="home-files-title" className="space-y-3">
        <div>
          <h2 id="home-files-title" className="text-sm font-semibold text-neutral-900">Tài liệu</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Tải tệp vào không gian làm việc để sử dụng với Trợ lý.</p>
        </div>
        <FileUploadCard />
      </section>
    </div>
  );
}
