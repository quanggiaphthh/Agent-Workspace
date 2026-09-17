import { bootstrapServer } from "./server/bootstrap";
// 1. Bootstrap catalog first so storage can seed correctly
bootstrapServer();

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { RootAgent } from './server/agent/adk/RootAgent';
import { InMemoryRunner } from '@google/adk';
import { FirestoreSessionService } from './server/agent/adk/FirestoreSessionService';
import { adkEventStream, parseAdkRequest, toAdkContent } from '@assistant-ui/react-google-adk/server';
import { ServerCapabilityRegistry } from './server/core/capabilities/serverCapabilityRegistry';
import { Readable } from 'stream';
import { AuditService } from './server/core/audit/auditService';
import { storage } from './server/infrastructure/storage';
import { ServerIdentityProvider } from './server/core/auth/identityProvider';
import { PermissionResolver } from './server/core/permissions/permissionResolver';
import { adminFirestore } from './server/lib/firebaseAdmin';
import firebaseConfig from './firebase-applet-config.json';

dotenv.config();

const PORT = 3000;
const adkSessionService = new FirestoreSessionService();

export const app = express();

// Fix express-rate-limit warning in proxy environments
app.set('trust proxy', 1);

// Production Guards
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Vite/Dev if needed, but in production we should fine-tune
  crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiting to API requests only
app.use('/api', limiter);

// JSON request size limit
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    capabilitiesCount: ServerCapabilityRegistry.listAll().length,
    storageInitialized: true,
  });
});

// Global crash guard for unhandled rejections (Phase 7 Robustness)
process.on('unhandledRejection', (reason, promise) => {
  console.error('>>> [UNHANDLED REJECTION]:', reason);
  // Do NOT exit in production dev environment to keep the app reachable
});

process.on('uncaughtException', (err) => {
  console.error('>>> [UNCAUGHT EXCEPTION]:', err);
});

// Client error logger
app.post('/api/log-error', (req, res) => {
  console.error('>>> [CLIENT REPORTED ERROR]:', JSON.stringify(req.body, null, 2));
  res.json({ received: true });
});

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
    firebaseProjectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    envHasADC: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
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
import { AIProviderManager } from './server/core/ai/AIProviderManager';
import { CredentialService } from './server/core/ai/CredentialService';

app.post('/api/ai/test-key', async (req, res) => {
  const { providerId, key } = req.body;
  if (!providerId || !key) {
    return res.status(400).json({ error: 'Missing providerId or key' });
  }

  try {
    const adapter = AIProviderManager.getAdapter(providerId);
    const result = await adapter.testKey(key);
    
    if (!result.success) {
      return res.status(result.statusCode || 401).json({ error: result.error });
    }
    
    res.json(result);
  } catch (err: any) {
    console.error('Test key error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Provider communication error' });
  }
});

app.get('/api/ai/models', async (req, res) => {
  const { providerId, credentialId } = req.query;
  const user = (req as any).user;

  if (!providerId || !credentialId) {
    return res.status(400).json({ error: 'Missing providerId or credentialId' });
  }

  try {
    const cred = await CredentialService.getCredential(user.id, credentialId as string);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    
    const adapter = AIProviderManager.getAdapter(providerId as any);
    const models = await adapter.listModels(cred.key);
    
    res.json({ success: true, models });
  } catch (err: any) {
    console.error('Fetch models error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch models' });
  }
});

