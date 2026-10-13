import { createHash } from 'crypto';
import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { SafeCapabilityExecutionError } from '../../core/capabilities/SafeCapabilityExecutionError';
import {
  DocumentProcessorClient,
  DocumentProcessorError,
  ProcessorAlignmentSchema,
} from '../../core/documents/documentProcessorClient';
import { currentRequestScopedDocument } from '../../core/documents/requestScopedDocument';
import type { CapabilityDescriptor } from '../../../shared/contracts/capability';
import type { ModuleMetadata } from '../../core/modules/moduleCatalog';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { isDocumentFormattingReleaseReady } from './releaseGate';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ParagraphIdSchema = z.string().regex(/^p[1-9][0-9]{0,8}$/);
const InspectInputSchema = z.object({
  sourceSha256: Sha256Schema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  mimeType: z.literal(DOCX_MIME_TYPE),
}).strict();
const ApplyInputSchema = z.object({
  sourceSha256: Sha256Schema,
  paragraphId: ParagraphIdSchema,
  expectedBefore: ProcessorAlignmentSchema,
  desiredAfter: ProcessorAlignmentSchema,
}).strict().refine((input) => input.expectedBefore !== input.desiredAfter, {
  message: 'The requested alignment must change the current value.',
});

const InspectOutputSchema = z.object({
  sourceSha256: Sha256Schema,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  profile: z.literal('generic-direct-alignment-spike'),
  safeToMutate: z.boolean(),
  packagePolicy: z.enum(['NORMAL', 'GUARDED', 'AUDIT_ONLY', 'PROHIBITED']),
  paragraphCount: z.number().int().nonnegative().max(250),
  paragraphsTruncated: z.boolean(),
  diagnosticCodes: z.array(z.string().max(64)).max(32),
}).strict();

const ApplyOutputSchema = z.object({
  sourceSha256: Sha256Schema,
  outputSha256: Sha256Schema,
  outputSizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  paragraphId: ParagraphIdSchema,
  before: ProcessorAlignmentSchema,
  after: ProcessorAlignmentSchema,
  verification: z.object({
    reopened: z.literal(true),
    revalidated: z.literal(true),
    sourceUnchanged: z.literal(true),
    outputInspectionPassed: z.literal(true),
  }).strict(),
}).strict();

export const documentFormattingModuleMetadata: ModuleMetadata = {
  id: 'document-formatting',
  name: 'Định dạng văn bản',
  enabled: false,
  canDisable: true,
  version: '0.1.0-candidate',
  isReleaseReady: isDocumentFormattingReleaseReady,
};

type ProcessorClient = Pick<DocumentProcessorClient, 'inspect' | 'applyAlignment'>;
export type DocumentFormattingDependencies = { processor?: ProcessorClient };

function safeCapabilityError(code: string, message: string): Error {
  return new SafeCapabilityExecutionError(code, message);
}

function preserveSafeFailure(error: unknown): never {
  if (error instanceof SafeCapabilityExecutionError) throw error;
  if (error instanceof DocumentProcessorError) throw new SafeCapabilityExecutionError(error.code, error.message);
  throw safeCapabilityError('DOCUMENT_PROCESSING_FAILED', 'Document processing failed safely.');
}

function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

function requireBoundDocument(sourceSha256: string, expectedSize?: number) {
  const request = currentRequestScopedDocument();
  if (!request || !Buffer.isBuffer(request.sourceBytes))
    throw safeCapabilityError('DOCUMENT_REQUEST_CONTEXT_REQUIRED', 'A request-scoped DOCX binary is required.');
  if (request.sourceBytes.length === 0 || request.sourceBytes.length > MAX_FILE_BYTES ||
      (expectedSize !== undefined && request.sourceBytes.length !== expectedSize))
    throw safeCapabilityError('INVALID_INPUT', 'The request-scoped DOCX binary is invalid.');
  const actualSha256 = sha256(request.sourceBytes);
  if (actualSha256 !== sourceSha256 || actualSha256 !== request.sourceSha256)
    throw safeCapabilityError('STALE_DOCUMENT', 'The DOCX source changed after inspection.');
  return request;
}

