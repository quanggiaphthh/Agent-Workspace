import { z } from 'zod';
import { ServerCapabilityRegistry } from './serverCapabilityRegistry';
import { storage } from '../../infrastructure/storage';

async function assertUiTargetModuleAvailable(moduleId: string): Promise<void> {
  await storage.refreshModuleSettings();
  const setting = storage.getData().moduleSettings[moduleId];
  if (!setting) throw new Error('UI target module is unavailable.');
  if (setting.canDisable && !storage.isPersistenceAvailable()) throw new Error('UI target module availability could not be verified.');
  if (!setting.enabled) throw new Error('UI target module is disabled.');
}

export function registerUiCapabilities() {
  ServerCapabilityRegistry.register({
    id: 'ui.openEntity', moduleId: 'ui', description: 'Mở và làm nổi bật một entity đã biết trong module đang khả dụng. Chỉ dùng moduleId/entityType/entityId thực tế; tool không tự tạo hoặc kiểm chứng entity trong backend.',
    inputSchema: z.object({ moduleId: z.string().trim().min(1).max(100), entityType: z.string().trim().min(1).max(100), entityId: z.string().trim().min(1).max(256), label: z.string().trim().max(500).optional() }).strict(),
    outputSchema: z.object({ uiAction: z.literal('openEntity'), entity: z.object({ moduleId: z.string(), entityType: z.string(), entityId: z.string(), label: z.string().optional() }).strict() }).strict(),
    risk: 'low', sideEffect: 'ui-local', confirmationPolicy: 'none', permissions: [],
    execute: async (input) => { await assertUiTargetModuleAvailable(input.moduleId); return { uiAction: 'openEntity' as const, entity: input }; },
  });
  ServerCapabilityRegistry.register({
    id: 'ui.openModule', moduleId: 'ui', description: 'Điều hướng App Shell tới một module hiện có và đang khả dụng; không dùng để mở module bị tắt hoặc không tồn tại.',
    inputSchema: z.object({ moduleId: z.string().trim().min(1).max(100) }).strict(), outputSchema: z.object({ uiAction: z.literal('openModule'), moduleId: z.string() }).strict(),
    risk: 'low', sideEffect: 'ui-local', confirmationPolicy: 'none', permissions: [],
    execute: async (input) => { await assertUiTargetModuleAvailable(input.moduleId); return { uiAction: 'openModule' as const, moduleId: input.moduleId }; },
  });
  ServerCapabilityRegistry.register({
    id: 'ui.refresh', moduleId: 'ui', description: 'Yêu cầu giao diện hiện tại làm mới dữ liệu; target mặc định là current. Đây là UI-local action, không xác nhận dữ liệu backend đã thay đổi.',
    inputSchema: z.object({ target: z.string().trim().min(1).max(100).optional() }).strict(), outputSchema: z.object({ uiAction: z.literal('refresh'), target: z.string() }).strict(),
    risk: 'low', sideEffect: 'ui-local', confirmationPolicy: 'none', permissions: [],
    execute: async (input) => ({ uiAction: 'refresh' as const, target: input.target || 'current' }),
  });
  ServerCapabilityRegistry.register({
    id: 'ui.showNotification', moduleId: 'ui', description: 'Hiển thị một thông báo toast ngắn cho người dùng. Chỉ phản ánh yêu cầu hiển thị UI, không chứng minh một thao tác backend đã thành công.',
    inputSchema: z.object({ message: z.string().trim().min(1).max(1000), type: z.enum(['info', 'success', 'warning', 'error']).default('info') }).strict(),
    outputSchema: z.object({ uiAction: z.literal('showNotification'), notification: z.object({ message: z.string(), type: z.enum(['info', 'success', 'warning', 'error']) }).strict() }).strict(),
    risk: 'low', sideEffect: 'ui-local', confirmationPolicy: 'none', permissions: [],
    execute: async (input) => ({ uiAction: 'showNotification' as const, notification: input }),
  });
}
