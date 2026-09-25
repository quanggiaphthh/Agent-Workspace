import { AIProviderId, AIModelMetadata, TestKeyResponse } from '../../../shared/contracts/ai';
import { redactAuditString } from '../audit/auditRedaction';

export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

export function providerRequestTimeoutMs(envValue = process.env.AI_PROVIDER_TIMEOUT_MS): number {
  if (envValue === undefined || envValue === '') return DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? Math.floor(parsed)
    : DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
}

async function providerFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;

  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) {
      controller.abort(Object.assign(new Error('Provider request timed out.'), {
        code: 'PROVIDER_TIMEOUT',
        status: 504,
      }));
    }
  }, providerRequestTimeoutMs());
  timer.unref?.();

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw Object.assign(new Error('Provider request timed out.'), {
        code: 'PROVIDER_TIMEOUT',
        status: 504,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

export interface ProviderAdapter {
  id: AIProviderId;
  testKey(key: string): Promise<TestKeyResponse>;
  listModels(key: string): Promise<AIModelMetadata[]>;
  testModel(key: string, modelId: string): Promise<boolean>;
}

/**
 * Normalizes error responses from providers to a unified format.
 * Strictly avoids logging raw API keys.
 */
export function redactProviderError(err: any, secret?: string): string {
  let message = redactAuditString(String(err?.message || err || 'Unknown provider error'));
  if (secret) message = message.split(secret).join('[redacted]');
  return message.slice(0, 1000);
}

function normalizeError(err: any, providerId: string, stage: string, endpoint?: string, modelId?: string, secret?: string): TestKeyResponse {
  const status = Number(err?.status || err?.statusCode || 500);
  const safeMessage = redactProviderError(err, secret);
  
  // Diagnostics intentionally exclude request headers and raw credential material.
  console.error(`[AI Provider Diagnostics] provider=${providerId} stage=${stage} endpoint=${endpoint || 'unknown'} modelId=${modelId || 'none'} status=${status} message="${safeMessage}"`);
  
  let userMessage = 'Đã xảy ra lỗi hệ thống khi kết nối nhà cung cấp';
  
  if (status === 401) {
    userMessage = `API Key ${providerId.toUpperCase()} không hợp lệ hoặc đã bị thu hồi`;
  } else if (status === 403) {
    // 403 = valid credential but lacking scope/entitlement
    userMessage = `API Key ${providerId.toUpperCase()} hợp lệ nhưng không có quyền truy cập (Forbidden/Forbidden Scope)`;
  } else if (status === 429) {
    userMessage = `Nhà cung cấp ${providerId.toUpperCase()} thông báo hết hạn mức (Quota/Rate limited)`;
  } else if (status === 504 || err?.code === 'PROVIDER_TIMEOUT') {
    userMessage = `Kết nối đến nhà cung cấp ${providerId.toUpperCase()} đã hết thời gian chờ`;
  } else if (status >= 500) {
    userMessage = `Nhà cung cấp ${providerId.toUpperCase()} đang gặp sự cố kỹ thuật (5xx/Server Error)`;
  } else if (err.name === 'AbortError' || err.message?.includes('fetch')) {
    userMessage = `Lỗi kết nối mạng đến nhà cung cấp ${providerId.toUpperCase()}`;
  }

  return {
    success: false,
    error: userMessage,
    statusCode: status
  };
}

export function getGoogleModelRank(id: string): number {
  if (id === 'gemini-3.5-flash-lite') return 1;
  if (id.includes('flash-lite')) return 2;
  if (id.includes('flash')) return 3;
  return 4;
}

export class GoogleAdapter implements ProviderAdapter {
  id: AIProviderId = 'google';

  async testKey(key: string): Promise<TestKeyResponse> {
    try {
      const models = await this.listModels(key);
      return { success: true, models };
    } catch (err: any) {
      return normalizeError(err, this.id, 'TEST_KEY', '/models', undefined, key);
    }
  }

  async listModels(key: string): Promise<AIModelMetadata[]> {
    const k = key.trim();
    const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
    
    if (response.status === 401) throw { status: 401 };
    if (response.status === 429) throw { status: 429 };
    if (!response.ok) throw { status: response.status, message: `Google error: ${response.statusText}` };

    const data = await response.json();
    
    return data.models
      .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
      .filter((m: any) => !m.name.includes('embedding') && !m.name.includes('aqa') && !m.name.includes('text-vision'))
      .map((m: any) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
        description: m.description,
        contextWindow: m.inputTokenLimit,
        capabilities: ['text', 'chat'],
        lifecycle: m.name.includes('flash') || m.name.includes('pro') ? 'stable' : 'beta'
      }))
      .sort((a: any, b: any) => {
        const rankA = getGoogleModelRank(a.id);
        const rankB = getGoogleModelRank(b.id);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return a.name.localeCompare(b.name);
      });
  }

  async testModel(key: string, modelId: string): Promise<boolean> {
    const k = key.trim();
    const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${k}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Inference Test' }] }],
        generationConfig: { maxOutputTokens: 2 }
      })
    });
    if (!response.ok) throw { status: response.status, message: `Google model test failed: ${response.statusText}` };
    return true;
  }
}

