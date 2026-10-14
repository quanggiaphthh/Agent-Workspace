import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocxInWorker } from './docxWorkerClient';

describe('DOCX worker in the development server', () => {
  it('starts the source worker and returns a verified formatting result', async () => {
    const source = readFileSync(resolve('server/modules/document-formatting/fixtures/24-vietnamese-rich.docx'));
    const result = await processDocxInWorker('applyAdministrativePageLayout', source);

    expect(result.reopened).toBe(true);
    expect(result.revalidated).toBe(true);
    expect(result.actualChanges.length).toBeGreaterThan(0);
  });
});
