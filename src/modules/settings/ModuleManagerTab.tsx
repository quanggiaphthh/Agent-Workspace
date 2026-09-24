import React, { useEffect, useState } from 'react';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { ModuleManifest } from '../../../shared/contracts/module';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { LockKeyhole, Power, RotateCcw } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

export function ModuleManagerTab() {
  const [modules, setModules] = useState<ModuleManifest[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<{ moduleId: string; message: string } | null>(null);

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
    const isCore = manifest.id === 'home' || manifest.id === 'settings';
    if (isCore || toggling) return;

    if (isCurrentlyEnabled) {
      const confirmed = window.confirm(
        `Tắt ${manifest.meta.name}? Module này sẽ tạm ẩn khỏi ứng dụng, nhưng dữ liệu đã lưu vẫn được giữ nguyên.`
      );
      if (!confirmed) return;
    }

    setToggleError(null);
    try {
      setToggling(manifest.id);
      await moduleRegistry.setEnabled(manifest.id, !isCurrentlyEnabled, async () => {
        const res = await authFetch(`/api/modules/${manifest.id}/toggle`, { method: 'POST' });
        if (!res.ok) throw new Error('Không thể cập nhật trạng thái module.');
      });

      refreshList();
      eventBus.emit('notification.show', {
        message: isCurrentlyEnabled
          ? `Đã tắt ${manifest.meta.name}. Dữ liệu đã lưu vẫn được giữ nguyên.`
          : `Đã bật ${manifest.meta.name}.`,
        type: isCurrentlyEnabled ? 'warning' : 'success',
      });
    } catch {
      setToggleError({
        moduleId: manifest.id,
        message: 'Không thể cập nhật lúc này. Trạng thái trước đó vẫn được giữ nguyên.',
      });
    } finally {
      setToggling(null);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="module-settings-title">
      <div>
        <h2 id="module-settings-title" className="text-base font-semibold text-neutral-900">Module</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Bật hoặc tắt các chức năng đã có sẵn. Tắt một module không xóa dữ liệu của module đó.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {modules.map(mod => {
          const enabled = moduleRegistry.isEnabled(mod.id);
          const isCore = mod.id === 'home' || mod.id === 'settings';
          const isUpdating = toggling === mod.id;
          const error = toggleError?.moduleId === mod.id ? toggleError.message : null;

          return (
            <Card key={mod.id} className="border-neutral-200 bg-white">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-neutral-900">{mod.meta.name}</span>
                    <Badge variant={enabled ? 'success' : 'secondary'} className="text-[10px]">
                      {isCore ? 'Luôn bật' : enabled ? 'Đang bật' : 'Đang tắt'}
                    </Badge>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {mod.meta.description || 'Chức năng có sẵn trong ứng dụng.'}
                  </p>
                  {isCore && (
                    <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                      Thành phần cốt lõi cần thiết để ứng dụng hoạt động.
                    </p>
                  )}
                  {error && (
                    <div className="flex flex-wrap items-center gap-2 pt-1" role="alert">
                      <span className="text-xs text-red-700">{error}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(mod)}
                        disabled={Boolean(toggling)}
                        className="h-7 text-xs gap-1"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Thử lại
                      </Button>
                    </div>
                  )}
                </div>

                <Button
                  variant={enabled ? (isCore ? 'secondary' : 'outline') : 'default'}
                  size="sm"
                  disabled={isCore || Boolean(toggling)}
                  onClick={() => handleToggle(mod)}
                  aria-label={isCore ? `${mod.meta.name}: luôn bật` : `${enabled ? 'Tắt' : 'Bật'} ${mod.meta.name}`}
                  className="text-xs gap-1.5 shrink-0"
                >
                  {isCore ? (
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Power className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isCore ? 'Luôn bật' : isUpdating ? 'Đang cập nhật…' : enabled ? 'Tắt' : 'Bật'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
