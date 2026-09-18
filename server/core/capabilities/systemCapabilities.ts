import { z } from 'zod';
import { ServerCapabilityRegistry } from './serverCapabilityRegistry';
import { UserDataService } from '../data/UserDataService';
import { AIConfigSchema } from '../../../shared/contracts/ai';
import { WebSearchService } from '../search/WebSearchService';

export function registerSystemCapabilities() {
  ServerCapabilityRegistry.register({
    id: 'system.memory.add',
    moduleId: 'system',
    description: 'Đề xuất lưu thông tin quan trọng vào bộ nhớ dài hạn của Trợ lý. Ghi nhớ do Agent tạo phải được người dùng phê duyệt trước khi dùng lại.',
    inputSchema: z.object({
      content: z.string().trim().min(1).max(10000),
      category: z.string().trim().min(1).max(100).optional().default('General'),
    }).strict(),
    risk: 'low',
    permissions: ['memory.write'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');
      const memory = await UserDataService.addMemory(user.id, {
        content: input.content,
        category: input.category,
        status: 'pending',
        source: 'Agent đề xuất',
      });
      return {
        success: true,
        memoryId: memory.id,
        status: memory.status,
        requiresApproval: true,
      };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.memory.query',
    moduleId: 'system',
    description: 'Tìm kiếm các ghi nhớ đã được người dùng phê duyệt.',
    inputSchema: z.object({
      query: z.string().trim().max(500).optional(),
      category: z.string().trim().max(100).optional(),
    }).strict(),
    risk: 'low',
    permissions: ['memory.read'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');
      const memories = await UserDataService.listMemories(user.id, {
        status: 'approved',
        query: input.query,
        category: input.category,
        limit: 20,
      });
      return { memories };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.create',
    moduleId: 'tasks',
    description: 'Tạo một nhiệm vụ mới cho người dùng.',
    inputSchema: z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      dueDate: z.string().max(64).optional(),
      category: z.string().trim().max(100).optional(),
    }).strict(),
    risk: 'low',
    permissions: ['tasks.write'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');
      const task = await UserDataService.createTask(user.id, input);
      return { success: true, taskId: task.id, task };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.tasks.list',
    moduleId: 'tasks',
    description: 'Liệt kê danh sách nhiệm vụ hiện có.',
    inputSchema: z.object({
      status: z.enum(['todo', 'in-progress', 'completed', 'all']).default('all'),
    }).strict(),
    risk: 'low',
    permissions: ['tasks.read'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');
      return { tasks: await UserDataService.listTasks(user.id, input.status) };
    },
  });

  ServerCapabilityRegistry.register({
    id: 'system.web.search',
    moduleId: 'system',
    description: 'Tìm kiếm thông tin cập nhật trên web bằng một yêu cầu Gemini Search riêng biệt và trả về nguồn tham khảo.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(1000),
    }).strict(),
    risk: 'low',
    permissions: ['web.search'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');
      const aiConfig = AIConfigSchema.parse(context.appContext?.aiConfig || {});
      return WebSearchService.search(user.id, aiConfig, input.query, context.abortSignal);
    },
  });
}
