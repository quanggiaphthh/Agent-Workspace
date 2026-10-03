import { createHash } from 'crypto';
import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { CapabilityExecutionIdempotencyService } from '../../core/capabilities/CapabilityExecutionService';
import { FileDomainError, UserFileService } from '../../core/files/UserFileService';
import { sanitizeDisplayFilename } from '../../core/files/filePolicy';
import { userFileService } from '../../core/files/firebaseFileStores';
import { DocumentInspectionSchema, DocumentProcessorClient, DocumentProcessorError, ProcessorAlignmentSchema } from '../../core/documents/documentProcessorClient';
import type { CapabilityDescriptor } from '../../../shared/contracts/capability';
import type { ModuleMetadata } from '../../core/modules/moduleCatalog';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';

const FileIdSchema = z.string().trim().min(1).max(128);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i);
const InspectInputSchema = z.object({
  fileId: FileIdSchema,
  /**
   * Owner-confirmed document type. When present the whole scoped evaluation
   * (rule subset, findings, mutable targets) is rebuilt for that type instead of
   * the detector's suggestion.
   */
  confirmedDocumentTypeKey: z.string().trim().min(1).max(32).optional(),
}).strict();

const ApplyInputSchema = z.object({
  fileId: FileIdSchema,
  sourceSha256: Sha256Schema,
  /** Profile property to change, for example `section.margin_right_mm`. */
  property: z.string().trim().min(1).max(64),
  /** Paragraph id (`p1`) or section id (`s1`) the property belongs to. */
  targetId: z.string().trim().min(1).max(128),
  /** Document type the user confirmed, bound from the inspection. */
  documentTypeKey: z.string().trim().min(1).max(32),
  /** Exact value the inspection reported; a mismatch is a stale confirmation. */
  expectedBefore: z.string().trim().min(1).max(64),
  desiredAfter: z.string().trim().min(1).max(64),
  /** Profile binding the inspection was issued under. */
  profileId: z.string().trim().min(1).max(64),
  profileDigest: Sha256Schema,
  ruleId: z.string().trim().min(1).max(128),
}).strict().refine((input) => input.expectedBefore !== input.desiredAfter, {
  message: 'The requested change must alter the current value.',
});

/**
 * Marker payload written by the earlier direct-alignment build. It is never
 * executed; it only identifies a durable execution record for reconciliation.
 *
 * The alignment enum reuses the processor's original schema verbatim. The stored
 * execution identity was hashed from exactly those wire values, so re-declaring
 * or normalising them here would change the input hash and make a genuine record
 * unfindable.
 */
const LegacyApplyInputSchema = z.object({
  fileId: FileIdSchema,
  sourceSha256: Sha256Schema,
  paragraphId: z.string().regex(/^p[1-9][0-9]{0,8}$/),
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
    property: z.string().max(64),
    targetId: z.string().max(128),
    propertyLabelVi: z.string().max(80),
    unit: z.string().max(16),
    before: z.string().max(64),
    after: z.string().max(64),
    ruleId: z.string().max(128),
    sourceSha256: Sha256Schema,
    outputSha256: Sha256Schema,
    appliedAt: z.string().datetime(),
  }).strict(),
  verification: z.object({
    reopened: z.literal(true),
    revalidated: z.literal(true),
    sourceUnchanged: z.literal(true),
    outputInspectionPassed: z.literal(true),
  }).strict(),
  /** Profile binding the applied document was re-inspected under. */
  profile: z.object({
    id: z.string().max(64),
    version: z.string().max(32),
    digest: Sha256Schema,
    documentTypeKey: z.string().max(32),
    documentTypeLabelVi: z.string().max(80),
  }).strict(),
}).strict();

/**
 * Read-only reconciliation input.
 *
 * It accepts both the current profile apply shape and the legacy direct
 * alignment shape because the stored execution identity was hashed from
 * whichever shape was dispatched. `dispatchedInput` is used ONLY to recompute
 * that identity hash; it is never handed to a mutation handler.
 */
