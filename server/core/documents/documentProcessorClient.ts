import { createHash, randomUUID } from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { validateFileBytes } from '../files/filePolicy';

export const ProcessorAlignmentSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']);

/**
 * Profile binding returned by the Processor. The digest and the document-type key
 * are what an apply must be confirmed against, so a proposal cannot be applied
 * under a profile or a document reading that has since changed.
 */
export const DocumentProfileBindingSchema = z.object({
  id: z.string().max(64),
  version: z.string().max(32),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  rulePackId: z.string().max(64),
  documentTypeKey: z.string().max(32),
  documentTypeLabelVi: z.string().max(80),
  documentTypeConfirmed: z.boolean(),
  /** Body of law the rule pack belongs to, so a party-scope document is not read as an admin one. */
  scopeId: z.string().max(32).optional(),
  scopeLabelVi: z.string().max(80).optional(),
  /**
   * What the detector suggested, kept separate from the bound type. The Processor
   * serialises an unset value as JSON `null`, so this must accept null as well as
   * undefined; otherwise every undetected-type document would fail validation and be
   * reported as an invalid response instead of an unrecognised document type.
   */
  detectedDocumentTypeKey: z.string().max(32).nullable().optional(),
  /** True when the bound type was chosen explicitly by the owner. */
  ownerConfirmed: z.boolean().optional(),
}).strict();

/** One scoped rule finding. Never carries a whole-document compliance verdict. */
export const ProfileFindingSchema = z.object({
  ruleId: z.string().max(128),
  targetKey: z.string().max(256),
  property: z.string().max(64),
  status: z.enum(['FAIL', 'NEEDS_REVIEW']),
  severity: z.string().max(32),
  expected: z.string().max(300),
  observed: z.string().max(300),
  patchEligibility: z.string().max(32),
  propertyLabelVi: z.string().max(80),
  unit: z.string().max(16),
  targetId: z.string().max(128).nullable(),
}).strict();

/** A formatting target the profile can actually change, with its current value. */
export const MutableTargetSchema = z.object({
  targetId: z.string().max(128),
  property: z.string().max(64),
  currentValue: z.string().max(64).nullable(),
  unit: z.string().max(16),
  propertyLabelVi: z.string().max(80),
  ruleId: z.string().max(128),
  directOnly: z.boolean(),
}).strict();

export const DocumentInspectionSchema = z.object({
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  profile: z.string().max(64),
  safeToMutate: z.boolean(),
  packagePolicy: z.enum(['NORMAL', 'GUARDED', 'AUDIT_ONLY', 'PROHIBITED']),
  paragraphs: z.array(z.object({
    paragraphId: z.string().regex(/^p[1-9][0-9]{0,8}$/),
    text: z.string().max(500),
    directAlignment: ProcessorAlignmentSchema.nullable(),
    issueId: z.string().regex(/^[0-9a-f]{24}$/).nullable(),
  }).strict()).max(250),
  paragraphsTruncated: z.boolean(),
  diagnostics: z.array(z.object({ code: z.string().max(64), message: z.string().max(300) }).strict()).max(32),
  binding: DocumentProfileBindingSchema.nullable(),
  findings: z.array(ProfileFindingSchema).max(200),
  mutableTargets: z.array(MutableTargetSchema).max(2000),
  ruleSubsetSize: z.number().int().nonnegative().max(1000),
  applicableRules: z.number().int().nonnegative().max(1000),
  evaluatedRules: z.number().int().nonnegative().max(1000),
  failCount: z.number().int().nonnegative().max(1000),
  needsReviewCount: z.number().int().nonnegative().max(1000),
  notEvaluatedCount: z.number().int().nonnegative().max(1000),
  evaluatedCoveragePercent: z.number().min(0).max(100),
  fullComplianceClaimAllowed: z.boolean(),
  scopeStatement: z.string().max(600).nullable(),
  supportedProperties: z.array(z.string().max(64)).max(64).nullable(),
  /**
   * Document types the bound profile version actually supports, projected from
   * the profile itself. The UI uses this to let the owner confirm or correct a
   * detected type without inventing one.
   */
  supportedDocumentTypes: z.array(z.object({
    typeKey: z.string().max(32),
    labelVi: z.string().max(80),
    hasTypeHeading: z.boolean(),
  }).strict()).max(16).nullable(),
}).strict();

