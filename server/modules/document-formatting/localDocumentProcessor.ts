import { createHash } from 'node:crypto';
import {
  DocumentInspectionSchema,
  DocumentProcessorError,
  type DocumentInspectionResult,
  type ProcessorAlignment,
} from '../../core/documents/documentProcessorClient';
import { processDocxInWorker } from './docxWorkerClient';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function mapFailure(error: unknown): never {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : 'PROCESSING_FAILED';
  throw new DocumentProcessorError(code, 'The DOCX could not be processed safely.');
}

/** Local implementation of the existing document processor contract. */
export class LocalDocumentProcessor {
  async formatPage(bytes: Buffer, signal?: AbortSignal): Promise<{
    bytes: Buffer;
    sha256: string;
    changes: Array<{ property: string; beforeTwips: number; afterTwips: number; section?: number }>;
    bodySummary: { formattedParagraphs: number; unclassifiedParagraphs: number;
      adjustments: { font: number; size: number; spacing: number; indent: number; alignment: number } };
  }> {
    try {
      const result = await processDocxInWorker('applyAdministrativePageLayout', bytes, {}, { signal });
      const output = Buffer.from(result.bytes);
      if (!result.reopened || !result.revalidated || result.sourceSha256 !== sha256(bytes) ||
          result.outputSha256 !== sha256(output) || !Array.isArray(result.actualChanges) ||
          result.actualChanges.length > 48) {
        throw new DocumentProcessorError('OUTPUT_INTEGRITY_FAILED', 'The DOCX output could not be verified.');
      }
      const changes = result.actualChanges.map((item: { property: string; beforeTwips: number; afterTwips: number; section?: number }) => ({
        property: item.property, beforeTwips: item.beforeTwips, afterTwips: item.afterTwips,
        ...(item.section === undefined ? {} : { section: item.section }),
      }));
      return { bytes: output, sha256: result.outputSha256, changes, bodySummary: result.bodySummary };
    } catch (error) { return mapFailure(error); }
  }

  async inspect(bytes: Buffer, signal?: AbortSignal): Promise<DocumentInspectionResult> {
    try {
      const result = await processDocxInWorker('inspect', bytes, {}, { signal });
      return DocumentInspectionSchema.parse({
        sourceSha256: result.sourceSha256,
        profile: result.profile,
        safeToMutate: result.safeToMutate,
        packagePolicy: result.packagePolicy,
        paragraphs: result.paragraphs.map((paragraph: { paragraphId: string; text: string; directAlignment: ProcessorAlignment | null }) => ({
          paragraphId: paragraph.paragraphId,
          text: paragraph.text,
          directAlignment: paragraph.directAlignment,
          issueId: null,
        })),
        paragraphsTruncated: result.paragraphsTruncated,
        diagnostics: result.diagnostics,
      });
    } catch (error) { return mapFailure(error); }
  }

  async applyAlignment(input: {
    bytes: Buffer;
    sourceSha256: string;
    paragraphId: string;
    expectedBefore: ProcessorAlignment;
    desiredAfter: ProcessorAlignment;
  }, signal?: AbortSignal): Promise<{ bytes: Buffer; sha256: string }> {
    try {
      const result = await processDocxInWorker('applyAlignment', input.bytes, {
        sourceSha256: input.sourceSha256,
        paragraphId: input.paragraphId,
        expectedBefore: input.expectedBefore,
        desiredAfter: input.desiredAfter,
      }, { signal });
      const bytes = Buffer.from(result.bytes);
      if (sha256(bytes) !== result.outputSha256 || !result.reopened || !result.revalidated)
        throw new DocumentProcessorError('OUTPUT_INTEGRITY_FAILED', 'The DOCX output could not be verified.');
      return { bytes, sha256: result.outputSha256 };
    } catch (error) { return mapFailure(error); }
  }
}