const ReconcileInputSchema = z.object({
  /** The key the original dispatch was issued under; the only identity evidence. */
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i),
  dispatchedInput: z.union([ApplyInputSchema, LegacyApplyInputSchema]),
}).strict();

const LegacyAlignmentManifestSchema = z.object({
  property: z.literal('paragraph.alignment'),
  paragraphId: z.string().max(128),
  before: z.string().max(64),
  after: z.string().max(64),
  sourceSha256: Sha256Schema,
  outputSha256: Sha256Schema,
  appliedAt: z.string().datetime(),
}).passthrough();

/**
 * Reconciliation outcome. `outputContract` states how much the durable record
 * actually proves, so a caller can never present an unverifiable result as a
 * freshly applied profile change.
 */
const ReconcileOutputSchema = z.object({
  /** What the durable execution record proves. Never inferred from the marker. */
  outcome: z.enum(['succeeded', 'in_flight', 'failed', 'no_record']),
  /** Only `current` and `legacy_alignment` carry a replayable artifact. */
  outputContract: z.enum(['current', 'legacy_alignment', 'none']),
  idempotencyKey: z.string().max(64),
  /** Present only when `outputContract` is `current`. */
  output: ApplyOutputSchema.optional(),
  /**
   * Present only for `legacy_alignment`. These records predate the profile
   * binding, so no profile id, digest or rule is reported: none was recorded.
   */
  legacyChange: LegacyAlignmentManifestSchema.optional(),
  /**
   * Canonical owner-bound descriptor of the artifact the legacy record produced,
   * so the owner can download and review it. Absent when the stored descriptor
   * is missing or does not match the owner-bound file contract.
   */
  legacyOutputFile: FileDescriptorSchema.optional(),
  /** Recorded failure code, only when the record proves a failure. */
  recordedErrorCode: z.string().max(64).optional(),
  /**
   * Recorded failure kind. `PRE_HANDLER` proves the handler never started, so no
   * side effect is possible. `AMBIGUOUS_POST_START` does NOT prove that, and a
   * missing kind means the outcome is simply unknown.
   */
  recordedFailureKind: z.enum(['PRE_HANDLER', 'AMBIGUOUS_POST_START']).optional(),
  /** True when no durable evidence could be read at all. */
  evidenceUnavailable: z.boolean(),
}).strict();

export const documentFormattingModuleMetadata: ModuleMetadata = {
  id: 'document-formatting',
  name: 'Định dạng văn bản',
  enabled: false,
  canDisable: true,
  version: '0.1.0-candidate',
};

