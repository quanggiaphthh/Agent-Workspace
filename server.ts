import { bootstrapServer } from "./server/bootstrap";
// 1. Bootstrap catalog first so storage can seed correctly
bootstrapServer();

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { RootAgent } from './server/agent/adk/RootAgent';
import { InMemorySessionService } from '@google/adk';
import { FirestoreSessionService } from './server/agent/adk/FirestoreSessionService';
import { adkEventStream } from '@assistant-ui/react-google-adk/server';
import { ServerCapabilityRegistry } from './server/core/capabilities/serverCapabilityRegistry';
import { CapabilityExecutionService } from './server/core/capabilities/CapabilityExecutionService';
import { Readable } from 'stream';
import { AuditService } from './server/core/audit/auditService';
import { storage } from './server/infrastructure/storage';
import { ServerIdentityProvider } from './server/core/auth/identityProvider';
import { PermissionResolver } from './server/core/permissions/permissionResolver';
import { serverModuleCatalog } from './server/core/modules/moduleCatalog';
import { adminFirestore, firebaseAdminConfig, probeFirestoreAdmin } from './server/lib/firebaseAdmin';
import firebaseConfig from './firebase-applet-config.json';
import { AIConfigSchema, type AIProviderId } from './shared/contracts/ai';
import { z } from 'zod';
import { UserDataService, isValidTaskDueDate, isValidTaskDueTime } from './server/core/data/UserDataService';
import { computeRuntimeHealth } from './server/core/runtime/runtimeHealthPolicy';
import { resolveListenHost } from './server/core/runtime/listenHost';
import { bindRequestCancellation, isCancellationError } from './server/core/runtime/requestCancellation';
import { createExecutionDeadline } from './server/core/runtime/executionDeadline';
import { redactAuditString, sanitizeAuditValue } from './server/core/audit/auditRedaction';
import { toSafeProviderError } from './server/core/ai/credentialRotationPolicy';
import { parseStrictAgentChatRequest } from './server/agent/chat/chatRequestContract';
import { serializeAgentTransportComplete, serializeAgentTransportError } from './server/agent/chat/sseTransport';
import { sessionTranscript } from './server/agent/chat/sessionHistory';
import { FileDomainError } from './server/core/files/UserFileService';
import { fileIngestionService, userFileService } from './server/core/files/firebaseFileStores';
import { MAX_FILE_BYTES, buildSafeContentDisposition, buildSafeFileAuditMetadata, sanitizeDisplayFilename, validateFileBytes, validateFilenameForMimeType } from './server/core/files/filePolicy';
import { DOCX_MIME_TYPE } from './shared/contracts/fileUploadPolicy';
import { runWithRequestScopedDocument, clearRequestScopedDocument, clearRequestScopedSource, clearRequestScopedOutput } from './server/core/documents/requestScopedDocument';
import type { RequestScopedDocument } from './server/core/documents/requestScopedDocument';
import { DocumentProcessorError } from './server/core/documents/documentProcessorClient';
import { createRunScopedArtifactService } from './server/agent/adk/RunScopedArtifactService';
import { createCanonicalAgentRunner } from './server/agent/adk/nativeArtifactIntegration';

dotenv.config();

const PORT = 3000;
const adkSessionService = new FirestoreSessionService();
const temporarySessionService = new InMemorySessionService();
const AGENT_APP_NAME = 'root_agent';
const ClientSessionIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

function parseClientSessionId(value: unknown): string {
  const parsed = ClientSessionIdSchema.safeParse(value);
  if (!parsed.success) {
    const err = new Error('Invalid sessionId. Use 1-128 characters: letters, numbers, underscore or hyphen.');
    (err as any).status = 400;
    throw err;
  }
  return parsed.data;
}

function serverSessionId(userId: string, clientSessionId: string): string {
  return `u_${userId}_s_${clientSessionId}`;
}

function clientSessionIdFromServer(userId: string, storedId: string): string {
  const prefix = `u_${userId}_s_`;
  return storedId.startsWith(prefix) ? storedId.slice(prefix.length) : storedId;
}

function eventIsUserMessage(event: any): boolean {
  return event?.content?.role === 'user' || event?.author === 'user';
}


export const app = express();

// Fix express-rate-limit warning in proxy environments
app.set('trust proxy', 1);

// Production security headers. Development relaxes CSP only for the Vite/HMR runtime.
const productionCsp = {
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    scriptSrc: ["'self'", 'https://apis.google.com', 'https://www.gstatic.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com', 'https://www.gstatic.com'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: [
      "'self'",
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'https://firestore.googleapis.com',
    ],
    frameSrc: ["'self'", 'https://accounts.google.com', `https://${firebaseConfig.authDomain}`],
  },
};

app.use(helmet(process.env.NODE_ENV === 'production'
  ? { contentSecurityPolicy: productionCsp, crossOriginEmbedderPolicy: false }
  : { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: 'Too many requests, please try again later.' },
});

// Public telemetry is separately constrained because it is intentionally unauthenticated.
const clientErrorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: 'Too many client error reports.' },
});

// Expensive provider/agent work is limited per verified user, not per shared NAT IP.
const expensiveUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  keyGenerator: (req: express.Request) => `user:${req.user?.id || 'missing-auth'}`,
  handler: (_req, res) => res.status(429).json({ error: 'Too many expensive requests. Please try again later.' }),
});

app.use('/api', limiter);

const ClientErrorSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(200).optional(),
  stack: z.string().max(12000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

app.post('/api/log-error', clientErrorLimiter, express.json({ limit: '32kb' }), (req, res) => {
  const parsed = ClientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid client error report.' });
  }

  const safeReport = {
    message: redactAuditString(parsed.data.message),
    source: parsed.data.source ? redactAuditString(parsed.data.source) : undefined,
    stack: parsed.data.stack ? redactAuditString(parsed.data.stack) : undefined,
    context: parsed.data.context ? sanitizeAuditValue(parsed.data.context) : undefined,
  };
  console.error('>>> [CLIENT REPORTED ERROR]:', safeReport);
  res.json({ received: true });
});

app.use('/api/log-error', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Client error report is too large.' });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON payload.' });
  return next(err);
});

// JSON request size limit for authenticated application APIs.
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const [firestore, session, audit] = await Promise.all([
    probeFirestoreAdmin(),
    adkSessionService.probePersistenceHealth(),
    AuditService.probeHealth(),
  ]);
  const modules = storage.getPersistenceHealth();
  const health = computeRuntimeHealth({ firestore, session, modules, audit });
  res.status(health.status === 'error' ? 503 : 200).json({
    ...health,
    capabilitiesCount: ServerCapabilityRegistry.listAll().length,
  });
});

function fatalErrorSummary(value: unknown): string {
  if (value instanceof Error) return redactAuditString(`${value.name}: ${value.message}`);
  return redactAuditString(String(value));
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  process.on('unhandledRejection', (reason) => {
    console.error('>>> [FATAL UNHANDLED REJECTION]:', fatalErrorSummary(reason));
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    console.error('>>> [FATAL UNCAUGHT EXCEPTION]:', fatalErrorSummary(err));
    process.exit(1);
  });
}

