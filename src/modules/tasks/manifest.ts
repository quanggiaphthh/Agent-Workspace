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
  navigation: [
    {
      id: 'tasks-nav',
      label: 'Công việc',
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
      title: 'Tiến độ Công việc',
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
