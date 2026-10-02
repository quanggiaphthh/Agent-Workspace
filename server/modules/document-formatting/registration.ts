import { createHash } from 'crypto';
import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { FileDomainError, UserFileService } from '../../core/files/UserFileService';
import { sanitizeDisplayFilename } from '../../core/files/filePolicy';
import { userFileService } from '../../core/files/firebaseFileStores';
import { DocumentInspectionSchema, DocumentProcessorClient, DocumentProcessorError, ProcessorAlignmentSchema } from '../../core/documents/documentProcessorClient';
import type { CapabilityDescriptor } from '../../../shared/contracts/capability';
import type { ModuleMetadata } from '../../core/modules/moduleCatalog';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';

const FileIdSchema = z.string().trim().min(1).max(128);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i);
const ParagraphIdSchema = z.string().regex(/^p[1-9][0-9]{0,8}$/);
const InspectInputSchema = z.object({ fileId: FileIdSchema }).strict();
const ApplyInputSchema = z.object({
  fileId: FileIdSchema,
  sourceSha256: Sha256Schema,
  paragraphId: ParagraphIdSchema,
  expectedBefore: ProcessorAlignmentSchema,
  desiredAfter: ProcessorAlignmentSchema,
}).strict().refine((input) => input.expectedBefore !== input.desiredAfter, {
  message: 'The requested alignment must change the current value.',
});

const FileDescriptorSchema = z.object({
  fileId: z.string().max(128),
  originalName: z.string().max(255),
  mimeType: z.literal(DOCX_MIME_TYPE),
  sizeBytes: z.number().int().nonnegative().max(MAX_FILE_BYTES),
  status: z.literal('ready'),
  createdAt: z.string().nullable(),
}).strict();

const InspectOutputSchema = z.object({
  sourceFileId: z.string().max(128),
  inspection: DocumentInspectionSchema,
}).strict();