// Authentication middleware for protected API routes
app.use('/api', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Phase 6: Secure AI settings and diagnostics
  const publicPaths = ['/health', '/log-error'];
  if (publicPaths.some(p => req.path === p)) {
    return next();
  }
  try {
    const user = await ServerIdentityProvider.getIdentity(req);
    req.user = user;
    next();
  } catch (err: any) {
    console.warn(`Auth blocked request to ${req.path}: ${err.message}`);
    res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }
});

// Protected /api handlers run only after the server identity middleware above.
// Keep Express.Request.user optional globally because /api/health and /api/log-error
// are intentionally public, and narrow the authenticated invariant only where needed.
function requireAuthenticatedUser(req: express.Request) {
  const user = req.user;
  if (!user) {
    throw Object.assign(new Error('Unauthorized: Missing user identity'), { status: 401 });
  }
  return user;
}

// Shared authorization middleware
function requirePermission(permission: string) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Missing user identity' });
      }
      const authRes = PermissionResolver.checkPermission([permission], {
        user,
        appContext: { user, availableCapabilities: [] },
        confirmed: true
      });
      if (!authRes.authorized) {
        return res.status(403).json({ error: authRes.error || `Forbidden: Missing required permission ${permission}` });
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}

// Acceptance test route & Phase 3 Probe
app.get('/api/test/firebase-connection', async (req, res) => {
  const user = req.user;
  const sessionId = `probe_${Date.now()}`;
  
  // Phase 2 Diagnostics
  const diagInfo = {
    firebaseProjectId: firebaseAdminConfig.projectId,
    firestoreDatabaseId: firebaseAdminConfig.databaseId,
    googleApplicationCredentialsEnvPresent: firebaseAdminConfig.googleApplicationCredentialsEnvPresent,
    credentialStrategy: firebaseAdminConfig.credentialStrategy,
    userId: user?.id,
    sessionId: sessionId,
    collectionPath: `_server_probe/${sessionId}`
  };

  console.log('>>> [DIAGNOSTIC PROBE START]:', JSON.stringify(diagInfo, null, 2));

  try {
    // Phase 3: Server Firestore Probe
    const testDocRef = adminFirestore.collection('_server_probe').doc(sessionId);
    
    // Write
    await testDocRef.set({ 
      userId: user?.id, 
      timestamp: new Date().toISOString(),
      diag: 'Phase 3 Probe'
    });
    
    // Read
    const docSnapshot = await testDocRef.get();
    if (!docSnapshot.exists) throw new Error('Probe failed: Document not found after write');
    
    // Delete
    await testDocRef.delete();

    console.log('>>> [DIAGNOSTIC PROBE PASS]');
    res.json({ 
      success: true, 
      message: 'Firebase Server Probe PASSED', 
      diagnostics: diagInfo 
    });
  } catch (err: any) {
    console.error('>>> [DIAGNOSTIC PROBE FAIL]:', err.message);
    res.status(500).json({ 
      success: false,
      error: err.message,
      code: err.code, // Useful for PERMISSION_DENIED
      diagnostics: diagInfo 
    });
  }
});

// AI Routes
import { AIProviderManager, redactProviderError } from './server/core/ai/AIProviderManager';
import { CredentialService } from './server/core/ai/CredentialService';

const AIProviderIdSchema = z.enum(['google', 'openai', 'anthropic', 'nvidia', 'opencodezen']);
const CredentialSecretSchema = z.string().trim().min(1).max(8192);
const CredentialNameSchema = z.string().trim().min(1).max(120);
const TestKeySchema = z.object({
  providerId: AIProviderIdSchema,
  key: CredentialSecretSchema,
}).strict();
const CredentialCreateSchema = z.object({
  providerId: AIProviderIdSchema,
  key: CredentialSecretSchema,
  name: CredentialNameSchema.optional(),
}).strict();
const CredentialUpdateSchema = z.object({
  providerId: AIProviderIdSchema,
  key: CredentialSecretSchema.optional(),
  name: CredentialNameSchema.optional(),
}).strict().refine((value) => value.key !== undefined || value.name !== undefined, {
  message: 'At least one credential field must be updated.',
});
const TestModelSchema = z.object({
  providerId: AIProviderIdSchema,
  credentialId: z.string().trim().min(1).max(160),
  modelId: z.string().trim().min(1).max(300),
}).strict();

function safeErrorCode(err: any): string | undefined {
  return typeof err?.code === 'string' && /^[A-Z0-9_]{3,80}$/.test(err.code)
    ? err.code
    : undefined;
}

function credentialErrorResponse(err: any, fallback: string, knownSecret?: string) {
  const status = Number(err?.status) || 500;
  const safeMessage = knownSecret
    ? redactProviderError(err, knownSecret)
    : redactAuditString(String(err?.message || fallback));
  const code = safeErrorCode(err);
  return { status, body: { error: safeMessage || fallback, ...(code ? { code } : {}) } };
}

app.post('/api/ai/test-key', expensiveUserLimiter, async (req, res) => {
  const parsed = TestKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid provider credential test request.' });
  const { providerId, key } = parsed.data;

  try {
    const adapter = AIProviderManager.getAdapter(providerId);
    const result = await adapter.testKey(key);
    if (!result.success) {
      return res.status(result.statusCode || 401).json({ error: result.error, canSaveUnverified: result.canSaveUnverified });
    }
    res.json(result);
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Provider communication error', key);
    console.error('Test key error:', safe.body.error);
    res.status(safe.status).json(safe.body);
  }
});

app.get('/api/ai/models', expensiveUserLimiter, async (req, res) => {
  const providerParsed = AIProviderIdSchema.safeParse(req.query.providerId);
  const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : '';
  const user = requireAuthenticatedUser(req);
  if (!providerParsed.success || !credentialId) {
    return res.status(400).json({ error: 'Invalid providerId or credentialId.' });
  }

  let resolvedSecret: string | undefined;
  try {
    const cred = await CredentialService.resolveCredential(user.id, providerParsed.data, credentialId);
    resolvedSecret = cred.key;
    const adapter = AIProviderManager.getAdapter(providerParsed.data);
    let models;
    try {
      models = await adapter.listModels(cred.key);
    } catch (providerErr) {
      throw toSafeProviderError(providerErr);
    }
    res.json({ success: true, models });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to fetch models', resolvedSecret);
    console.error('Fetch models error:', safe.body.error);
    res.status(safe.status).json(safe.body);
  } finally {
    resolvedSecret = undefined;
  }
});

