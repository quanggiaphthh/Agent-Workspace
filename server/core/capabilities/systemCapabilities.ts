import { z } from 'zod';
import { ServerCapabilityRegistry } from './serverCapabilityRegistry';
import { adminFirestore } from '../../lib/firebaseAdmin';

export function registerSystemCapabilities() {
  // Memory: Add
  ServerCapabilityRegistry.register({
    id: 'system.memory.add',
    moduleId: 'system',
    description: 'Lưu trữ thông tin quan trọng vào bộ nhớ dài hạn của Trợ lý.',
    inputSchema: z.object({
      content: z.string(),
      category: z.string().optional().default('General'),
    }),
    risk: 'low',
    permissions: ['memory.write'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');

      const docRef = await adminFirestore.collection('agent_memories').add({
        userId: user.id,
        content: input.content,
        category: input.category,
        createdAt: new Date().toISOString(),
      });

      return { success: true, memoryId: docRef.id };
    },
  });

  // Memory: Query
  ServerCapabilityRegistry.register({
    id: 'system.memory.query',
    moduleId: 'system',
    description: 'Tìm kiếm thông tin đã lưu trong bộ nhớ.',
    inputSchema: z.object({
      query: z.string().optional(),
      category: z.string().optional(),
    }),
    risk: 'low',
    permissions: ['memory.read'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');

      let query = adminFirestore.collection('agent_memories')
        .where('userId', '==', user.id);
      
      if (input.category) {
        query = query.where('category', '==', input.category);
      }

      const snapshot = await query.orderBy('createdAt', 'desc').limit(20).get();
      const memories = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      return { memories };
    },
  });

  // Tasks: Add
  ServerCapabilityRegistry.register({
    id: 'system.tasks.create',
    moduleId: 'system',
    description: 'Tạo một nhiệm vụ mới cho người dùng hoặc cho chính Trợ lý.',
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      dueDate: z.string().optional(),
    }),
    risk: 'low',
    permissions: ['tasks.write'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');

      const docRef = await adminFirestore.collection('agent_tasks').add({
        userId: user.id,
        ...input,
        status: 'todo',
        createdAt: new Date().toISOString(),
      });

      return { success: true, taskId: docRef.id };
    },
  });

  // Tasks: List
  ServerCapabilityRegistry.register({
    id: 'system.tasks.list',
    moduleId: 'system',
    description: 'Liệt kê danh sách các nhiệm vụ hiện có.',
    inputSchema: z.object({
      status: z.enum(['todo', 'in-progress', 'completed', 'all']).default('all'),
    }),
    risk: 'low',
    permissions: ['tasks.read'],
    execute: async (input, context) => {
      const { user } = context;
      if (!user) throw new Error('Unauthorized');

      let query = adminFirestore.collection('agent_tasks')
        .where('userId', '==', user.id);
      
      if (input.status !== 'all') {
        query = query.where('status', '==', input.status);
      }

      const snapshot = await query.orderBy('createdAt', 'desc').get();
      const tasks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      return { tasks };
    },
  });
}
