import { ModuleManifest } from '../../../shared/contracts/module';
import { SettingsModule } from './SettingsModule';

export const settingsManifest: ModuleManifest = {
  id: 'settings',
  version: '1.0.0',
  meta: {
    name: 'Cài đặt',
    description: 'Thiết lập Trợ lý AI và các chức năng có sẵn trong ứng dụng.',
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
  permissions: ['settings.read'],
};