app.post('/api/ai/test-model', expensiveUserLimiter, async (req, res) => {
  const parsed = TestModelSchema.safeParse(req.body);
  const user = requireAuthenticatedUser(req);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid model test request.' });

  let resolvedSecret: string | undefined;
  try {
    const { providerId, credentialId, modelId } = parsed.data;
    const cred = await CredentialService.resolveCredential(user.id, providerId, credentialId);
    resolvedSecret = cred.key;
    const adapter = AIProviderManager.getAdapter(providerId);
    try {
      await adapter.testModel(cred.key, modelId);
    } catch (providerErr) {
      throw toSafeProviderError(providerErr);
    }
    res.json({ success: true });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Model test failed', resolvedSecret);
    res.status(safe.status).json(safe.body);
  } finally {
    resolvedSecret = undefined;
  }
});

app.get('/api/ai/credentials/agent-options', async (req, res) => {
  const user = requireAuthenticatedUser(req);
  try {
    res.json(await CredentialService.listAgentCredentialOptions(user.id));
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to list Agent credentials');
    res.status(safe.status).json(safe.body);
  }
});

app.get('/api/ai/credentials', async (req, res) => {
  const user = requireAuthenticatedUser(req);
  try {
    res.json(await CredentialService.listCredentials(user.id));
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to list credentials');
    res.status(safe.status).json(safe.body);
  }
});

app.post('/api/ai/credentials', async (req, res) => {
  const parsed = CredentialCreateSchema.safeParse(req.body);
  const user = requireAuthenticatedUser(req);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credential payload.' });

  try {
    const { providerId, key, name } = parsed.data;
    const id = await CredentialService.saveCredential(user.id, providerId, key, name || 'Key');
    res.status(201).json({ id });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to save credential');
    res.status(safe.status).json(safe.body);
  }
});

app.patch('/api/ai/credentials/:id', async (req, res) => {
  const parsed = CredentialUpdateSchema.safeParse(req.body);
  const user = requireAuthenticatedUser(req);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credential update payload.' });

  try {
    await CredentialService.updateCredential(user.id, req.params.id, parsed.data);
    res.json({ success: true });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to update credential');
    res.status(safe.status).json(safe.body);
  }
});

app.post('/api/ai/credentials/reorder', async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const providerParsed = AIProviderIdSchema.safeParse(req.body?.providerId);
  const credentialIds = Array.isArray(req.body?.credentialIds)
    ? req.body.credentialIds.filter((item: unknown): item is string => typeof item === 'string')
    : null;
  if (!providerParsed.success || !credentialIds || credentialIds.length !== req.body.credentialIds.length) {
    return res.status(400).json({ error: 'Invalid providerId or credentialIds.' });
  }
  try {
    await CredentialService.reorderCredentials(user.id, providerParsed.data, credentialIds);
    res.json({ success: true });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to persist credential order');
    res.status(safe.status).json(safe.body);
  }
});

app.delete('/api/ai/credentials/:id', async (req, res) => {
  const user = requireAuthenticatedUser(req);
  try {
    await CredentialService.deleteCredential(user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to delete credential');
    res.status(safe.status).json(safe.body);
  }
});

// Tasks & Memory REST APIs: Firebase Admin is the only persistence boundary.
const TaskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  status: z.enum(['todo', 'in-progress', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  dueDate: z.string().max(10).refine(isValidTaskDueDate, 'dueDate must be YYYY-MM-DD or an empty string.').optional(),
  dueTime: z.string().max(5).refine(isValidTaskDueTime, 'dueTime must be HH:mm or an empty string.').optional(),
}).strict();
const TaskPatchSchema = TaskCreateSchema.partial().strict();
const MemoryCreateSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().min(1).max(300).optional(),
}).strict();
const MemoryPatchSchema = z.object({
  content: z.string().trim().min(1).max(10000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().min(1).max(300).optional(),
  status: z.enum(['approved', 'pending']).optional(),
}).strict();

// GĐ4 V1 canonical upload path: authenticated, server-mediated raw binary upload.
// The browser never receives Firebase Storage authority; owner and storage identity are server-derived.
const DocumentAlignmentSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']);
const DocumentAlignmentChangeSchema = z.object({
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  paragraphId: z.string().regex(/^p[1-9][0-9]{0,8}$/),
  expectedBefore: DocumentAlignmentSchema,
  desiredAfter: DocumentAlignmentSchema,
}).strict().refine(value => value.expectedBefore !== value.desiredAfter, {
  message: 'The requested alignment must change the current value.',
});

function documentErrorStatus(code: string): number {
  if (['UNAUTHENTICATED', 'UNAUTHORIZED'].includes(code)) return 401;
  if (['PERMISSION_DENIED', 'CAPABILITY_SOURCE_NOT_ALLOWED'].includes(code)) return 403;
  if (['CAPABILITY_NOT_FOUND', 'DOCUMENT_ROUTE_REQUIRED', 'MODULE_NOT_FOUND', 'MODULE_DISABLED'].includes(code)) return 404;
  if (['FILE_TOO_LARGE', 'INPUT_TOO_LARGE', 'OUTPUT_TOO_LARGE'].includes(code)) return 413;
  if (['UNSUPPORTED_FILE_TYPE', 'FILE_EXTENSION_MISMATCH', 'FILE_TYPE_MISMATCH'].includes(code)) return 415;
  if (['INVALID_INPUT', 'INVALID_FILENAME', 'INVALID_FILE_BODY', 'EMPTY_FILE', 'FILE_INTEGRITY_FAILED'].includes(code)) return 400;
  if (['STALE_DOCUMENT', 'CONFIRMATION_REQUIRED', 'CONFIRMATION_FAILED', 'CONFIRMATION_NOT_FOUND', 'CONFIRMATION_EXPIRED', 'CONFIRMATION_REPLAY', 'CONFIRMATION_CANCELLED', 'CONFIRMATION_EXECUTION_MISMATCH', 'CONFIRMATION_INPUT_MISMATCH', 'CONFIRMATION_USER_MISMATCH', 'CONFIRMATION_CAPABILITY_MISMATCH', 'EXECUTION_IDENTITY_MISMATCH', 'EXECUTION_IN_PROGRESS', 'EXECUTION_RECONCILIATION_REQUIRED', 'EPHEMERAL_OUTPUT_UNAVAILABLE'].includes(code)) return 409;
  if (code === 'IDEMPOTENCY_KEY_REQUIRED') return 400;
  if (code === 'PROCESSOR_BUSY') return 429;
  if (code === 'PROCESSING_TIMEOUT') return 504;
  if (['PROCESSOR_INVALID_RESPONSE', 'PROCESSOR_RESPONSE_TOO_LARGE'].includes(code)) return 502;
  if (['TEMP_CLEANUP_FAILED', 'TEMP_CREATE_FAILED', 'PROCESSOR_NOT_CONFIGURED', 'PROCESSOR_UNAVAILABLE', 'PROCESSOR_AUTH_FAILED', 'MODULE_SETTINGS_UNAVAILABLE'].includes(code)) return 503;
  if (['SOURCE_IMMUTABILITY_VIOLATION', 'OUTPUT_PATH_INVALID', 'OUTPUT_ALREADY_EXISTS', 'OUTPUT_INTEGRITY_FAILED'].includes(code)) return 502;
  if (code === 'EXECUTION_CANCELLED') return 499;
  if (['PROCESSING_FAILED', 'DOCUMENT_PROCESSING_FAILED', 'EXECUTION_ERROR'].includes(code)) return 500;
  if (['UNSAFE_ARCHIVE', 'ARCHIVE_EXPANSION_LIMIT', 'ARCHIVE_ENTRY_LIMIT', 'ARCHIVE_ENTRY_TOO_LARGE', 'UNSAFE_ARCHIVE_PATH', 'UNSAFE_XML', 'MALFORMED_DOCX', 'PACKAGE_NOT_MUTABLE', 'TARGET_NOT_FOUND', 'TARGET_AMBIGUOUS', 'PROVENANCE_NOT_DIRECT', 'PRECONDITION_FAILED', 'UNSUPPORTED_OPERATION', 'POSTCONDITION_FAILED'].includes(code)) return 422;
  return 500;
}

function documentFailure(res: express.Response, result: { errorCode?: string; error?: string; requiresConfirmation?: boolean }) {
  const code = result.errorCode || (result.requiresConfirmation ? 'CONFIRMATION_REQUIRED' : 'DOCUMENT_PROCESSING_FAILED');
  return res.status(documentErrorStatus(code)).json({
    success: false,
    error: result.error || 'Document processing failed safely.',
    code,
    ...(result.requiresConfirmation ? { requiresConfirmation: true } : {}),
  });
}

const DOCUMENT_REQUEST_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_FILE_TYPE: 'Chỉ nhận tệp DOCX.',
  FILE_EXTENSION_MISMATCH: 'Phần mở rộng tên tệp không khớp định dạng DOCX.',
  FILE_TYPE_MISMATCH: 'Nội dung tệp không khớp định dạng DOCX.',
  EMPTY_FILE: 'Tệp DOCX rỗng.',
  FILE_TOO_LARGE: 'Tệp DOCX vượt giới hạn 20 MiB.',
  INVALID_FILENAME: 'Tên tệp không hợp lệ.',
  INVALID_FILE_BODY: 'Thiếu dữ liệu DOCX dạng nhị phân.',
  FILE_INTEGRITY_FAILED: 'Kích thước DOCX không khớp dữ liệu nhận được.',
  DOCUMENT_REQUEST_FAILED: 'Không thể xử lý yêu cầu DOCX an toàn.',
  DOCUMENT_CONFIRMATION_FAILED: 'Không thể chuẩn bị xác nhận DOCX an toàn.',
};

