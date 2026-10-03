import type { ModuleManifest } from '../../../shared/contracts/module';
import { DocumentFormattingModule } from './DocumentFormattingModule';

export const documentFormattingManifest: ModuleManifest = {
  id: 'document-formatting',
  version: '0.1.0-candidate',
  meta: {
    name: 'Định dạng văn bản',
    description: 'Kiểm tra an toàn tài liệu DOCX và tạo bản sao đã xác minh theo hồ sơ định dạng của công ty.',
    icon: 'FileText',
    order: 4,
    // Must mirror the server module metadata default in registration.ts.
    defaultEnabled: false,
  },
  navigation: [{
    id: 'document-formatting-nav',
    label: 'Định dạng văn bản',
    path: '/document-formatting',
    icon: 'FileText',
    order: 40,
  }],
  routes: [{ path: '/document-formatting', component: DocumentFormattingModule }],
  permissions: ['files.read', 'files.write'],
};