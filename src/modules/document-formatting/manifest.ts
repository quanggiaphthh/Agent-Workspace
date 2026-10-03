import type { ModuleManifest } from '../../../shared/contracts/module';
import { DocumentFormattingModule } from './DocumentFormattingModule';

export const documentFormattingManifest: ModuleManifest = {
  id: 'document-formatting',
  version: '0.1.0-candidate',
  meta: {
    name: 'Định dạng văn bản',
    description: 'Inspect and create a verified DOCX copy using the canonical file service.',
    icon: 'FileText',
    order: 4,
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