function documentRequestFailure(res: express.Response, error: unknown, fallbackCode: string) {
  const knownProcessorError = error instanceof DocumentProcessorError;
  const candidateCode = knownProcessorError ? error.code : (error as any)?.code;
  const code = knownProcessorError || Object.prototype.hasOwnProperty.call(DOCUMENT_REQUEST_ERROR_MESSAGES, candidateCode)
    ? candidateCode
    : fallbackCode;
  const message = knownProcessorError
    ? error.message
    : DOCUMENT_REQUEST_ERROR_MESSAGES[code] || 'Không thể xử lý yêu cầu DOCX an toàn.';
  return res.status(documentErrorStatus(code)).json({ success: false, error: message, code });
}

function parseDocumentFilename(req: express.Request): { filename: string; mimeType: string } {
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (mimeType !== DOCX_MIME_TYPE) throw Object.assign(new Error('The document route accepts DOCX only.'), { code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
  let rawFilename = String(req.headers['x-file-name'] || 'document.docx');
  try { rawFilename = decodeURIComponent(rawFilename); } catch {
    throw Object.assign(new Error('The document filename is invalid.'), { code: 'INVALID_FILENAME', status: 400 });
  }
  const filename = sanitizeDisplayFilename(rawFilename);
  validateFilenameForMimeType(filename, mimeType);
  return { filename, mimeType };
}

function validateDocumentRequestBytes(req: express.Request): Buffer {
  if (!Buffer.isBuffer(req.body)) throw Object.assign(new Error('A raw DOCX request body is required.'), { code: 'INVALID_FILE_BODY', status: 400 });
  const bytes = req.body as Buffer;
  validateFileBytes(DOCX_MIME_TYPE, bytes);
  const declaredLength = req.headers['content-length'];
  if (typeof declaredLength === 'string' && (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== bytes.length)) {
    throw Object.assign(new Error('The DOCX content length does not match its body.'), { code: 'FILE_INTEGRITY_FAILED', status: 400 });
  }
  return bytes;
}

app.post('/api/document-formatting/inspect', expensiveUserLimiter, requirePermission('files.read'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res) => {
  const cancellation = bindRequestCancellation(req, res);
  let scoped: RequestScopedDocument | undefined;
  try {
    const user = requireAuthenticatedUser(req);
    const { filename, mimeType } = parseDocumentFilename(req);
    const bytes = validateDocumentRequestBytes(req);
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    scoped = makeDocumentScope(bytes, sourceSha256, filename);
    const input = { sourceSha256, sizeBytes: bytes.length, mimeType };
    const result = await runWithRequestScopedDocument(scoped, () => CapabilityExecutionService.execute(
      'document.inspect', input,
      { user, appContext: { user, availableCapabilities: [] }, confirmed: false, abortSignal: cancellation.signal },
      { source: 'rest', requestId: req.requestId, abortSignal: cancellation.signal },
    ));
    if (!result.success) return documentFailure(res, result);
    if (!scoped.inspection) return documentFailure(res, { errorCode: 'PROCESSOR_INVALID_RESPONSE', error: 'The document processor returned no inspection result.' });
    return res.status(200).set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).json({
      success: true,
      result: result.result,
      inspection: scoped.inspection,
    });
  } catch (error: any) {
    if (cancellation.signal.aborted || isCancellationError(error)) {
      if (!res.headersSent && !res.writableEnded) res.status(499).end();
      return;
    }
    return documentRequestFailure(res, error, 'DOCUMENT_REQUEST_FAILED');
  } finally {
    cancellation.cleanup();
    if (scoped) clearRequestScopedDocument(scoped);
  }
});

app.post('/api/document-formatting/automatic', expensiveUserLimiter, requirePermission('files.read'), requirePermission('files.write'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res) => {
  const cancellation = bindRequestCancellation(req, res);
  let scoped: RequestScopedDocument | undefined;
  let responseOwnsOutput = false;
  try {
    const user = requireAuthenticatedUser(req);
    const { filename, mimeType } = parseDocumentFilename(req);
    const bytes = validateDocumentRequestBytes(req);
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    scoped = makeDocumentScope(bytes, sourceSha256, filename);
    const result = await runWithRequestScopedDocument(scoped, () => CapabilityExecutionService.execute(
      'document.autoFormatPage', { sourceSha256, sizeBytes: bytes.length, mimeType },
      { user, appContext: { user, availableCapabilities: [] }, confirmed: false, abortSignal: cancellation.signal },
      { source: 'rest', requestId: req.requestId, abortSignal: cancellation.signal },
    ));
    if (!result.success) return documentFailure(res, result);
    if (!scoped.output) return documentFailure(res, { errorCode: 'EPHEMERAL_OUTPUT_UNAVAILABLE' });
    const output = scoped.output;
    const changes = output.changes ?? [];
    const outputName = `${filename.replace(/\.docx$/i, '') || 'document'}-formatted.docx`;
    responseOwnsOutput = true;
    const cleanup = () => { if (scoped) clearRequestScopedDocument(scoped); };
    res.once('finish', cleanup);
    res.once('close', cleanup);
    return res.status(200).set({
      'Content-Type': DOCX_MIME_TYPE,
      'Content-Length': String(output.bytes.length),
      'Content-Disposition': buildSafeContentDisposition(outputName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Output-Sha256': output.sha256,
      'X-Document-Rule-Profile': 'nd30-safe-v2',
      'X-Document-Changes': Buffer.from(JSON.stringify(changes)).toString('base64url'),
      'X-Document-Body-Report': Buffer.from(JSON.stringify(output.bodySummary)).toString('base64url'),
    }).end(output.bytes);
  } catch (error: any) {
    if (cancellation.signal.aborted || isCancellationError(error)) {
      if (!res.headersSent && !res.writableEnded) res.status(499).end();
      return;
    }
    return documentRequestFailure(res, error, 'DOCUMENT_REQUEST_FAILED');
  } finally {
    cancellation.cleanup();
    if (scoped) {
      clearRequestScopedSource(scoped);
      scoped.inspection = undefined;
      if (!responseOwnsOutput) clearRequestScopedOutput(scoped);
    }
  }
});

app.post('/api/document-formatting/confirm', expensiveUserLimiter, requirePermission('files.read'), requirePermission('files.write'), async (req, res) => {
  const parsed = DocumentAlignmentChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid document alignment confirmation request.', code: 'INVALID_INPUT' });
  const idempotencyKey = req.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'A valid Idempotency-Key is required.', code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  try {
    const user = requireAuthenticatedUser(req);
    const result = await CapabilityExecutionService.execute(
      'document.applyAlignment', parsed.data,
      { user, appContext: { user, availableCapabilities: [] }, confirmed: false },
      { source: 'rest', requestId: req.requestId, idempotencyKey },
    );
    if (result.success || !result.requiresConfirmation) return documentFailure(res, result);
    return res.status(409).json({
      success: false,
      requiresConfirmation: true,
      confirmationId: result.confirmationId,
      confirmationExpiresAt: result.confirmationExpiresAt,
      risk: result.risk,
      effects: result.effects,
      errorCode: result.errorCode,
      error: result.error,
    });
  } catch (error: any) {
    return documentRequestFailure(res, error, 'DOCUMENT_CONFIRMATION_FAILED');
  }
});

app.post('/api/document-formatting/apply', expensiveUserLimiter, requirePermission('files.read'), requirePermission('files.write'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res, next) => {
  const cancellation = bindRequestCancellation(req, res);
  let scoped: RequestScopedDocument | undefined;
  let responseOwnsOutput = false;
  try {
    const user = requireAuthenticatedUser(req);
    const { filename } = parseDocumentFilename(req);
    const bytes = validateDocumentRequestBytes(req);
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    const change = DocumentAlignmentChangeSchema.safeParse({
      sourceSha256: req.headers['x-document-source-sha256'],
      paragraphId: req.headers['x-document-paragraph-id'],
      expectedBefore: req.headers['x-document-expected-alignment'],
      desiredAfter: req.headers['x-document-desired-alignment'],
    });
    if (!change.success) return res.status(400).json({ success: false, error: 'Invalid document alignment metadata.', code: 'INVALID_INPUT' });
    if (sourceSha256 !== change.data.sourceSha256) return res.status(409).json({ success: false, error: 'The selected DOCX differs from the inspected source. Inspect it again.', code: 'STALE_DOCUMENT' });

    const confirmationId = req.get('X-Confirmation-ID')?.trim();
    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!confirmationId || confirmationId.length > 128) return res.status(409).json({ success: false, error: 'A current confirmation challenge is required.', code: 'CONFIRMATION_REQUIRED' });
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return res.status(400).json({ success: false, error: 'A valid Idempotency-Key is required.', code: 'IDEMPOTENCY_KEY_REQUIRED' });

    scoped = makeDocumentScope(bytes, sourceSha256, filename);
    const result = await runWithRequestScopedDocument(scoped, () => CapabilityExecutionService.execute(
      'document.applyAlignment', change.data,
      { user, appContext: { user, availableCapabilities: [] }, confirmed: false, abortSignal: cancellation.signal },
      { source: 'rest', requestId: req.requestId, confirmationId, idempotencyKey, abortSignal: cancellation.signal },
    ));
    if (!result.success) return documentFailure(res, result);
    if (!scoped.output) return documentFailure(res, { errorCode: 'EPHEMERAL_OUTPUT_UNAVAILABLE', error: 'The one-time output is no longer available. Inspect and confirm the document again.' });

    const output = scoped.output;
    const outputName = `${filename.replace(/\.docx$/i, '') || 'document'}-formatted.docx`;
    responseOwnsOutput = true;
    const cleanup = () => { if (scoped) clearRequestScopedDocument(scoped); };
    res.once('finish', cleanup);
    res.once('close', cleanup);
    return res.status(200).set({
      'Content-Type': DOCX_MIME_TYPE,
      'Content-Length': String(output.bytes.length),
      'Content-Disposition': buildSafeContentDisposition(outputName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Output-Sha256': output.sha256,
    }).end(output.bytes);
  } catch (error: any) {
    if (cancellation.signal.aborted || isCancellationError(error)) {
      if (!res.headersSent && !res.writableEnded) res.status(499).end();
      return;
    }
    return documentRequestFailure(res, error, 'DOCUMENT_REQUEST_FAILED');
  } finally {
    cancellation.cleanup();
    if (scoped) {
      clearRequestScopedSource(scoped);
      scoped.inspection = undefined;
      if (!responseOwnsOutput) clearRequestScopedOutput(scoped);
    }
  }
});

function makeDocumentScope(sourceBytes: Buffer, sourceSha256: string, originalName: string): RequestScopedDocument {
  return { sourceBytes, sourceSha256, originalName };
}

app.use('/api/document-formatting', (error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ success: false, error: 'The DOCX exceeds the 20 MiB limit.', code: 'FILE_TOO_LARGE' });
  if (error instanceof SyntaxError) return res.status(400).json({ success: false, error: 'Invalid document request.', code: 'INVALID_INPUT' });
  return next(error);
});