export function createDocumentFormattingCapabilities(dependencies: DocumentFormattingDependencies = {}): CapabilityDescriptor<any, any>[] {
  const processor = dependencies.processor;

  return [
    {
      id: 'document.inspect',
      moduleId: 'document-formatting',
      description: 'Inspect one request-scoped DOCX and return deterministic safety and direct paragraph alignment data through the document route. Makes no legal-compliance claim and stores no document content.',
      inputSchema: InspectInputSchema,
      outputSchema: InspectOutputSchema,
      risk: 'low' as const,
      sideEffect: 'none' as const,
      confirmationPolicy: 'none' as const,
      allowedSources: ['rest'],
      permissions: ['files.read'],
      execute: async (input: z.infer<typeof InspectInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
          if (!context.user?.id) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');
          const request = requireBoundDocument(input.sourceSha256, input.sizeBytes);
          const client = processor ?? new DocumentProcessorClient();
          const inspection = await client.inspect(request.sourceBytes, context.abortSignal);
          if (inspection.sourceSha256 !== input.sourceSha256)
            throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor source digest did not match.');
          request.inspection = inspection;
          return {
            sourceSha256: inspection.sourceSha256,
            sizeBytes: input.sizeBytes,
            profile: inspection.profile,
            safeToMutate: inspection.safeToMutate,
            packagePolicy: inspection.packagePolicy,
            paragraphCount: inspection.paragraphs.length,
            paragraphsTruncated: inspection.paragraphsTruncated,
            diagnosticCodes: inspection.diagnostics.map(diagnostic => diagnostic.code),
          };
        } catch (error) { return preserveSafeFailure(error); }
      },
    },
    {
      id: 'document.applyAlignment',
      moduleId: 'document-formatting',
      description: 'After server-authoritative confirmation, apply exactly one direct paragraph alignment change to request-scoped DOCX bytes and return the binary only through the document route. Does not persist the artifact.',
      inputSchema: ApplyInputSchema,
      outputSchema: ApplyOutputSchema,
      risk: 'medium' as const,
      sideEffect: 'mutation' as const,
      confirmationPolicy: 'required' as const,
      allowedSources: ['rest'],
      permissions: ['files.read', 'files.write'],
      effects: ['Applies one confirmed direct paragraph alignment change to request-scoped DOCX bytes.'],
      execute: async (input: z.infer<typeof ApplyInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
          if (!context.user?.id) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');
          const request = requireBoundDocument(input.sourceSha256);
          const client = processor ?? new DocumentProcessorClient();
          const applied = await client.applyAlignment({
            bytes: request.sourceBytes,
            sourceSha256: input.sourceSha256,
            paragraphId: input.paragraphId,
            expectedBefore: input.expectedBefore,
            desiredAfter: input.desiredAfter,
          }, context.abortSignal);
          if (applied.sha256 !== sha256(applied.bytes))
            throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor output digest did not match.');

          const outputInspection = await client.inspect(applied.bytes, context.abortSignal);
          const outputParagraph = outputInspection.paragraphs.find(paragraph => paragraph.paragraphId === input.paragraphId);
          if (!outputInspection.safeToMutate || outputInspection.packagePolicy !== 'NORMAL' ||
              outputInspection.sourceSha256 !== applied.sha256 || outputParagraph?.directAlignment !== input.desiredAfter)
            throw safeCapabilityError('OUTPUT_INTEGRITY_FAILED', 'The generated DOCX failed output revalidation.');
          if (sha256(request.sourceBytes) !== input.sourceSha256)
            throw safeCapabilityError('SOURCE_IMMUTABILITY_VIOLATION', 'The source DOCX changed during processing.');
          if (applied.bytes.length === 0 || applied.bytes.length > MAX_FILE_BYTES)
            throw safeCapabilityError('OUTPUT_TOO_LARGE', 'The generated DOCX exceeds the allowed size.');

          request.output = { bytes: applied.bytes, sha256: applied.sha256 };
          return {
            sourceSha256: input.sourceSha256,
            outputSha256: applied.sha256,
            outputSizeBytes: applied.bytes.length,
            paragraphId: input.paragraphId,
            before: input.expectedBefore,
            after: input.desiredAfter,
            verification: { reopened: true as const, revalidated: true as const, sourceUnchanged: true as const, outputInspectionPassed: true as const },
          };
        } catch (error) { return preserveSafeFailure(error); }
      },
    },
  ];
}

export function registerDocumentFormattingCapabilities(): void {
  createDocumentFormattingCapabilities().forEach(capability => ServerCapabilityRegistry.register(capability));
}

export const documentFormattingServerModule = {
  metadata: documentFormattingModuleMetadata,
  registerCapabilities: registerDocumentFormattingCapabilities,
};