export type DocumentInspectionResult = z.infer<typeof DocumentInspectionSchema>;
export type ProcessorAlignment = z.infer<typeof ProcessorAlignmentSchema>;
export type ProcessorClientConfig = {
  baseUrl?: string;
  sharedToken?: string;
  fetchImpl?: typeof fetch;
  nodeEnv?: string;
  timeoutMs?: number;
  idTokenProvider?: (audience: string) => Promise<string>;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_INSPECTION_RESPONSE_BYTES = 512 * 1024;
const SAFE_REMOTE_ERRORS: Record<string, string> = {
  INPUT_TOO_LARGE: 'The DOCX input exceeds the allowed size.',
  OUTPUT_TOO_LARGE: 'The generated DOCX exceeds the allowed size.',
  UNSAFE_ARCHIVE: 'The DOCX archive was rejected by package safety checks.',
  ARCHIVE_EXPANSION_LIMIT: 'The DOCX archive exceeds expansion limits.',
  ARCHIVE_ENTRY_LIMIT: 'The DOCX archive contains too many entries.',
  ARCHIVE_ENTRY_TOO_LARGE: 'A DOCX package part exceeds the allowed size.',
  UNSAFE_ARCHIVE_PATH: 'The DOCX archive contains an unsafe part name.',
  UNSAFE_XML: 'A DOCX XML part was rejected by safety checks.',
  MALFORMED_DOCX: 'The DOCX package is malformed or unreadable.',
  PROCESSING_TIMEOUT: 'DOCX processing exceeded its time limit.',
  PROCESSING_CANCELLED: 'DOCX processing was cancelled.',
  STALE_DOCUMENT: 'The DOCX source changed after inspection.',
  PACKAGE_NOT_MUTABLE: 'The DOCX package is not eligible for this mutation.',
  TARGET_NOT_FOUND: 'The selected paragraph is no longer available.',
  TARGET_AMBIGUOUS: 'The selected paragraph is not uniquely available.',
  PROVENANCE_NOT_DIRECT: 'Only explicit direct paragraph alignment can be changed.',
  PRECONDITION_FAILED: 'The selected paragraph no longer has the inspected alignment.',
  UNSUPPORTED_OPERATION: 'The requested direct alignment change is not supported.',
  OUTPUT_INTEGRITY_FAILED: 'The generated DOCX failed output integrity checks.',
  OUTPUT_NOT_VERIFIED: 'The generated DOCX was not reported as verified.',
  PROFILE_CHANGED: 'The formatting profile changed after this document was inspected.',
  STALE_RULE_CONTENT: 'The bound rule changed after this document was inspected.',
  PROFILE_TUPLE_MISMATCH: 'The requested property and rule are not a declared profile pair.',
  UNSUPPORTED_PROPERTY: 'The requested formatting property is not part of the company formatting profile.',
  UNSUPPORTED_DOCUMENT_TYPE: 'This document type is not covered by the company formatting profile.',
  PROPOSAL_NOT_ELIGIBLE: 'The bound rule does not permit an automatic fix.',
  PROFILE_NOT_CONFIGURED: 'The document processor has no formatting profile loaded.',
  POSTCONDITION_FAILED: 'The requested alignment was not present after reopening.',
  TEMP_CLEANUP_FAILED: 'Temporary document data could not be removed safely.',
  TEMP_CREATE_FAILED: 'A private processing workspace could not be created.',
  PROCESSOR_BUSY: 'The private document processor is busy.',
  PROCESSOR_AUTH_FAILED: 'The private document processor rejected its service credentials.',
  PROCESSING_FAILED: 'Document processing failed safely.',
  UNSUPPORTED_FILE_TYPE: 'The document processor accepts DOCX only.',
  INVALID_INPUT: 'The confirmed document operation is invalid.',
  AUTHORIZATION_REJECTED: 'The exact document operation was not authorized.',
  SOURCE_IMMUTABILITY_VIOLATION: 'The source DOCX changed during processing.',
  OUTPUT_PATH_INVALID: 'The output artifact could not be safely created.',
  OUTPUT_ALREADY_EXISTS: 'The output artifact could not be safely created.',
};

export class DocumentProcessorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DocumentProcessorError';
  }
}