app.post('/api/files', requirePermission('files.write'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res) => {
  const startedAt = Date.now();
  const user = requireAuthenticatedUser(req);
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  let originalName = String(req.headers['x-file-name'] || 'file');
  try { originalName = decodeURIComponent(originalName); } catch { /* sanitizer handles raw value */ }
  const cancellation = bindRequestCancellation(req, res);
  try {
    if (!Buffer.isBuffer(req.body)) throw new FileDomainError('INVALID_FILE_BODY', 400, 'Binary file body is required.');
    const file = await fileIngestionService.ingest(user.id, {
      originalName,
      mimeType,
      bytes: req.body,
      declaredSizeBytes: req.headers['content-length'],
      signal: cancellation.signal,
    });
    try { await AuditService.log({ userId:user.id,userEmail:user.email,roles:user.roles,effectivePermissions:user.permissions,action:'file.upload',target:file.fileId,outcome:'success',source:'user',agentInitiated:false,durationMs:Date.now()-startedAt,metadata:buildSafeFileAuditMetadata({fileId:file.fileId,mimeType:file.mimeType,sizeBytes:file.sizeBytes}) }); } catch (auditError) { console.warn('File upload audit persistence unavailable:', fatalErrorSummary(auditError)); }
    return res.status(201).json({ file });
  } catch (error:any) {
    const status = error instanceof FileDomainError ? error.status : 500;
    const code = error instanceof FileDomainError ? error.code : 'FILE_UPLOAD_FAILED';
    try { await AuditService.log({ userId:user.id,userEmail:user.email,roles:user.roles,effectivePermissions:user.permissions,action:'file.upload',outcome:'execution_error',source:'user',agentInitiated:false,durationMs:Date.now()-startedAt,errorCode:code,metadata:buildSafeFileAuditMetadata({mimeType,sizeBytes:Buffer.isBuffer(req.body)?req.body.length:0}) }); } catch {}
    return res.status(status).json({ error: error instanceof FileDomainError ? error.message : 'File upload failed.', code });
  } finally { cancellation.cleanup(); }
});

