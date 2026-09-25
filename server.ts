import { bootstrapServer } from "./server/bootstrap";
// 1. Bootstrap catalog first so storage can seed correctly
bootstrapServer();

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { randomUUID } from 'crypto';
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
import { adminFirestore, firebaseAdminConfig, probeFirestoreAdmin } from './server/lib/firebaseAdmin';
import firebaseConfig from './firebase-applet-config.json';
import { AIConfigSchema, type AIProviderId } from './shared/contracts/ai';
import { z } from 'zod';
import { UserDataService } from './server/core/data/UserDataService';
import { computeRuntimeHealth } from './server/core/runtime/runtimeHealthPolicy';
import { bindRequestCancellation, isCancellationError } from './server/core/runtime/requestCancellation';
import { createExecutionDeadline } from './server/core/runtime/executionDeadline';
import { redactAuditString, sanitizeAuditValue } from './server/core/audit/auditRedaction';
import { toSafeProviderError } from './server/core/ai/credentialRotationPolicy';
import { parseStrictAgentChatRequest } from './server/agent/chat/chatRequestContract';
import { serializeAgentTransportComplete, serializeAgentTransportError } from './server/agent/chat/sseTransport';
import { sessionTranscript } from './server/agent/chat/sessionHistory';
import { FileDomainError } from './server/core/files/UserFileService';
import { fileIngestionService, userFileService } from './server/core/files/firebaseFileStores';
import { MAX_FILE_BYTES, buildSafeFileAuditMetadata } from './server/core/files/filePolicy';
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
  keyGenerator: (req: express.Request) => `user:${(req as any).user?.id || 'missing-auth'}`,
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
    (req as any).user = user;
    next();
  } catch (err: any) {
    console.warn(`Auth blocked request to ${req.path}: ${err.message}`);
    res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  }
});

// Shared authorization middleware
function requirePermission(permission: string) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = (req as any).user;
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
  const user = (req as any).user;
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
  const user = (req as any).user;
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
  const user = (req as any).user;
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
  const user = (req as any).user;
  try {
    res.json(await CredentialService.listAgentCredentialOptions(user.id));
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to list Agent credentials');
    res.status(safe.status).json(safe.body);
  }
});

app.get('/api/ai/credentials', async (req, res) => {
  const user = (req as any).user;
  try {
    res.json(await CredentialService.listCredentials(user.id));
  } catch (err: any) {
    const safe = credentialErrorResponse(err, 'Failed to list credentials');
    res.status(safe.status).json(safe.body);
  }
});

app.post('/api/ai/credentials', async (req, res) => {
  const parsed = CredentialCreateSchema.safeParse(req.body);
  const user = (req as any).user;
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
  const user = (req as any).user;
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
  const user = (req as any).user;
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
  const user = (req as any).user;
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
  dueDate: z.string().max(64).optional(),
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
app.post('/api/files', requirePermission('files.write'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req, res) => {
  const startedAt = Date.now();
  const user = (req as any).user;
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
  const user=(req as any).user;
  try { return res.json({ file: await userFileService.resolve(user.id, req.params.fileId) }); }
  catch(error:any){ const status=error instanceof FileDomainError?error.status:500; return res.status(status).json({error:error instanceof FileDomainError?error.message:'File resolve failed.',code:error instanceof FileDomainError?error.code:'FILE_RESOLVE_FAILED'}); }
});

app.use('/api/files', (error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'File exceeds the application size limit.', code: 'FILE_TOO_LARGE' });
  return next(error);
});

app.get('/api/tasks', requirePermission('tasks.read'), async (req, res) => {
  try {
    const user = (req as any).user;
    const status = z.enum(['todo', 'in-progress', 'completed', 'all']).catch('all').parse(req.query.status);
    res.json({ tasks: await UserDataService.listTasks(user.id, status) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list tasks' });
  }
});

app.get('/api/tasks/stats', requirePermission('tasks.read'), async (req, res) => {
  try {
    const user = (req as any).user;
    res.json(await UserDataService.taskStats(user.id));
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to load task stats' });
  }
});

app.post('/api/tasks', requirePermission('tasks.write'), async (req, res) => {
  const parsed = TaskCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid task', details: parsed.error.issues });
  try {
    const user = (req as any).user;
    res.status(201).json({ task: await UserDataService.createTask(user.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create task' });
  }
});

app.patch('/api/tasks/:id', requirePermission('tasks.write'), async (req, res) => {
  const parsed = TaskPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid task patch', details: parsed.error.issues });
  try {
    const user = (req as any).user;
    res.json({ task: await UserDataService.updateTask(user.id, req.params.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', requirePermission('tasks.delete'), async (req, res) => {
  try {
    const user = (req as any).user;
    await UserDataService.deleteTask(user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete task' });
  }
});

app.get('/api/memory', requirePermission('memory.read'), async (req, res) => {
  try {
    const user = (req as any).user;
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
    const user = (req as any).user;
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
    const user = (req as any).user;
    res.json({ memory: await UserDataService.updateMemory(user.id, req.params.id, parsed.data) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update memory' });
  }
});

app.delete('/api/memory/:id', requirePermission('memory.delete'), async (req, res) => {
  try {
    const user = (req as any).user;
    await UserDataService.deleteMemory(user.id, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete memory' });
  }
});

app.post('/api/agent/sessions/branch', async (req, res) => {
  try {
    const user = (req as any).user;
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
    const user = (req as any).user;
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
    const user = (req as any).user;
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
    const user = (req as any).user;
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
    const user = (req as any).user || await ServerIdentityProvider.getIdentity(req);
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
    const user = (req as any).user;
    const caps = (await ServerCapabilityRegistry.listForContext({
      user,
      appContext: { user, availableCapabilities: [] },
      confirmed: false,
    })).map(c => ({
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
    if (confirmationId !== undefined && typeof confirmationId !== 'string') {
      return res.status(400).json({ error: 'confirmationId must be a string when provided.' });
    }

    const user = (req as any).user;
    const appContext = context && typeof context === 'object' && !Array.isArray(context)
      ? { ...context, user }
      : { user, availableCapabilities: [] };
    const result = await CapabilityExecutionService.execute(
      id,
      input,
      { user, appContext, confirmed: false, abortSignal: requestCancellation.signal },
      { source: 'rest', requestId: (req as any).requestId, idempotencyKey, confirmationId, abortSignal: requestCancellation.signal },
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
    const user = (req as any).user;
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
    res.json(await storage.listModuleSettings());
  } catch (err: any) {
    res.status(503).json({ error: redactAuditString(err?.message || 'Module settings persistence unavailable.') });
  }
});

app.post('/api/modules/:id/toggle', requirePermission('module.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    await storage.hydrate();
    const mod = storage.getData().moduleSettings[id];

    if (!mod) {
      return res.status(404).json({ error: `Module "${id}" not found.` });
    }

    if (!mod.canDisable) {
      return res.status(400).json({ error: `Module "${id}" is core and cannot be disabled.` });
    }

    const updated = await storage.toggleModuleEnabledWithAudit(id, user);
    res.json(updated);
  } catch (err: any) {
    console.error('Module persistence error:', fatalErrorSummary(err));
    res.status(503).json({ error: redactAuditString(err?.message || 'Module settings persistence unavailable.') });
  }
});

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch((err) => {
    console.error('Server startup failed:', fatalErrorSummary(err));
    process.exit(1);
  });
}