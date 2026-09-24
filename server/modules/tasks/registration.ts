import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { UserDataService, isValidTaskDueDate } from '../../core/data/UserDataService';
import type { ModuleMetadata } from '../../core/modules/moduleCatalog';

const taskDueDateSchema = z.string().max(10).refine(isValidTaskDueDate, {
  message: 'dueDate must be YYYY-MM-DD or an empty string.',
});

const taskSchema = z.object({
  id: z.string().max(256), userId: z.string().max(256), title: z.string().max(300), description: z.string().max(5000),
  status: z.enum(['todo', 'in-progress', 'completed']), priority: z.enum(['low', 'medium', 'high']),
  category: z.string().max(100), dueDate: z.string().max(64), createdAt: z.string().nullable(), updatedAt: z.string().nullable(),
}).strict();

const taskUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['todo', 'in-progress', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  dueDate: taskDueDateSchema.optional(),
}).strict().refine((value) => (
  value.title !== undefined ||
  value.description !== undefined ||
  value.status !== undefined ||
  value.priority !== undefined ||
  value.category !== undefined ||
  value.dueDate !== undefined
), { message: 'At least one task field must be updated.' });

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
    inputSchema: z.object({ title: z.string().trim().min(1).max(300), description: z.string().max(5000).optional(), priority: z.enum(['low', 'medium', 'high']).default('medium'), dueDate: taskDueDateSchema.optional(), category: z.string().trim().max(100).optional() }).strict(),
    outputSchema: z.object({ success: z.literal(true), taskId: z.string(), task: taskSchema }).strict(),
    risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: ['tasks.write'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      const task = await UserDataService.createTask(user.id, input);
      return { success: true as const, taskId: task.id, task };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.list', moduleId: 'tasks', description: 'Liệt kê một trang nhiệm vụ theo thứ tự mới nhất. Nếu nextCursor được trả về và cần tìm thêm, tiếp tục gọi với cursor đó; không được kết luận một nhiệm vụ không tồn tại chỉ từ trang đầu.',
    inputSchema: z.object({
      status: z.enum(['todo', 'in-progress', 'completed', 'all']).default('all'),
      limit: z.number().int().min(1).max(100).default(100),
      cursor: z.string().max(4096).optional(),
    }).strict(),
    outputSchema: z.object({ tasks: z.array(taskSchema).max(100), nextCursor: z.string().optional() }).strict(),
    risk: 'low', sideEffect: 'none', confirmationPolicy: 'none', permissions: ['tasks.read'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      return await UserDataService.listTasksPage(user.id, input);
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.search', moduleId: 'tasks', description: 'Phân giải một công việc theo tiêu đề chính xác trên toàn bộ dữ liệu của người dùng. Trả match=unique chỉ khi có đúng một kết quả; nếu ambiguous phải hỏi người dùng chọn rõ công việc trước khi gọi tool cập nhật hoặc xóa. Nếu none, không được tự đoán ID.',
    inputSchema: z.object({ title: z.string().trim().min(1).max(300) }).strict(),
    outputSchema: z.object({
      match: z.enum(['none', 'unique', 'ambiguous']),
      tasks: z.array(taskSchema).max(20),
      truncated: z.boolean(),
    }).strict(),
    risk: 'low', sideEffect: 'none', confirmationPolicy: 'none', permissions: ['tasks.read'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      return await UserDataService.resolveTasksByExactTitle(user.id, input.title);
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.update', moduleId: 'tasks', description: 'Cập nhật một nhiệm vụ đã tồn tại bằng task id đã được phân giải chắc chắn. Khi người dùng chỉ nêu tiêu đề, phải dùng công cụ tìm theo tiêu đề trước; chỉ cập nhật khi kết quả là unique. Nếu ambiguous hoặc none, không tự chọn ID và phải hỏi lại người dùng. Hành động này thay đổi dữ liệu đã lưu và cần người dùng xác nhận.',
    inputSchema: taskUpdateInputSchema,
    outputSchema: z.object({ success: z.literal(true), taskId: z.string(), task: taskSchema }).strict(),
    risk: 'medium', sideEffect: 'mutation', confirmationPolicy: 'required', permissions: ['tasks.write'],
    effects: ['Cập nhật nội dung hoặc trạng thái của một công việc đã lưu.'],
    execute: async (input, context) => {
      const { user } = context; if (!user) throw new Error('Unauthorized');
      const { id, ...patch } = input;
      const task = await UserDataService.updateTask(user.id, id, patch);
      return { success: true as const, taskId: task.id, task };
    },
  });
}

export const tasksServerModule = {
  metadata: tasksModuleMetadata,
  registerCapabilities: registerTasksCapabilities,
};
