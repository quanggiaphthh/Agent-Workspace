import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { DashboardWidgetContribution } from '../../../shared/contracts/module';
import { useContextStore } from '../../core/context/contextStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { Layers, Bot, ShieldCheck, ArrowRight, Activity } from 'lucide-react';

export function HomeModule() {
  const [widgets, setWidgets] = useState<DashboardWidgetContribution[]>([]);
  const navigate = useNavigate();

  const loadWidgets = () => {
    setWidgets(moduleRegistry.getWidgets());
  };

  useEffect(() => {
    loadWidgets();
    const unsub1 = eventBus.on('module.statusChanged', loadWidgets);
    const unsub2 = eventBus.on('modules.synced', loadWidgets);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="rounded-xl border border-neutral-200/80 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 text-neutral-200 text-xs font-medium">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Giao diện Hệ thống — Kiến trúc Phân hệ V1.0</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Giao diện trung tâm & Trung tâm Trợ lý
            </h1>
            <p className="text-sm text-neutral-300 max-w-2xl leading-relaxed">
              Các phân hệ nghiệp vụ hoạt động độc lập, trao đổi thông tin qua các định nghĩa năng lực, hợp đồng dữ liệu và sự kiện hệ thống. Trợ lý AI điều phối các hành động thông qua các năng lực đã được xác thực.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {moduleRegistry.listEnabled().filter(m => m.id !== 'home').map(m => (
              <Button
                key={m.id}
                variant="outline"
                onClick={() => navigate({ to: moduleRegistry.getPrimaryRoute(m.id) as any })}
                className="border-neutral-600 text-neutral-200 bg-neutral-800/80 hover:bg-neutral-700 font-medium"
              >
                Mở {m.meta.name}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Dynamic Widget Registry Area (Home renders widgets contributed by enabled modules) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Tiện ích phân hệ ({widgets.length})
          </h2>
          <span className="text-xs text-neutral-400">
            Các tiện ích tự động hiển thị/ẩn đi khi trạng thái phân hệ thay đổi
          </span>
        </div>

        {widgets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {widgets.map(widget => {
              const WidgetComponent = widget.component;
              return (
                <div key={widget.id} className={widget.width === 'full' ? 'md:col-span-2' : ''}>
                  <WidgetComponent />
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed p-8 text-center text-neutral-500 text-sm">
            Hiện chưa có tiện ích nào. Các phân hệ được kích hoạt có thể đăng ký tiện ích thông qua tệp cấu hình.
          </Card>
        )}
      </div>

      {/* Architectural Principles Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-neutral-200 bg-white">
          <CardHeader>
            <div className="h-8 w-8 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-800 mb-2">
              <Layers className="h-4 w-4" />
            </div>
            <CardTitle>Cô lập phân hệ tuyệt đối</CardTitle>
            <CardDescription>Không nhập thư viện chéo giữa các phân hệ</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-neutral-600 leading-relaxed">
            Các phân hệ khai báo menu, đường dẫn, tiện ích và năng lực qua tệp cấu hình. Nếu một phân hệ bị tắt, tất cả các thành phần liên quan sẽ ngay lập tức không khả dụng.
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white">
          <CardHeader>
            <div className="h-8 w-8 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-800 mb-2">
              <Bot className="h-4 w-4" />
            </div>
            <CardTitle>Không can thiệp giao diện trực tiếp</CardTitle>
            <CardDescription>Chỉ thực thi qua các năng lực được định nghĩa</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-neutral-600 leading-relaxed">
            Trợ lý không thao tác trực tiếp trên giao diện. Nó gọi các năng lực được định nghĩa sẵn (ví dụ: tạo mục công việc), và giao diện sẽ tự cập nhật theo sự thay đổi của dữ liệu.
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white">
          <CardHeader>
            <div className="h-8 w-8 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-800 mb-2">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <CardTitle>An toàn cho hành động rủi ro cao</CardTitle>
            <CardDescription>Xác nhận từ người dùng</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-neutral-600 leading-relaxed">
            Rủi ro thấp (tìm kiếm, đọc) chạy trực tiếp. Rủi ro trung bình cần kiểm tra quyền. Các hành động rủi ro cao (xóa) bắt buộc phải có xác nhận từ người dùng trước khi thực hiện.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
