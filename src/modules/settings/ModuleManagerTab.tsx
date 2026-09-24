import React, { useEffect, useState } from 'react';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { ModuleManifest } from '../../../shared/contracts/module';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { Check, Shield, Layers, Power, AlertCircle, Sparkles } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

export function ModuleManagerTab() {
  const [modules, setModules] = useState<ModuleManifest[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);

  const refreshList = () => {
    setModules(moduleRegistry.listAll());
  };

  useEffect(() => {
    refreshList();
    const unsub1 = eventBus.on('module.statusChanged', refreshList);
    const unsub2 = eventBus.on('modules.synced', refreshList);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const handleToggle = async (manifest: ModuleManifest) => {
    const isCurrentlyEnabled = moduleRegistry.isEnabled(manifest.id);
    if (manifest.id === 'home' || manifest.id === 'settings') {
      alert(`Phân hệ "${manifest.meta.name}" là thành phần cốt lõi và không thể vô hiệu hóa.`);
      return;
    }

    try {
      setToggling(manifest.id);
      await moduleRegistry.setEnabled(manifest.id, !isCurrentlyEnabled, async () => {
        const res = await authFetch(`/api/modules/${manifest.id}/toggle`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Chuyển đổi trạng thái thất bại');
        }
      });

      refreshList();

      eventBus.emit('notification.show', {
        message: `Phân hệ "${manifest.meta.name}" đã được ${isCurrentlyEnabled ? 'vô hiệu hóa' : 'kích hoạt'}. Menu, đường dẫn và các tính năng đã được cập nhật.`,
        type: isCurrentlyEnabled ? 'warning' : 'success',
      });
    } catch (err: any) {
      alert(err.message || 'Lỗi khi chuyển đổi trạng thái phân hệ');
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-neutral-100 border border-neutral-200 text-xs text-neutral-700 leading-relaxed">
        <strong>Cơ chế Tách biệt Phân hệ:</strong> Khi một phân hệ bị vô hiệu hóa, các liên kết menu, đường dẫn, thành phần trang chủ và khả năng của Trợ lý sẽ được gỡ bỏ ngay lập tức mà không cần thay đổi mã nguồn hệ thống.
      </div>

      <div className="grid grid-cols-1 gap-3">
        {modules.map(mod => {
          const enabled = moduleRegistry.isEnabled(mod.id);
          const isCore = mod.id === 'home' || mod.id === 'settings';

          return (
            <Card key={mod.id} className="border-neutral-200 bg-white">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-900">{mod.meta.name}</span>
                    <span className="font-mono text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                      id: {mod.id}
                    </span>
                    <Badge variant={enabled ? 'success' : 'secondary'} className="text-[10px]">
                      {enabled ? 'Đang hoạt động' : 'Đã tắt'}
                    </Badge>
                    {isCore && (
                      <Badge variant="outline" className="text-[10px] text-neutral-500">
                        Phân hệ hệ thống
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    {mod.meta.description || 'Phân hệ nghiệp vụ độc lập.'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-neutral-500 pt-1">
                    <span>Phiên bản: <strong>{mod.version}</strong></span>
                    <span>•</span>
                    <span>Đường dẫn: <strong>{mod.routes?.length || 0}</strong></span>
                    <span>•</span>
                    <span>Tiện ích: <strong>{mod.widgets?.length || 0}</strong></span>
                    <span>•</span>
                    <span>Quyền hạn: <strong>{mod.permissions?.join(', ') || 'Không có'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant={enabled ? (isCore ? 'secondary' : 'outline') : 'default'}
                    size="sm"
                    disabled={isCore || toggling === mod.id}
                    onClick={() => handleToggle(mod)}
                    className="text-xs gap-1.5"
                  >
                    <Power className={`h-3.5 w-3.5 ${enabled ? 'text-emerald-600' : 'text-neutral-400'}`} />
                    {isCore
                      ? 'Hệ thống (Khóa)'
                      : toggling === mod.id
                      ? 'Đang cập nhật...'
                      : enabled
                      ? 'Vô hiệu hóa'
                      : 'Kích hoạt'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
