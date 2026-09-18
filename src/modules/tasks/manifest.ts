import { ModuleManifest } from '../../../shared/contracts/module';
import { TasksModule } from './TasksModule';
import { TasksStatsWidget } from './TasksStatsWidget';

export const tasksManifest: ModuleManifest = {
  id: 'tasks',
  version: '1.0.0',
  meta: {
    name: 'Quản lý Nhiệm vụ',
    description: 'Phân hệ quản lý task và công việc cá nhân, tối ưu hóa hiệu suất với giao diện trực quan.',
    icon: 'CheckSquare',
    order: 3,
  },
  navigation: [
    {
      id: 'tasks-nav',
      label: 'Nhiệm vụ',
      path: '/tasks',
      icon: 'CheckSquare',
      order: 3,
    },
  ],
  routes: [
    {
      path: '/tasks',
      component: TasksModule,
      exact: true,
    },
  ],
  widgets: [
    {
      id: 'tasks-stats',
      title: 'Tiến độ Nhiệm vụ & Công việc',
      component: TasksStatsWidget,
      order: 2,
      width: 'half',
    },
  ],
  permissions: ['tasks.read'],
  lifecycle: {
    onEnable: async () => {
      console.log('[Module Lifecycle] Tasks module enabled');
    },
    onDisable: async () => {
      console.log('[Module Lifecycle] Tasks module disabled');
    },
  },
};
