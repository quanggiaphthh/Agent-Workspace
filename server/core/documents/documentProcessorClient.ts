import { createHash, randomUUID } from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { validateFileBytes } from '../files/filePolicy';

export const ProcessorAlignmentSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']);

export const DocumentInspectionSchema = z.object({
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  profile: z.literal('generic-direct-alignment-spike'),
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

  async inspect(bytes: Buffer, signal?: AbortSignal, correlationId: string = randomUUID()): Promise<DocumentInspectionResult> {
    this.validateInput(bytes);
    const { response, body } = await this.request('/inspect', bytes, MAX_INSPECTION_RESPONSE_BYTES, signal, correlationId);
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
