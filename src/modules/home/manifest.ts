import { ModuleManifest } from '../../../shared/contracts/module';
import { HomeModule } from './HomeModule';

export const homeManifest: ModuleManifest = {
  id: 'home',
  version: '1.0.0',
  meta: {
    name: 'Trang chủ',
    description: 'Bảng điều khiển trung tâm và tổng hợp các tiện ích.',
    icon: 'LayoutDashboard',
    order: 1,
  },
  navigation: [
    {
      id: 'home-nav',
      label: 'Trang chủ',
      path: '/',
      icon: 'LayoutDashboard',
      order: 1,
    },
  ],
  routes: [
    {
      path: '/',
      component: HomeModule,
      exact: true,
    },
  ],
  capabilities: [],
  widgets: [],
  permissions: [],
};