export class OpenAIAdapter implements ProviderAdapter {
  id: AIProviderId = 'openai';
  private baseUrl = 'https://api.openai.com/v1';

  async testKey(key: string): Promise<TestKeyResponse> {
    const k = key.trim();
    try {
      const models = await this.listModels(k);
      // Validate by doing a real minimal inference on a safe model
      const testModelId = models.find(m => m.id.includes('gpt-4o') || m.id.includes('gpt-3.5'))?.id || models[0]?.id;
      if (testModelId) {
        const ok = await this.testModel(k, testModelId);
        if (!ok) throw { status: 401, message: 'API Key OpenAI hợp lệ nhưng không có quyền thực thi inference' };
      }
      return { success: true, models };
    } catch (err: any) {
      return normalizeError(err, this.id, 'TEST_KEY', '/chat/completions', undefined, k);
    }
  }

  async listModels(key: string): Promise<AIModelMetadata[]> {
    const k = key.trim();
    const response = await providerFetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${k}` }
    });
    if (response.status === 401) throw { status: 401 };
    if (!response.ok) throw { status: response.status, message: `OpenAI models error: ${response.statusText}` };
    
    const data = await response.json();
    const modelsArray = Array.isArray(data.data) ? data.data : [];
    
    return modelsArray
      .filter((m: any) => 
        !m.id.includes('embedding') && 
        !m.id.includes('dall-e') && 
        !m.id.includes('whisper') && 
        !m.id.includes('tts') &&
        !m.id.includes('babbage') &&
        !m.id.includes('davinci')
      )
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        capabilities: ['text', 'chat'],
        lifecycle: 'stable'
      }));
  }

  async testModel(key: string, modelId: string): Promise<boolean> {
    const k = key.trim();
    const response = await providerFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${k}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
    });
    if (!response.ok) throw { status: response.status, message: `OpenAI model test failed: ${response.statusText}` };
    return true;
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  id: AIProviderId = 'anthropic';
  private baseUrl = 'https://api.anthropic.com/v1';

  async testKey(key: string): Promise<TestKeyResponse> {
    const k = key.trim();
    try {
      const models = await this.listModels(k);
      // Test inference
      if (models.length > 0) {
        const ok = await this.testModel(k, models[0].id);
        if (!ok) throw { status: 401, message: 'API Key Anthropic hợp lệ nhưng inference thất bại' };
      }
      return { success: true, models };
    } catch (err: any) {
      return normalizeError(err, this.id, 'TEST_KEY', '/messages', undefined, k);
    }
  }

  async listModels(key: string): Promise<AIModelMetadata[]> {
    const k = key.trim();
    const response = await providerFetch(`${this.baseUrl}/models`, {
      headers: {
        'x-api-key': k,
        'anthropic-version': '2023-06-01'
      }
    });
    if (response.status === 401) throw { status: 401 };
    if (!response.ok) throw { status: response.status, message: `Anthropic models error: ${response.statusText}` };
    
    const data = await response.json();
    const modelsArray = Array.isArray(data.data) ? data.data : [];
    
    return modelsArray.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      capabilities: ['text', 'chat'],
      lifecycle: 'stable'
    }));
  }

  async testModel(key: string, modelId: string): Promise<boolean> {
    const k = key.trim();
    const response = await providerFetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': k,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
    });
    if (!response.ok) throw { status: response.status, message: `Anthropic model test failed: ${response.statusText}` };
    return true;
  }
}

export class NvidiaNimAdapter implements ProviderAdapter {
  id: AIProviderId = 'nvidia';
  private baseUrl = 'https://integrate.api.nvidia.com/v1';

  private normalize(key: string): string {
    return key.trim().replace(/^Bearer\s+/i, '');
  }

  async testKey(key: string): Promise<TestKeyResponse> {
    const k = this.normalize(key);
    try {
      // Use a known stable model for inference test, skipping catalog fetch
      const testModelId = 'nvidia/llama-3.1-8b-instruct'; 
      const response = await providerFetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${k}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: testModelId,
          messages: [{ role: 'user', content: 'Reply OK' }],
          max_tokens: 4
        })
      });

      if (!response.ok) {
        throw { status: response.status, message: `NVIDIA Inference Failed: ${response.statusText}` };
      }
      
      // If inference test passed, we can try to fetch models now
      const models = await this.listModels(k);
      return { success: true, models };
    } catch (err: any) {
      return normalizeError(err, this.id, 'TEST_KEY', '/chat/completions', undefined, k);
    }
  }

  async listModels(key: string): Promise<AIModelMetadata[]> {
    const k = this.normalize(key);
    const response = await providerFetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${k}` }
    });
    if (!response.ok) throw { status: response.status, message: `NVIDIA catalog error: ${response.statusText}` };
    
    const data = await response.json();
    const modelsArray = Array.isArray(data.data) ? data.data : [];
    
    return modelsArray
      .filter((m: any) => 
        !m.id.includes('embed') && 
        !m.id.includes('rerank') && 
        !m.id.includes('safety') &&
        !m.id.includes('detector') &&
        !m.id.includes('translate')
      )
      .map((m: any) => ({
        id: m.id,
        name: m.id.split('/').pop() || m.id,
        capabilities: ['text', 'chat'],
        lifecycle: 'stable'
      }));
  }

  async testModel(key: string, modelId: string): Promise<boolean> {
    const k = this.normalize(key);
    const response = await providerFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${k}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Reply OK' }],
        max_tokens: 4,
        stream: false
      })
    });
    if (!response.ok) throw { status: response.status, message: `NVIDIA model test failed: ${response.statusText}` };
    return true;
  }
}