app.get('/api/files/:fileId', requirePermission('files.read'), async (req, res) => {
  const user=requireAuthenticatedUser(req);
  try { return res.json({ file: await userFileService.resolve(user.id, req.params.fileId) }); }
  catch(error:any){ const status=error instanceof FileDomainError?error.status:500; return res.status(status).json({error:error instanceof FileDomainError?error.message:'File resolve failed.',code:error instanceof FileDomainError?error.code:'FILE_RESOLVE_FAILED'}); }
});

app.get('/api/files/:fileId/content', requirePermission('files.read'), async (req, res) => {
  const user = requireAuthenticatedUser(req);
  const cancellation = bindRequestCancellation(req, res);
  try {
    const { file, bytes } = await userFileService.readBytes(user.id, req.params.fileId, MAX_FILE_BYTES, cancellation.signal);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': buildSafeContentDisposition(file.originalName),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).end(bytes);
  } catch (error: any) {
    const status = error instanceof FileDomainError ? error.status : 500;
    const code = error instanceof FileDomainError ? error.code : 'FILE_DOWNLOAD_FAILED';
    return res.status(status).json({ error: error instanceof FileDomainError ? error.message : 'File download failed.', code });
  } finally {
    cancellation.cleanup();
  }
});

app.use('/api/files', (error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'File exceeds the application size limit.', code: 'FILE_TOO_LARGE' });
  return next(error);
});

app.get('/api/tasks', requirePermission('tasks.read'), async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const status = z.enum(['todo', 'in-progress', 'completed', 'all']).catch('all').parse(req.query.status);
    res.json({ tasks: await UserDataService.listTasks(user.id, status) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list tasks' });
  }
});

app.get('/api/tasks/stats', requirePermission('tasks.read'), async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    res.json(await UserDataService.taskStats(user.id));
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to load task stats' });
  }
});

