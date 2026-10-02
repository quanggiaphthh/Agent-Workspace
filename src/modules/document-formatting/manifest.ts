import type { ModuleManifest } from '../../../shared/contracts/module';

/** Candidate module shell; route and full UI are intentionally deferred. */
export const documentFormattingManifest: ModuleManifest = {
  id: 'document-formatting',
  version: '0.1.0-candidate',
  meta: {
    name: 'Định dạng văn bản',
    description: 'Inspect and create a verified DOCX copy using the canonical file service.',
    icon: 'FileText',
    order: 4,
  },
  routes: [],
  permissions: ['files.read', 'files.write'],
};