export class OpenCodeZenAdapter implements ProviderAdapter {
  id: AIProviderId = 'opencodezen';
  private baseUrl = 'https://opencode.ai/zen/v1';

  async testKey(key: string): Promise<TestKeyResponse> {
    const k = key.trim();
    try {
      // 1. Fetch models first
      const models = await this.listModels(k);
      
      // 2. Smoke test using nemotron-3.5-lightning-free or similar
      const testModel = models.find(m => m.id.includes('nemotron-3.5-lightning-free')) 
        || models.find(m => m.id.includes('free')) 
        || models[0];

      if (testModel) {
        try {
          const ok = await this.testModel(k, testModel.id);
          if (!ok) {
            // Check status for error diagnostics
            const response = await providerFetch(this.getEndpoint(testModel.id), {
              method: 'POST',
              headers: this.getHeaders(k, testModel.id),
              body: JSON.stringify({
                model: testModel.id,
                messages: [{ role: 'user', content: 'Reply only OK.' }],
                max_tokens: 4
              })
            });
            
            // Allow Save Unverified for 5xx or network/fetch errors
            if (response.status >= 500) {
              return { 
                success: false, 
                error: 'Nhà cung cấp Zen đang gặp sự cố (5xx). Bạn có thể Lưu chưa xác minh.', 
                statusCode: response.status,
                canSaveUnverified: true 
              };
            }
            
            throw { status: response.status, message: response.statusText };
          }
        } catch (e: any) {
          if (e.status >= 500 || e.message?.includes('fetch') || e.code === 'PROVIDER_TIMEOUT') {
             return { 
               success: false, 
               error: 'Tạm lỗi nhà cung cấp (Zen). Bạn có thể Lưu chưa xác minh.', 
               statusCode: e.status || 503,
               canSaveUnverified: true
             };
          }
          throw e;
        }
      }
      
      return { success: true, models };
    } catch (err: any) {
      return normalizeError(err, this.id, 'TEST_KEY', 'inference', undefined, k);
    }
  }

  private getEndpoint(modelId: string): string {
    const mid = modelId.toLowerCase();
    
    // Routing based on official Zen mapping
    if (mid.includes('gpt') || mid.includes('grok') || mid.includes('muse')) {
      return `${this.baseUrl}/responses`;
    }
    
    if (mid.includes('claude') || mid.includes('anthropic') || mid.includes('qwen')) {
      return `${this.baseUrl}/messages`;
    }

    // Default for most models including Nemotron/DeepSeek
    return `${this.baseUrl}/chat/completions`;
  }

  async listModels(key: string): Promise<AIModelMetadata[]> {
    const response = await providerFetch(`${this.baseUrl}/models`);
    if (!response.ok) throw { status: response.status, message: `Zen models error: ${response.statusText}` };
    
    const data = await response.json();
    const modelsArray = Array.isArray(data) ? data : (data.data || data.models || []);
    
    return modelsArray.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      capabilities: ['text', 'chat'],
      lifecycle: 'stable'
    }));
  }

  private getHeaders(key: string, modelId: string): any {
    const mid = modelId.toLowerCase();
    const headers: any = {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
    
    if (mid.includes('claude') || mid.includes('anthropic') || mid.includes('qwen')) {
      headers['x-api-key'] = key;
    }
    
    return headers;
  }

  async testModel(key: string, modelId: string): Promise<boolean> {
    const k = key.trim();
    const endpoint = this.getEndpoint(modelId);
    const headers = this.getHeaders(k, modelId);
    
    const response = await providerFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Inference test' }],
        max_tokens: 1
      })
    });
    if (!response.ok) throw { status: response.status, message: `Zen model test failed: ${response.statusText}` };
    return true;
  }
}


export class AIProviderManager {
  private static adapters: Map<AIProviderId, ProviderAdapter> = new Map([
    ['google', new GoogleAdapter()],
    ['openai', new OpenAIAdapter()],
    ['anthropic', new AnthropicAdapter()],
    ['nvidia', new NvidiaNimAdapter()],
    ['opencodezen', new OpenCodeZenAdapter()],
  ]);

  public static getAdapter(providerId: AIProviderId): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error(`Nhà cung cấp ${providerId} không được hỗ trợ`);
    return adapter;
  }
}