const ApplyOutputSchema = z.object({
  success: z.literal(true),
  sourceFileId: z.string().max(128),
  outputFile: FileDescriptorSchema,
  changeManifest: z.object({
    property: z.literal('paragraph.alignment'),
    paragraphId: ParagraphIdSchema,
    before: ProcessorAlignmentSchema,
    after: ProcessorAlignmentSchema,
    sourceSha256: Sha256Schema,
    outputSha256: Sha256Schema,
    appliedAt: z.string().datetime(),
    summary: z.string().max(160),
  }).strict(),
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
};

type ProcessorClient = Pick<DocumentProcessorClient, 'inspect' | 'applyAlignment'>;
type FileService = Pick<UserFileService, 'readBytes' | 'store'>;
export type DocumentFormattingDependencies = { files?: FileService; processor?: ProcessorClient };

class DocumentCapabilityError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function safeCapabilityError(code: string, message: string): Error {
  return new DocumentCapabilityError(code, message);
}

function preserveSafeFailure(error: unknown): never {
  if (error instanceof FileDomainError || error instanceof DocumentProcessorError || error instanceof DocumentCapabilityError) throw error;
  throw safeCapabilityError('DOCUMENT_PROCESSING_FAILED', 'Document processing failed safely.');
}

function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

async function readCanonicalDocx(files: FileService, ownerId: string, fileId: string, signal?: AbortSignal) {
  const { file, bytes } = await files.readBytes(ownerId, fileId, MAX_FILE_BYTES, signal);
  if (file.mimeType !== DOCX_MIME_TYPE || !file.originalName.toLowerCase().endsWith('.docx'))
    throw new FileDomainError('FILE_TYPE_MISMATCH', 415, 'The selected file is not a DOCX document.');
  if (!Buffer.isBuffer(bytes) || bytes.length !== file.sizeBytes || bytes.length > MAX_FILE_BYTES)
    throw new FileDomainError('FILE_INTEGRITY_FAILED', 503, 'The canonical DOCX file could not be verified.');
  return { file, bytes };
}

export function createDocumentFormattingCapabilities(dependencies: DocumentFormattingDependencies = {}): CapabilityDescriptor<any, any>[] {
  const files = dependencies.files ?? userFileService;
  const processor = dependencies.processor;

  return [
    {
      id: 'document.inspect',
      moduleId: 'document-formatting',
      description: 'Inspect a DOCX already stored in the owner-bound file service. Returns deterministic package safety and direct paragraph alignment data; makes no legal-compliance claim.',
      inputSchema: InspectInputSchema,
      outputSchema: InspectOutputSchema,
      risk: 'low' as const,
      sideEffect: 'none' as const,
      confirmationPolicy: 'none' as const,
      permissions: ['files.read'],
      execute: async (input: z.infer<typeof InspectInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
          const ownerId = context.user?.id;
          if (!ownerId) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');
          const { file, bytes } = await readCanonicalDocx(files, ownerId, input.fileId, context.abortSignal);
          const client = processor ?? new DocumentProcessorClient();
          const inspection = await client.inspect(bytes, context.abortSignal);
          if (inspection.sourceSha256 !== sha256(bytes))
            throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor source digest did not match the canonical file.');
          return { sourceFileId: file.fileId, inspection };
        } catch (error) { return preserveSafeFailure(error); }
      },
    },
    {
      id: 'document.applyAlignment',
      moduleId: 'document-formatting',
      description: 'Apply exactly one user-confirmed direct paragraph alignment change to an owner-authorized DOCX. Always creates a new canonical fileId and preserves the source.',
      inputSchema: ApplyInputSchema,
      outputSchema: ApplyOutputSchema,
      risk: 'medium' as const,
      sideEffect: 'mutation' as const,
      confirmationPolicy: 'required' as const,
      permissions: ['files.read', 'files.write'],
      effects: ['Creates a new DOCX artifact after applying one confirmed direct paragraph alignment change.'],
      execute: async (input: z.infer<typeof ApplyInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
        const ownerId = context.user?.id;
        if (!ownerId) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');
        const { file: sourceFile, bytes: sourceBytes } = await readCanonicalDocx(files, ownerId, input.fileId, context.abortSignal);
        const actualSourceSha256 = sha256(sourceBytes);
        if (actualSourceSha256 !== input.sourceSha256.toLowerCase())
          throw safeCapabilityError('STALE_DOCUMENT', 'The DOCX source changed after inspection.');

        const client = processor ?? new DocumentProcessorClient();
        const applied = await client.applyAlignment({
          bytes: sourceBytes,
          sourceSha256: actualSourceSha256,
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

        const reloadedSource = await files.readBytes(ownerId, sourceFile.fileId, MAX_FILE_BYTES, context.abortSignal);
        if (sha256(reloadedSource.bytes) !== actualSourceSha256)
          throw safeCapabilityError('SOURCE_IMMUTABILITY_VIOLATION', 'The source DOCX changed during processing.');

        const baseName = sourceFile.originalName.replace(/\.docx$/i, '') || 'document';
        const outputName = sanitizeDisplayFilename(`${baseName}-formatted.docx`);
        const appliedAt = new Date().toISOString();
        const summary = `Direct paragraph alignment changed from ${input.expectedBefore} to ${input.desiredAfter}.`;
        const outputFile = await files.store(ownerId, {
          originalName: outputName,
          mimeType: DOCX_MIME_TYPE,
          bytes: applied.bytes,
          avoidFileId: sourceFile.fileId,
          signal: context.abortSignal,
        });

        return {
          success: true as const,
          sourceFileId: sourceFile.fileId,
          outputFile: {
            fileId: outputFile.fileId,
            originalName: outputFile.originalName,
            mimeType: outputFile.mimeType,
            sizeBytes: outputFile.sizeBytes,
            status: outputFile.status,
            createdAt: outputFile.createdAt,
          },
          changeManifest: {
            property: 'paragraph.alignment' as const,
            paragraphId: input.paragraphId,
            before: input.expectedBefore,
            after: input.desiredAfter,
            sourceSha256: actualSourceSha256,
            outputSha256: applied.sha256,
            appliedAt,
            summary,
          },
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