app.post('/api/ai/test-model', async (req, res) => {
  const { providerId, credentialId, modelId } = req.body;
  const user = (req as any).user;
  
  try {
    const cred = await CredentialService.getCredential(user.id, credentialId);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    
    const adapter = AIProviderManager.getAdapter(providerId as any);
    const success = await adapter.testModel(cred.key, modelId);
    
    if (!success) return res.status(400).json({ error: 'Model test failed' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/ai/credentials', async (req, res) => {
  const user = (req as any).user;
  const creds = await CredentialService.listCredentials(user.id);
  res.json(creds);
});

app.post('/api/ai/credentials', async (req, res) => {
  const { providerId, key, name } = req.body;
  const user = (req as any).user;
  if (!providerId || !key) return res.status(400).json({ error: 'Missing data' });
  
  try {
    const id = await CredentialService.saveCredential(user.id, providerId, key, name || 'Key');
    res.json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ai/credentials/:id', async (req, res) => {
  const user = (req as any).user;
  await CredentialService.deleteCredential(user.id, req.params.id);
  res.json({ success: true });
});

// Agent Chat API (ADK + assistant-ui)
app.post('/api/agent/chat', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing user identity' });
    }
    const reqWithJson = typeof (req as any).json === 'function' ? req : { json: async () => req.body };
    let parsed: any = {};
    let newMessage: any;

    if (req.body.toolResponse) {
      newMessage = req.body.toolResponse;
      parsed = {
        stateDelta: req.body.stateDelta || {},
      };
    } else {
      try {
        parsed = await (parseAdkRequest as any)(reqWithJson);
        newMessage = toAdkContent(parsed);
      } catch (parseErr) {
        const bodyMsg = req.body.message || (typeof req.body.messages?.[req.body.messages.length - 1]?.content === 'string'
          ? req.body.messages[req.body.messages.length - 1].content
          : req.body.messages?.[req.body.messages.length - 1]?.content?.[0]?.text) || 'Xin chào';
        parsed = {
          type: 'message',
          text: bodyMsg,
          stateDelta: req.body.stateDelta || {},
        };
        newMessage = { role: 'user', parts: [{ text: bodyMsg }] };
      }
    }
    
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
        aiConfig: req.body.aiConfig,
      },
      confirmed: false,
    };

    // 1. Build dynamic agent for this context
    const agent = await RootAgent.buildAgent(execContext);
    
    // 2. Create runner
    // sessionId must be associated with the user for isolation
    const rawSessionId = (req.body as any).sessionId || 'default-session';
    const sessionId = `u_${user.id}_s_${rawSessionId}`;
    const appName = 'root_agent';

    try {
      await adkSessionService.getOrCreateSession({
        appName,
        userId: user.id,
        sessionId,
      });
    } catch (err) {
      console.warn('Session init error (possibly already exists):', err);
    }

    const runner = new InMemoryRunner({
      agent,
      appName,
    });
    (runner as any).sessionService = adkSessionService;

    // 3. Run and stream
    const stream = runner.runAsync({
      userId: user.id,
      sessionId,
      newMessage: newMessage as any,
      stateDelta: sanitizedStateDelta,
    });

    const response = adkEventStream(stream as any);
    
    // Bridge Web Response to Express res
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const body = response.body as any;
      if (typeof body.getReader === 'function') {
        const reader = body.getReader();
        const bridge = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
              } else {
                this.push(Buffer.from(value));
              }
            } catch (err) {
              this.destroy(err as any);
            }
          }
        });
        bridge.pipe(res);
      } else if (body[Symbol.asyncIterator]) {
        for await (const chunk of body) {
          res.write(chunk);
        }
        res.end();
      } else {
        res.end();
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error('Agent chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal agent error' });
    }
  }
});

// List Capabilities
app.get('/api/capabilities', (req, res) => {
  const caps = ServerCapabilityRegistry.listAll().map(c => ({
    id: c.id,
    moduleId: c.moduleId,
    description: c.description,
    risk: c.risk,
    permissions: c.permissions,
  }));
  res.json(caps);
});

// Execute Capability
app.post('/api/capabilities/execute', async (req, res) => {
  try {
    const { id, input, context, confirmed } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Capability ID is required.' });
    }

    const user = await ServerIdentityProvider.getIdentity(req);

    const execContext = {
      user,
      appContext: context,
      confirmed: Boolean(confirmed),
    };

    const result = await ServerCapabilityRegistry.execute(id, input, execContext);
    res.json(result);
  } catch (err: any) {
    console.error('Capability execution error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
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
    const logs = await AuditService.list(limit);

    const hasAuditRead = user.permissions?.includes('audit.read') || user.roles?.includes('admin') || user.roles?.includes('auditor');
    
    if (hasAuditRead) {
      res.json(logs);
    } else {
      // User thường chỉ được xem log userId của chính mình
      const filteredLogs = logs.filter((log: any) => log.userId === user.id);
      res.json(filteredLogs);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Module Manager Settings
app.get('/api/modules', (req, res) => {
  const data = storage.getData();
  res.json(Object.values(data.moduleSettings));
});

app.post('/api/modules/:id/toggle', requirePermission('module.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const data = storage.getData();
    const mod = data.moduleSettings[id];

    if (!mod) {
      return res.status(404).json({ error: `Module "${id}" not found.` });
    }

    if (!mod.canDisable) {
      return res.status(400).json({ error: `Module "${id}" is core and cannot be disabled.` });
    }

    mod.enabled = !mod.enabled;
    storage.commit();

    AuditService.log({
      userId: user.id,
      action: mod.enabled ? 'module.enable' : 'module.disable',
      moduleId: id,
      target: id,
      metadata: { enabled: mod.enabled },
      status: 'success',
    });

    res.json(mod);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // Vite Middleware or Production Static Handling

  // Vite Middleware or Production Static Handling
  if (process.env.NODE_ENV !== 'production') {
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

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(console.error);
}