type ProcessorClient = Pick<DocumentProcessorClient, 'inspect' | 'applyFormatting'>;
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
      description: 'Inspect a DOCX already stored in the owner-bound file service. Returns deterministic package safety, the company profile binding and the mutable targets detected under it; makes no legal-compliance claim.',
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
          const inspection = await client.inspect(bytes, context.abortSignal, undefined, input.confirmedDocumentTypeKey);
          if (inspection.sourceSha256 !== sha256(bytes))
            throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor source digest did not match the canonical file.');
          // When the owner confirmed a type, the returned binding must actually be
          // that type. Otherwise the UI would silently display a different type's
          // findings while believing it had corrected the type.
          if (input.confirmedDocumentTypeKey) {
            const bound = inspection.binding;
            if (!bound || bound.documentTypeKey !== input.confirmedDocumentTypeKey || bound.ownerConfirmed !== true)
              throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor did not confirm the requested document type.');
          }
          return { sourceFileId: file.fileId, inspection };
        } catch (error) { return preserveSafeFailure(error); }
      },
    },
    {
      id: 'document.applyAlignment',
      moduleId: 'document-formatting',
      description: 'Apply exactly one user-confirmed formatting change named by the company profile to an owner-authorized DOCX. Always creates a new canonical fileId and preserves the source.',
      inputSchema: ApplyInputSchema,
      outputSchema: ApplyOutputSchema,
      risk: 'medium' as const,
      sideEffect: 'mutation' as const,
      confirmationPolicy: 'required' as const,
      permissions: ['files.read', 'files.write'],
      effects: ['Creates a new DOCX artifact after applying one confirmed profile formatting change.'],
      execute: async (input: z.infer<typeof ApplyInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
        const ownerId = context.user?.id;
        if (!ownerId) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');
        const { file: sourceFile, bytes: sourceBytes } = await readCanonicalDocx(files, ownerId, input.fileId, context.abortSignal);
        const actualSourceSha256 = sha256(sourceBytes);
        if (actualSourceSha256 !== input.sourceSha256.toLowerCase())
          throw safeCapabilityError('STALE_DOCUMENT', 'The DOCX source changed after inspection.');

        const client = processor ?? new DocumentProcessorClient();
        const applied = await client.applyFormatting({
          bytes: sourceBytes,
          sourceSha256: actualSourceSha256,
          documentTypeKey: input.documentTypeKey,
          property: input.property,
          targetId: input.targetId,
          expectedBefore: input.expectedBefore,
          desiredAfter: input.desiredAfter,
          profileId: input.profileId,
          profileDigest: input.profileDigest.toLowerCase(),
          ruleId: input.ruleId,
        }, context.abortSignal);
        if (applied.sha256 !== sha256(applied.bytes))
          throw safeCapabilityError('PROCESSOR_INVALID_RESPONSE', 'The document processor output digest did not match.');

        // Revalidate the produced artifact through the same profile, then confirm the
        // exact target now carries the confirmed value. Exactly one target may match,
        // and the profile, document type and rule must be the confirmed ones.
        const outputInspection = await client.inspect(applied.bytes, context.abortSignal, undefined, input.documentTypeKey);
        const matchingTargets = (outputInspection.mutableTargets ?? [])
          .filter(target => target.property === input.property && target.targetId === input.targetId);
        const outputTarget = matchingTargets.length === 1 ? matchingTargets[0] : undefined;
        const outputBinding = outputInspection.binding;
        if (!outputInspection.safeToMutate || outputInspection.packagePolicy !== 'NORMAL' ||
            outputInspection.sourceSha256 !== applied.sha256 ||
            !outputBinding ||
            outputBinding.digest.toLowerCase() !== input.profileDigest.toLowerCase() ||
            outputBinding.id !== input.profileId ||
            outputBinding.documentTypeKey !== input.documentTypeKey ||
            outputBinding.ownerConfirmed !== true ||
            !outputTarget || outputTarget.currentValue !== input.desiredAfter ||
            outputTarget.ruleId !== input.ruleId)
          throw safeCapabilityError('OUTPUT_INTEGRITY_FAILED', 'The generated DOCX failed output revalidation.');

        const reloadedSource = await files.readBytes(ownerId, sourceFile.fileId, MAX_FILE_BYTES, context.abortSignal);
        if (sha256(reloadedSource.bytes) !== actualSourceSha256)
          throw safeCapabilityError('SOURCE_IMMUTABILITY_VIOLATION', 'The source DOCX changed during processing.');

        const baseName = sourceFile.originalName.replace(/\.docx$/i, '') || 'document';
        const outputName = sanitizeDisplayFilename(`${baseName}-formatted.docx`);
        const appliedAt = new Date().toISOString();
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
            property: input.property,
            targetId: input.targetId,
            propertyLabelVi: outputTarget.propertyLabelVi,
            unit: outputTarget.unit,
            before: input.expectedBefore,
            after: input.desiredAfter,
            ruleId: input.ruleId,
            sourceSha256: actualSourceSha256,
            outputSha256: applied.sha256,
            appliedAt,
          },
          verification: { reopened: true as const, revalidated: true as const, sourceUnchanged: true as const, outputInspectionPassed: true as const },
          profile: {
            id: outputBinding.id,
            version: outputBinding.version,
            digest: outputBinding.digest,
            documentTypeKey: outputBinding.documentTypeKey,
            documentTypeLabelVi: outputBinding.documentTypeLabelVi,
          },
        };
        } catch (error) { return preserveSafeFailure(error); }
      },
    },
    {
      id: 'document.reconcileFormatting',
      moduleId: 'document-formatting',
      description: 'Read-only reconciliation of an already-dispatched formatting mutation. Reports only what the durable execution record proves; never mutates, retries or infers an outcome.',
      inputSchema: ReconcileInputSchema,
      outputSchema: ReconcileOutputSchema,
      risk: 'low' as const,
      sideEffect: 'none' as const,
      confirmationPolicy: 'none' as const,
      permissions: ['files.read'],
      effects: [],
      execute: async (input: z.infer<typeof ReconcileInputSchema>, context: { user?: { id: string }; abortSignal?: AbortSignal }) => {
        try {
          const ownerId = context.user?.id;
          if (!ownerId) throw safeCapabilityError('UNAUTHORIZED', 'A verified owner is required.');

          const evidence = await CapabilityExecutionIdempotencyService.inspect(
            { source: 'rest', idempotencyKey: input.idempotencyKey },
            { user: context.user },
            'document.applyAlignment',
            input.dispatchedInput,
          );
          // No readable evidence at all: report it rather than implying a result.
          if (!evidence)
            return { outcome: 'no_record' as const, outputContract: 'none' as const, idempotencyKey: input.idempotencyKey, evidenceUnavailable: true };

          // A mismatch means the key is bound to a different owner, capability or
          // payload. Naming that reason would leak cross-owner state, so the record
          // is reported as absent from this owner's point of view.
          if (evidence.kind === 'absent' || evidence.kind === 'mismatch')
            return { outcome: 'no_record' as const, outputContract: 'none' as const, idempotencyKey: input.idempotencyKey, evidenceUnavailable: false };

          const record = evidence.record;
          if (record.state === 'RUNNING')
            return { outcome: 'in_flight' as const, outputContract: 'none' as const, idempotencyKey: input.idempotencyKey, evidenceUnavailable: false };
          if (record.state === 'FAILED')
            return {
              outcome: 'failed' as const,
              outputContract: 'none' as const,
              idempotencyKey: input.idempotencyKey,
              evidenceUnavailable: false,
              // A failure is only provably side-effect-free when the record says
              // the handler never started. Anything else stays ambiguous.
              ...(record.errorCode ? { recordedErrorCode: record.errorCode } : {}),
              ...(record.failureKind ? { recordedFailureKind: record.failureKind } : {}),
            };

          const stored = record.result;
          const current = stored?.success ? ApplyOutputSchema.safeParse(stored.result) : null;
          if (current?.success)
            return { outcome: 'succeeded' as const, outputContract: 'current' as const, idempotencyKey: input.idempotencyKey, evidenceUnavailable: false, output: current.data };

          // A pre-profile success: the record proves the mutation completed, but it
          // recorded no profile binding. The legacy change is replayed verbatim and
          // no profile id, digest or rule is invented for it.
          const legacy = stored?.success ? LegacyAlignmentManifestSchema.safeParse((stored.result as { changeManifest?: unknown } | undefined)?.changeManifest) : null;
          const legacyFile = stored?.success ? FileDescriptorSchema.safeParse((stored.result as { outputFile?: unknown } | undefined)?.outputFile) : null;
          if (legacy?.success && legacyFile?.success)
            return {
              outcome: 'succeeded' as const,
              outputContract: 'legacy_alignment' as const,
              idempotencyKey: input.idempotencyKey,
              evidenceUnavailable: false,
              legacyOutputFile: legacyFile.data,
              legacyChange: {
                property: 'paragraph.alignment',
                paragraphId: legacy.data.paragraphId,
                before: legacy.data.before,
                after: legacy.data.after,
                sourceSha256: legacy.data.sourceSha256,
                outputSha256: legacy.data.outputSha256,
                appliedAt: legacy.data.appliedAt,
              },
            };

          return { outcome: 'succeeded' as const, outputContract: 'none' as const, idempotencyKey: input.idempotencyKey, evidenceUnavailable: false };
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
