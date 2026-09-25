import { ModuleManifest } from '../../../shared/contracts/module';
import { TasksModule } from './TasksModule';
import { TasksStatsWidget } from './TasksStatsWidget';

export const tasksManifest: ModuleManifest = {
  id: 'tasks',
  version: '1.0.0',
  meta: {
    name: 'Công việc',
    description: 'Theo dõi và sắp xếp công việc cá nhân trong một không gian rõ ràng.',
    icon: 'CheckSquare',
    order: 3,
  },
  navigation: [{ id: 'tasks-nav', label: 'Công việc', path: '/tasks', icon: 'CheckSquare', order: 3 }],
  routes: [{ path: '/tasks', component: TasksModule, exact: true }],
  widgets: [{ id: 'tasks-stats', title: 'Tiến độ Công việc', component: TasksStatsWidget, order: 2, width: 'half' }],
  agent: {
    suggestions: [
      { id: 'tasks-overdue', label: 'Rà soát việc quá hạn', prompt: 'Rà soát các công việc đã quá hạn và cho tôi biết việc nào cần xử lý trước.' },
      { id: 'tasks-priority', label: 'Xem việc cần ưu tiên', prompt: 'Xem các công việc hiện tại và đề xuất những việc cần ưu tiên xử lý.' },
      { id: 'tasks-create', label: 'Tạo công việc', prompt: 'Tạo một công việc mới cho tôi.' },
    ],
  },
  permissions: ['tasks.read'],
  lifecycle: {
    onEnable: async () => { console.log('[Module Lifecycle] Tasks module enabled'); },
    onDisable: async () => { console.log('[Module Lifecycle] Tasks module disabled'); },
  },
};
