import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { UserDataService } from '../../core/data/UserDataService';
import type { ModuleMetadata } from '../../core/modules/moduleCatalog';

const taskSchema = z.object({
  id: z.string().max(256), userId: z.string().max(256), title: z.string().max(300), description: z.string().max(5000),
  status: z.enum(['todo', 'in-progress', 'completed']), priority: z.enum(['low', 'medium', 'high']),
  category: z.string().max(100), dueDate: z.string().max(64), createdAt: z.string().nullable(), updatedAt: z.string().nullable(),
}).strict();

export const tasksModuleMetadata: ModuleMetadata = {
  id: 'tasks',
  name: 'Task Management',
  enabled: true,
  canDisable: true,
  version: '1.0.0',
};

/**
 * Task owns its server metadata and capability descriptors. Registration
 * still terminates at the canonical ServerCapabilityRegistry.
 */
export function registerTasksCapabilities(): void {
  ServerCapabilityRegistry.register({
    id: 'system.tasks.create', moduleId: 'tasks', description: 'Tạo đúng một nhiệm vụ mới cho người dùng hiện tại từ title và các trường tùy chọn; đây là hành động ghi dữ liệu và được bảo vệ idempotency theo tool call.',
    inputSchema: z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(5000).optional(), priority: z.enum(['low', 'medium', 'high']).default('medium'), dueDate: z.string().max(64).optional(), category: z.string().trim().max(100).optional() }).strict(),
    outputSchema: z.object({ success: z.literal(true), taskId: z.string(), task: taskSchema }).strict(),
    risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: ['tasks.write'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      const task = await UserDataService.createTask(user.id, input);
      return { success: true as const, taskId: task.id, task };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.list', moduleId: 'tasks', description: 'Liệt kê tối đa 100 nhiệm vụ của người dùng hiện tại, có thể lọc theo trạng thái todo, in-progress, completed hoặc all.',
    inputSchema: z.object({ status: z.enum(['todo', 'in-progress', 'completed', 'all']).default('all') }).strict(),
    outputSchema: z.object({ tasks: z.array(taskSchema).max(100) }).strict(),
    risk: 'low', sideEffect: 'none', confirmationPolicy: 'none', permissions: ['tasks.read'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      return { tasks: await UserDataService.listTasks(user.id, input.status) };
    },
  });
}

export const tasksServerModule = {
  metadata: tasksModuleMetadata,
  registerCapabilities: registerTasksCapabilities,
};
