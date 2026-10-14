import type { ModuleManifest } from '../../../shared/contracts/module';
import { DocumentFormattingModule } from './DocumentFormattingModule';

/** The candidate UI remains hidden until an administrator explicitly enables the module. */
export const documentFormattingManifest: ModuleManifest = {
  id: 'document-formatting',
  version: '0.1.0-candidate',
  defaultEnabled: false,
  meta: {
    name: 'Định dạng văn bản',
    description: 'Tự chỉnh khổ giấy và lề trang cho DOCX một phần; các quy tắc khác đang hoàn thiện.',
    icon: 'FileText',
    order: 4,
  },
  navigation: [{ id: 'document-formatting-nav', label: 'Định dạng văn bản', path: '/document-formatting', icon: 'FileText', order: 4 }],
  routes: [{ path: '/document-formatting', component: DocumentFormattingModule, exact: true }],
  permissions: ['files.read', 'files.write'],
};