export class DocumentProcessorClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: URL;
  private readonly sharedToken: string;
  private readonly timeoutMs: number;
  private readonly requiresIam: boolean;
  private readonly idTokenProvider: (audience: string) => Promise<string>;

  constructor(config: ProcessorClientConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const baseUrl = config.baseUrl ?? process.env.DOCUMENT_PROCESSOR_URL;
    const sharedToken = config.sharedToken ?? process.env.DOCUMENT_PROCESSOR_SHARED_TOKEN;
    const nodeEnv = config.nodeEnv ?? process.env.NODE_ENV ?? 'development';
    if (!baseUrl || !sharedToken || Buffer.byteLength(sharedToken, 'utf8') < 32) {
      throw new DocumentProcessorError('PROCESSOR_NOT_CONFIGURED', 'The private document processor is not configured.');
    }
    let parsed: URL;
    try { parsed = new URL(baseUrl); }
    catch { throw new DocumentProcessorError('PROCESSOR_NOT_CONFIGURED', 'The private document processor URL is invalid.'); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new DocumentProcessorError('PROCESSOR_NOT_CONFIGURED', 'The private document processor URL is invalid.');
    }
    const localHttp = nodeEnv !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) {
      throw new DocumentProcessorError('PROCESSOR_NOT_CONFIGURED', 'The private document processor URL must use HTTPS.');
    }
    this.baseUrl = parsed;
    this.sharedToken = sharedToken;
    this.requiresIam = !localHttp;
    this.idTokenProvider = config.idTokenProvider ?? (async audience => {
      const client = await new GoogleAuth().getIdTokenClient(audience);
      const authorization = (await client.getRequestHeaders()).get('authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Error('Missing ID token');
      return authorization.slice('Bearer '.length);
    });
  }

  async inspect(bytes: Buffer, signal?: AbortSignal, correlationId: string = randomUUID(), confirmedDocumentTypeKey?: string): Promise<DocumentInspectionResult> {
    this.validateInput(bytes);
    // A confirmed type re-scopes the inspection so the returned findings and
    // targets belong to that type rather than to the detector's suggestion.
    const endpoint = confirmedDocumentTypeKey && confirmedDocumentTypeKey.length <= 32
      ? `/inspect?confirmedDocumentTypeKey=${encodeURIComponent(confirmedDocumentTypeKey)}`
      : '/inspect';
    const { response, body } = await this.request(endpoint, bytes, MAX_INSPECTION_RESPONSE_BYTES, signal, correlationId);
    if (!response.ok) throw this.remoteError(response, body);
    if (!this.isContentType(response, 'application/json')) {
      throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid inspection response.');
    }
    let value: unknown;
    try { value = JSON.parse(body.toString('utf8')); }
    catch { throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid inspection response.'); }
    const parsed = DocumentInspectionSchema.safeParse(value);
    if (!parsed.success) throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid inspection response.');
    return parsed.data;
  }

  async applyAlignment(input: {
    bytes: Buffer;
    sourceSha256: string;
    paragraphId: string;
    expectedBefore: ProcessorAlignment;
    desiredAfter: ProcessorAlignment;
  }, signal?: AbortSignal, correlationId: string = randomUUID()): Promise<{ bytes: Buffer; sha256: string }> {
    this.validateInput(input.bytes);
    if (!/^[0-9a-f]{64}$/i.test(input.sourceSha256) || !/^p[1-9][0-9]{0,8}$/.test(input.paragraphId) || input.expectedBefore === input.desiredAfter) {
      throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed alignment request is invalid.');
    }
    const endpoint = new URL('/apply', this.baseUrl);
    endpoint.searchParams.set('sourceSha256', input.sourceSha256);
    endpoint.searchParams.set('paragraphId', input.paragraphId);
    endpoint.searchParams.set('expectedBefore', input.expectedBefore);
    endpoint.searchParams.set('desiredAfter', input.desiredAfter);
    const { response, body } = await this.request(endpoint.toString(), input.bytes, MAX_FILE_BYTES, signal, correlationId, true);
    if (!response.ok) throw this.remoteError(response, body);
    if (!this.isContentType(response, DOCX_MIME_TYPE)) {
      throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid DOCX artifact.');
    }
    // ZIP signature screening; authoritative package revalidation follows through inspect().
    try { validateFileBytes(DOCX_MIME_TYPE, body); }
    catch { throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid DOCX artifact.'); }
    const expectedDigest = response.headers.get('x-output-sha256') ?? '';
    const actualDigest = createHash('sha256').update(body).digest('hex');
    if (!/^[0-9a-f]{64}$/i.test(expectedDigest) || actualDigest !== expectedDigest.toLowerCase()) {
      throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor output digest did not match.');
    }
    return { bytes: body, sha256: actualDigest };
  }

  /**
 * Apply one confirmed profile formatting property.
 *
 * The confirmation must name the profile binding the inspection was issued under,
 * the exact current value, and the target it was issued for. Any mismatch is a
 * stale confirmation and is refused by the Processor before any write.
 */
async applyFormatting(input: {
  bytes: Buffer;
  sourceSha256: string;
  documentTypeKey: string;
  property: string;
  targetId: string;
  expectedBefore: string;
  desiredAfter: string;
  profileId: string;
  profileDigest: string;
  ruleId: string;
}, signal?: AbortSignal, correlationId: string = randomUUID()): Promise<{
  bytes: Buffer;
  sha256: string;
  property: string;
  targetId: string;
  ruleId: string;
  documentTypeKey: string;
  reopened: boolean;
  revalidated: boolean;
}> {
  this.validateInput(input.bytes);
  if (!/^[0-9a-f]{64}$/i.test(input.sourceSha256) || !/^[0-9a-f]{64}$/i.test(input.profileDigest)) {
    throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed formatting request is invalid.');
  }
  if (!input.documentTypeKey || input.documentTypeKey.length > 32) {
    throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed formatting request is invalid.');
  }
  if (!input.property || input.property.length > 64 || !input.targetId || input.targetId.length > 128) {
    throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed formatting request is invalid.');
  }
  if (!input.expectedBefore || !input.desiredAfter || input.expectedBefore.length > 64 || input.desiredAfter.length > 64) {
    throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed formatting request is invalid.');
  }
  if (input.expectedBefore === input.desiredAfter) {
    throw new DocumentProcessorError('INVALID_INPUT', 'The confirmed formatting request does not change the current value.');
  }
  const endpoint = new URL('/apply', this.baseUrl);
  endpoint.searchParams.set('sourceSha256', input.sourceSha256);
  endpoint.searchParams.set('documentTypeKey', input.documentTypeKey);
  endpoint.searchParams.set('property', input.property);
  endpoint.searchParams.set('targetId', input.targetId);
  endpoint.searchParams.set('expectedBefore', input.expectedBefore);
  endpoint.searchParams.set('desiredAfter', input.desiredAfter);
  endpoint.searchParams.set('profileId', input.profileId);
  endpoint.searchParams.set('profileDigest', input.profileDigest);
  endpoint.searchParams.set('ruleId', input.ruleId);

  const { response, body } = await this.request(endpoint.toString(), input.bytes, MAX_FILE_BYTES, signal, correlationId, true);
  if (!response.ok) throw this.remoteError(response, body);
  if (!this.isContentType(response, DOCX_MIME_TYPE)) {
    throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid DOCX artifact.');
  }
  try { validateFileBytes(DOCX_MIME_TYPE, body); }
  catch { throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor returned an invalid DOCX artifact.'); }

  const expectedDigest = response.headers.get('x-output-sha256') ?? '';
  const actualDigest = createHash('sha256').update(body).digest('hex');
  if (!/^[0-9a-f]{64}$/i.test(expectedDigest) || actualDigest !== expectedDigest.toLowerCase()) {
    throw new DocumentProcessorError('PROCESSOR_INVALID_RESPONSE', 'The document processor output digest did not match.');
  }
  // The Processor only promotes an artifact it reopened and revalidated.
  if (response.headers.get('x-document-reopened') !== 'true' || response.headers.get('x-document-revalidated') !== 'true') {
    throw new DocumentProcessorError('OUTPUT_NOT_VERIFIED', 'The generated DOCX was not reported as verified.');
  }
  const property = response.headers.get('x-applied-property');
  const targetId = response.headers.get('x-applied-target');
  const ruleId = response.headers.get('x-applied-rule-id');
  const documentTypeKey = response.headers.get('x-applied-document-type');
  if (!property || !targetId || !ruleId || !documentTypeKey) {
    throw new DocumentProcessorError('OUTPUT_NOT_VERIFIED', 'The document processor did not report which change was applied.');
  }
  if (property !== input.property || targetId !== input.targetId || ruleId !== input.ruleId
      || documentTypeKey !== input.documentTypeKey) {
    throw new DocumentProcessorError('OUTPUT_NOT_VERIFIED', 'The applied change does not match the confirmed change.');
  }
  return {
    bytes: body,
    sha256: actualDigest,
    property,
    targetId,
    ruleId,
    documentTypeKey,
    reopened: true,
    revalidated: true,
  };
}

private validateInput(bytes: Buffer): void {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
      throw new DocumentProcessorError(bytes?.length > MAX_FILE_BYTES ? 'INPUT_TOO_LARGE' : 'INVALID_INPUT', 'The DOCX input is invalid or exceeds the allowed size.');
    }
    try { validateFileBytes(DOCX_MIME_TYPE, bytes); }
    catch { throw new DocumentProcessorError('MALFORMED_DOCX', 'The DOCX package is malformed or unreadable.'); }
  }

  private async request(
    endpoint: string,
    bytes: Buffer,
    maximumResponseBytes: number,
    parentSignal: AbortSignal | undefined,
    correlationId: string,
    absoluteEndpoint = false,
  ): Promise<{ response: Response; body: Buffer }> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(new Error('timeout')); }, this.timeoutMs);
    timer.unref?.();
    const url = absoluteEndpoint ? endpoint : new URL(endpoint, this.baseUrl).toString();
    try {
      if (controller.signal.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
      let iamToken: string | undefined;
      if (this.requiresIam) {
        try {
          iamToken = await this.obtainIdToken(controller.signal);
          if (!iamToken || iamToken.length > 8192 || /\s/.test(iamToken)) throw new Error('Invalid ID token');
        } catch {
          if (timedOut) throw new DocumentProcessorError('PROCESSING_TIMEOUT', 'DOCX processing exceeded its time limit.');
          if (parentSignal?.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
          throw new DocumentProcessorError('PROCESSOR_AUTH_FAILED', 'The private document processor could not be authenticated.');
        }
      }
      if (controller.signal.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.sharedToken}`,
            ...(iamToken ? { 'X-Serverless-Authorization': `Bearer ${iamToken}` } : {}),
            'Content-Type': DOCX_MIME_TYPE,
            'X-Correlation-ID': correlationId,
          },
          body: bytes,
          signal: controller.signal,
          redirect: 'error',
        });
      } catch {
        if (timedOut) throw new DocumentProcessorError('PROCESSING_TIMEOUT', 'DOCX processing exceeded its time limit.');
        if (parentSignal?.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
        throw new DocumentProcessorError('PROCESSOR_UNAVAILABLE', 'The private document processor is unavailable.');
      }
      const body = await this.readBounded(response, maximumResponseBytes, controller.signal);
      return { response, body };
    } catch (error) {
      if (timedOut) throw new DocumentProcessorError('PROCESSING_TIMEOUT', 'DOCX processing exceeded its time limit.');
      if (parentSignal?.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
      if (error instanceof DocumentProcessorError) throw error;
      throw new DocumentProcessorError('PROCESSOR_UNAVAILABLE', 'The private document processor is unavailable.');
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  }

  private async obtainIdToken(signal: AbortSignal): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const abort = () => reject(new Error('Token acquisition cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); signal.removeEventListener('abort', abort); return; }
      void Promise.resolve().then(() => this.idTokenProvider(this.baseUrl.origin))
        .then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  private async readBounded(response: Response, maximumBytes: number, signal: AbortSignal): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximumBytes) {
      try { await response.body?.cancel(); } catch { /* Keep the bounded response failure deterministic. */ }
      throw new DocumentProcessorError('PROCESSOR_RESPONSE_TOO_LARGE', 'The document processor response exceeds the allowed size.');
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        if (signal.aborted) throw new DocumentProcessorError('PROCESSING_CANCELLED', 'DOCX processing was cancelled.');
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximumBytes) {
          try { await reader.cancel(); } catch { /* The response is still rejected at the fixed bound. */ }
          throw new DocumentProcessorError('PROCESSOR_RESPONSE_TOO_LARGE', 'The document processor response exceeds the allowed size.');
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks, total);
  }

  private remoteError(response: Response, body: Buffer): DocumentProcessorError {
    let code = 'PROCESSING_FAILED';
    try {
      const value = JSON.parse(body.toString('utf8')) as { code?: unknown };
      if (typeof value?.code === 'string' && Object.prototype.hasOwnProperty.call(SAFE_REMOTE_ERRORS, value.code)) code = value.code;
    } catch { /* Use the safe default code. */ }
    if (response.status === 401 || response.status === 403) code = 'PROCESSOR_AUTH_FAILED';
    if (response.status === 429) code = 'PROCESSOR_BUSY';
    return new DocumentProcessorError(code, SAFE_REMOTE_ERRORS[code] ?? 'The document processor could not complete the request.');
  }

  private isContentType(response: Response, expected: string): boolean {
    return response.headers.get('content-type')?.split(';', 2)[0].trim().toLowerCase() === expected.toLowerCase();
  }
}
