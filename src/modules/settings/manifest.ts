import { ModuleManifest } from '../../../shared/contracts/module';
import { SettingsModule } from './SettingsModule';

export const settingsManifest: ModuleManifest = {
  id: 'settings',
  version: '1.0.0',
  meta: {
    name: 'Quản lý Phân hệ & Cài đặt',
    description: 'Quản lý các phân hệ đang hoạt động và nhật ký an toàn hệ thống.',
    icon: 'Sliders',
    order: 3,
  },
  navigation: [
    {
      id: 'settings-nav',
      label: 'Cài đặt',
      path: '/settings',
      icon: 'Sliders',
      order: 3,
    },
  ],
  routes: [
    {
      path: '/settings',
      component: SettingsModule,
      exact: true,
    },
  ],
  capabilities: [],
  widgets: [],
  permissions: ['admin.manage'],
};