app.post('/api/tasks', requirePermission('tasks.write'), async (req, res) => {
  const parsed = TaskCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid task', details: parsed.error.issues });
  try {
    const user = requireAuthenticatedUser(req);
    res.status(201).json({ task: await UserDataService.createTask(user.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create task' });
  }
});

app.patch('/api/tasks/:id', requirePermission('tasks.write'), async (req, res) => {
  const parsed = TaskPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid task patch', details: parsed.error.issues });
  try {
    const user = requireAuthenticatedUser(req);
    res.json({ task: await UserDataService.updateTask(user.id, req.params.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', requirePermission('tasks.delete'), async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    await UserDataService.deleteTask(user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete task' });
  }
});

app.get('/api/memory', requirePermission('memory.read'), async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const status = z.enum(['approved', 'pending', 'all']).catch('all').parse(req.query.status);
    const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(req.query.limit);
    res.json({ memories: await UserDataService.listMemories(user.id, {
      status,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      limit,
    }) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list memories' });
  }
});

app.post('/api/memory', requirePermission('memory.write'), async (req, res) => {
  const parsed = MemoryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid memory', details: parsed.error.issues });
  try {
    const user = requireAuthenticatedUser(req);
    res.status(201).json({ memory: await UserDataService.addMemory(user.id, {
      ...parsed.data,
      status: 'approved',
      source: parsed.data.source || 'Nhập thủ công',
    }) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to add memory' });
  }
});

app.patch('/api/memory/:id', requirePermission('memory.write'), async (req, res) => {
  const parsed = MemoryPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid memory patch', details: parsed.error.issues });
  try {
    const user = requireAuthenticatedUser(req);
    res.json({ memory: await UserDataService.updateMemory(user.id, req.params.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update memory' });
  }
});

app.delete('/api/memory/:id', requirePermission('memory.delete'), async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    await UserDataService.deleteMemory(user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete memory' });
  }
});

app.post('/api/agent/sessions/branch', async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const sourceClientId = parseClientSessionId(req.body.sourceSessionId);
    const beforeUserTurn = z.coerce.number().int().min(0).max(10000).parse(req.body.beforeUserTurn);
    const temporaryMode = req.body.temporaryMode === true;
    const sessionService: any = temporaryMode ? temporarySessionService : adkSessionService;
    const sourceSession = await sessionService.getSession({
      appName: AGENT_APP_NAME,
      userId: user.id,
      sessionId: serverSessionId(user.id, sourceClientId),
    });
    if (!sourceSession) return res.status(404).json({ error: 'Source session not found' });

    const newClientId = randomUUID();
    const branchedSession = await sessionService.createSession({
      appName: AGENT_APP_NAME,
      userId: user.id,
      sessionId: serverSessionId(user.id, newClientId),
      state: {},
    });

    const copiedEvents: any[] = [];
    let userTurn = 0;
    for (const event of sourceSession.events || []) {
      if (eventIsUserMessage(event)) {
        if (userTurn === beforeUserTurn) break;
        userTurn += 1;
      }
      await sessionService.appendEvent({ session: branchedSession, event });
      copiedEvents.push(event);
    }

    res.status(201).json({
      branch: {
        sessionId: newClientId,
        messages: sessionTranscript(copiedEvents),
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to branch Agent session' });
  }
});

// Persistent Agent session history. Temporary sessions intentionally never appear here.
app.get('/api/agent/sessions', async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(req.query.limit);
    const summaries = await adkSessionService.listSessionSummaries(AGENT_APP_NAME, user.id, limit);
    res.json({
      sessions: summaries.map((summary) => ({
        id: clientSessionIdFromServer(user.id, summary.sessionId),
        title: summary.title,
        lastUpdateTime: summary.lastUpdateTime,
        eventCount: summary.eventCount,
      })),
      persistence: adkSessionService.getPersistenceHealth(),
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list Agent sessions' });
  }
});

app.get('/api/agent/sessions/:sessionId', async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const clientId = parseClientSessionId(req.params.sessionId);
    const session = await adkSessionService.getSession({
      appName: AGENT_APP_NAME,
      userId: user.id,
      sessionId: serverSessionId(user.id, clientId),
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({
      session: {
        id: clientId,
        lastUpdateTime: session.lastUpdateTime,
        messages: sessionTranscript(session.events || []),
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to load Agent session' });
  }
});

app.delete('/api/agent/sessions/:sessionId', async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const clientId = parseClientSessionId(req.params.sessionId);
    await adkSessionService.deleteSession({
      appName: AGENT_APP_NAME,
      userId: user.id,
      sessionId: serverSessionId(user.id, clientId),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete Agent session' });
  }
});

// Agent Chat API (ADK + assistant-ui)
app.post('/api/agent/chat', expensiveUserLimiter, async (req, res) => {
  const requestCancellation = bindRequestCancellation(req, res);
  const executionDeadline = createExecutionDeadline(requestCancellation.signal);
  try {
    const user = req.user || await ServerIdentityProvider.getIdentity(req);
    const aiConfigResult = AIConfigSchema.safeParse(req.body.aiConfig || {});
    if (!aiConfigResult.success) {
      executionDeadline.cleanup();
      return res.status(400).json({
        error: 'Invalid aiConfig',
        details: aiConfigResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const validatedAIConfig = aiConfigResult.data;
    // Canonical semantic contract: exactly one normal message or supported HITL FunctionResponse.
    // Malformed bodies are rejected deterministically; no intent guessing/default greeting.
    const parsed = parseStrictAgentChatRequest(req.body);
    const newMessage = parsed.newMessage;
    
    // Phase A: Identity Trust Boundary Sanitization
    const sanitizedStateDelta = { ...(parsed.stateDelta || {}) };
    delete (sanitizedStateDelta as any).user;
    delete (sanitizedStateDelta as any).userId;
    delete (sanitizedStateDelta as any).email;
    delete (sanitizedStateDelta as any).roles;
    delete (sanitizedStateDelta as any).permissions;
    delete (sanitizedStateDelta as any).admin;
    delete (sanitizedStateDelta as any).confirmed;

    const execContext = {
      user,
      appContext: { 
        ...sanitizedStateDelta, 
        user, 
        availableCapabilities: [],
        aiConfig: validatedAIConfig,
      },
      confirmed: false,
      abortSignal: executionDeadline.signal,
    };

    // Derive the server-owned session identity before building tools so mutation
    // idempotency never depends on model/client-supplied function arguments.
    const rawSessionId = parseClientSessionId((req.body as any).sessionId || 'default-session');
    const sessionId = serverSessionId(user.id, rawSessionId);

    const temporaryMode = req.body.temporaryMode === true;

    // Current-request attachments become an immutable, read-only ADK artifact
    // view. Metadata authorization happens now; bytes remain lazy until ADK's
    // native LoadArtifactsTool requests an artifact.
    const attachmentRefs = parsed.attachments ?? [];
    const artifactService = attachmentRefs.length > 0
      ? await createRunScopedArtifactService(user.id, attachmentRefs, userFileService, executionDeadline.signal)
      : undefined;

    // 1. Build dynamic agent for this context. Native ADK owns the FunctionCall
    // -> FunctionTool -> FunctionResponse -> continued-reasoning loop.
    const agent = await RootAgent.buildAgent(
      execContext,
      { sessionId, abortSignal: executionDeadline.signal, temporaryMode },
      artifactService !== undefined,
    );

    // 2. Create runner
    const appName = AGENT_APP_NAME;
    const sessionService = temporaryMode ? temporarySessionService : adkSessionService;

    try {
      if (temporaryMode) {
        const existing = await temporarySessionService.getSession({ appName, userId: user.id, sessionId });
        if (!existing) {
          await temporarySessionService.createSession({ appName, userId: user.id, sessionId });
        }
      } else {
        await adkSessionService.getOrCreateSession({ appName, userId: user.id, sessionId });
      }
    } catch (err) {
      console.warn('Session init error:', fatalErrorSummary(err));
      throw err;
    }

    const runner = createCanonicalAgentRunner({
      agent,
      appName,
      sessionService,
      ...(artifactService ? { artifactService } : {}),
    });

    // 3. Run and stream
    const stream = runner.runAsync({
      userId: user.id,
      sessionId,
      newMessage: newMessage as any,
      stateDelta: sanitizedStateDelta,
      abortSignal: executionDeadline.signal,
    });

    const response = adkEventStream(stream as any);
    
    // Bridge Web Response to Express res
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const body = response.body as any;
      if (typeof body.getReader === 'function') {
        const reader = body.getReader();
        let terminalSent = false;
        const bridge = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                if (!terminalSent && !res.writableEnded && !executionDeadline.signal.aborted) {
                  terminalSent = true;
                  this.push(Buffer.from(serializeAgentTransportComplete()));
                }
                this.push(null);
              } else if (!executionDeadline.signal.aborted) {
                this.push(Buffer.from(value));
              }
            } catch (err: any) {
              if (!terminalSent && (!executionDeadline.signal.aborted || executionDeadline.timedOut)) {
                terminalSent = true;
                const code = executionDeadline.timedOut ? 'AGENT_TIMEOUT' : (safeErrorCode(err) || 'STREAM_ERROR');
                this.push(Buffer.from(serializeAgentTransportError(code)));
              }
              this.push(null);
            }
          }
        });
        const cancelReader = () => {
          if (executionDeadline.timedOut && !terminalSent && !res.writableEnded) {
            terminalSent = true;
            bridge.push(Buffer.from(serializeAgentTransportError('AGENT_TIMEOUT')));
            bridge.push(null);
          } else if (!executionDeadline.timedOut) {
            bridge.destroy();
          }
          void reader.cancel().catch(() => undefined);
        };
        executionDeadline.signal.addEventListener('abort', cancelReader, { once: true });
        bridge.once('close', () => {
          executionDeadline.signal.removeEventListener('abort', cancelReader);
          executionDeadline.cleanup();
        });
        bridge.pipe(res);
      } else if (body[Symbol.asyncIterator]) {
        try {
          for await (const chunk of body) {
            res.write(chunk);
          }
          if (!executionDeadline.signal.aborted) {
            res.write(serializeAgentTransportComplete());
          }
        } catch (err: any) {
          if (!executionDeadline.signal.aborted || executionDeadline.timedOut) {
            const code = executionDeadline.timedOut ? 'AGENT_TIMEOUT' : (safeErrorCode(err) || 'STREAM_ERROR');
            res.write(serializeAgentTransportError(code));
          }
        } finally {
          executionDeadline.cleanup();
          if (!res.writableEnded) res.end();
        }
      } else {
        executionDeadline.cleanup();
        res.end();
      }
    } else {
      executionDeadline.cleanup();
      res.end();
    }
  } catch (err: any) {
    executionDeadline.cleanup();
    if (executionDeadline.timedOut) {
      if (!res.headersSent && !res.writableEnded) {
        res.status(504).json({ error: 'Agent execution timed out.', code: 'AGENT_TIMEOUT' });
      }
      return;
    }
    if (requestCancellation.signal.aborted || isCancellationError(err)) {
      if (!res.headersSent && !res.writableEnded) res.status(499).end();
      return;
    }
    console.error('Agent chat error:', fatalErrorSummary(err));
    if (!res.headersSent) {
      const code = safeErrorCode(err);
      const status = Number(err?.status) || 500;
      res.status(status).json({
        error: redactAuditString(err?.message || 'Internal agent error'),
        ...(code ? { code } : {}),
      });
    }
  }
});

// List Capabilities
app.get('/api/capabilities', async (req, res) => {
  try {
    const user = requireAuthenticatedUser(req);
    const caps = (await ServerCapabilityRegistry.listForContext({
      user,
      appContext: { user, availableCapabilities: [] },
      confirmed: false,
    }, 'rest')).map(c => ({
      id: c.id,
      moduleId: c.moduleId,
      description: c.description,
      risk: c.risk,
      permissions: c.permissions,
    }));
    res.json(caps);
  } catch (err: any) {
    res.status(503).json({ error: redactAuditString(err?.message || 'Module settings persistence unavailable.') });
  }
});

// Execute Capability through the single server-authoritative gateway.
app.post('/api/capabilities/execute', expensiveUserLimiter, async (req, res) => {
  const requestCancellation = bindRequestCancellation(req, res);
  try {
    const { id, input, context, confirmationId } = req.body || {};
    const idempotencyKeyHeader = req.get('Idempotency-Key');
    const idempotencyKey = typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader.trim() : undefined;
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: 'Idempotency-Key must be 8-128 characters using A-Z, a-z, 0-9, dot, underscore, colon, or hyphen.' });
    }
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Capability ID is required.' });
    }
    if (id === 'document.inspect' || id === 'document.applyAlignment' || id === 'document.autoFormatPage') {
      return res.status(404).json({ error: 'Document capabilities require their authenticated binary routes.', code: 'DOCUMENT_ROUTE_REQUIRED' });
    }
    if (confirmationId !== undefined && typeof confirmationId !== 'string') {
      return res.status(400).json({ error: 'confirmationId must be a string when provided.' });
    }

    const user = requireAuthenticatedUser(req);
    const appContext = context && typeof context === 'object' && !Array.isArray(context)
      ? { ...context, user }
      : { user, availableCapabilities: [] };
    const result = await CapabilityExecutionService.execute(
      id,
      input,
      { user, appContext, confirmed: false, abortSignal: requestCancellation.signal },
      { source: 'rest', requestId: req.requestId, idempotencyKey, confirmationId, abortSignal: requestCancellation.signal },
    );

    if (result.requiresConfirmation) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err: any) {
    if (requestCancellation.signal.aborted || isCancellationError(err)) {
      if (!res.headersSent && !res.writableEnded) res.status(499).end();
      return;
    }
    console.error('Capability execution error:', fatalErrorSummary(err));
    res.status(500).json({ success: false, error: redactAuditString(err?.message || 'Internal server error') });
  }
});

// Audit Logs
app.get('/api/audit', async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing user identity' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const hasAuditRead = user.permissions?.includes('audit.read');
    const page = await AuditService.list({
      limit,
      cursor,
      userId: hasAuditRead ? undefined : user.id,
    });
    res.json(page);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Module Manager Settings
app.get('/api/modules', async (_req, res) => {
  try {
    const settings = await storage.listModuleSettings();
    res.json(settings.map(setting => isServerModuleReleaseReady(setting.id)
      ? setting
      : { ...setting, enabled: false }));
  } catch (err: any) {
    res.status(503).json({ error: redactAuditString(err?.message || 'Module settings persistence unavailable.') });
  }
});

app.post('/api/modules/:id/toggle', requirePermission('module.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = requireAuthenticatedUser(req);
    await storage.hydrate();
    const mod = storage.getData().moduleSettings[id];

    if (!mod) {
      return res.status(404).json({ error: `Module "${id}" not found.` });
    }

    if (!mod.canDisable) {
      return res.status(400).json({ error: `Module "${id}" is core and cannot be disabled.` });
    }

    if (id === 'document-formatting') {
      const requested = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
      if (!requested.success) return res.status(400).json({ error: 'An explicit enabled state is required.', code: 'INVALID_MODULE_STATE' });
      if (requested.data.enabled && !isServerModuleReleaseReady(id)) {
        return res.status(409).json({
          error: 'Document Formatting V1 remains disabled until processor security and deployment preflight are approved.',
          code: 'DOCUMENT_FORMATTING_RELEASE_GATE_CLOSED',
        });
      }
      const updated = await storage.setModuleEnabledWithAudit(id, requested.data.enabled, user);
      return res.json({ ...updated, enabled: updated.enabled && isServerModuleReleaseReady(id) });
    }

    const updated = await storage.toggleModuleEnabledWithAudit(id, user);
    res.json(updated);
  } catch (err: any) {
    console.error('Module persistence error:', fatalErrorSummary(err));
    res.status(503).json({ error: redactAuditString(err?.message || 'Module settings persistence unavailable.') });
  }
});

function isServerModuleReleaseReady(moduleId: string): boolean {
  const guard = serverModuleCatalog.get(moduleId)?.isReleaseReady;
  if (!guard) return true;
  try { return guard() === true; } catch { return false; }
}

// Keep API misses inside the JSON API contract instead of letting the SPA
// catch-all return index.html to an API client.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.', code: 'API_ROUTE_NOT_FOUND' });
});

async function startServer() {
  try {
    await storage.hydrate();
  } catch (err) {
    console.error('Module settings persistence unavailable at startup:', fatalErrorSummary(err));
  }

  // Vite Middleware or Production Static Handling
  if (process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenHost = resolveListenHost();
  app.listen(PORT, listenHost, () => {
    console.log(`Server running on http://${listenHost}:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch((err) => {
    console.error('Server startup failed:', fatalErrorSummary(err));
    process.exit(1);
  });
}
