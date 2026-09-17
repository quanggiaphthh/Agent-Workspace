import { Gemini, LlmAgent, Context, GOOGLE_SEARCH } from '@google/adk';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { ExecutionContext } from '../../../shared/contracts/capability';
import { CapabilityToolAdapter } from './CapabilityToolAdapter';

/**
 * RootAgent Factory
 * 
 * Dynamically builds an ADK LlmAgent based on the current user's security context.
 */
export class RootAgent {
  public static async buildAgent(executionContext: ExecutionContext): Promise<LlmAgent> {
    const { user } = executionContext;
    
    if (!user || user.id === 'guest') {
      throw new Error('Vui lòng đăng nhập để sử dụng Trợ lý AI.');
    }

    // 1. Fetch capabilities actually available to this user in this module
    let availableCaps = ServerCapabilityRegistry.listForContext(executionContext);
    
    // 2. Configure the LLM and settings
    const aiConfig = executionContext.appContext?.aiConfig || {};

    // Filter out memory capabilities if long-term memory setting is explicitly off
    const memoryEnabled = aiConfig.memoryEnabled !== false;
    if (!memoryEnabled) {
      availableCaps = availableCaps.filter(cap => !cap.id.startsWith('system.memory.'));
    }

    // 3. Map to ADK tools
    const tools = availableCaps.map(cap => CapabilityToolAdapter.createTool(cap, executionContext));
    
    // Phase 4: Online Search
    if (aiConfig.webSearchEnabled !== false && executionContext.user.permissions?.includes('web.search')) {
      tools.push(GOOGLE_SEARCH);
    }
    const selectedProvider = (aiConfig.agentProvider as any) || 'google';
    
    let selectedModel = aiConfig.agentModel || process.env.AGENT_MODEL || 'gemini-3.8-flash';
    
    // Determine the primary key to use
    let apiKey = process.env.GEMINI_API_KEY;
    let isPersonalKey = false;

    // Use credentialId if provided
    if (aiConfig.credentialId && aiConfig.credentialId !== 'system') {
      const { CredentialService } = await import('../../core/ai/CredentialService');
      const cred = await CredentialService.getCredential(user.id, aiConfig.credentialId);
      if (cred && cred.providerId === selectedProvider) {
        apiKey = cred.key;
        isPersonalKey = true;
      }
    }

    if (!apiKey) {
      throw new Error(`Không tìm thấy API Key hợp lệ cho ${selectedProvider}. Vui lòng kiểm tra lại cấu hình trong phần Cài đặt.`);
    }

    // 4. Quota Rotation Logic
    let modelInstance: any;
    
    if (aiConfig.autoRotate && selectedProvider === 'google') {
      const { CredentialService } = await import('../../core/ai/CredentialService');
      const allPersonalKeys = await CredentialService.listFullCredentials(user.id, 'google');
      
      // Build rotation pool: Priority (selectedKey) -> Other Personal Keys -> System Key
      const pool: Array<{ apiKey: string; model: string }> = [];
      
      // Selected key first
      pool.push({ apiKey, model: selectedModel });
      
      // Other personal keys
      for (const cred of allPersonalKeys) {
        if (cred.id !== aiConfig.credentialId) {
          pool.push({ apiKey: cred.key, model: selectedModel });
        }
      }
      
      // System key last (if not already the selected one)
      if (aiConfig.credentialId !== 'system' && process.env.GEMINI_API_KEY) {
        pool.push({ apiKey: process.env.GEMINI_API_KEY, model: selectedModel });
      }

      // Create a proxy-like object that implements the Model interface
      modelInstance = {
        generate: async (context: Context) => {
          let lastError;
          for (const config of pool) {
            try {
              const gemini = new Gemini(config);
              return await (gemini as any).generate(context);
            } catch (err: any) {
              lastError = err;
              const msg = err.message || '';
              // Rotate ONLY on quota (429) or transient (5xx)
              const isQuota = msg.includes('429') || msg.toLowerCase().includes('quota');
              const isTransient = msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504');
              
              if (isQuota || isTransient) {
                console.warn(`[AI Rotation] Model failed with ${isQuota ? 'quota' : 'transient'} error. Trying next key...`);
                continue;
              }
              // Stop rotation on authentication/invalid request errors
              throw err;
            }
          }
          throw lastError;
        }
      };
    } else {
      modelInstance = new Gemini({
        apiKey,
        model: selectedModel,
      });
    }

    // 5. Create the Agent
    return new LlmAgent({
      name: 'RootAgent',
      description: 'The primary orchestrator for the Modular Agent Webapp',
      instruction: `
        Bạn là "Trợ lý Hệ thống", bộ não trung tâm của Modular Agent Webapp.
        
        NGUYÊN TẮC HOẠT ĐỘNG:
        1. PHẢN HỒI TIẾNG VIỆT: Luôn phản hồi bằng tiếng Việt trừ khi người dùng yêu cầu ngôn ngữ khác.
        2. SỬ DỤNG TOOLS: Bạn không thể trực tiếp thao tác DOM hay giao diện. Hãy sử dụng các tools (capabilities) được cung cấp để thực hiện hành động hoặc lấy dữ liệu.
        3. NGỮ CẢNH: Bạn có quyền truy cập vào thông tin về module đang mở (activeModule) và đối tượng đang được chọn (selectedEntity). Hãy ưu tiên sử dụng thông tin này để hiểu các đại từ như "việc này", "mục này".
        4. ĐIỀU HƯỚNG: Sử dụng tool 'ui_openModule' hoặc 'ui_openEntity' để thay đổi giao diện cho người dùng khi cần thiết.
        5. KHÔNG GIẢ ĐỊNH: Chỉ sử dụng các tools có tên trong danh sách hiện tại. Nếu không thấy tool phù hợp, hãy thông báo cho người dùng rằng tính năng đó có thể bị khóa hoặc chưa được cài đặt.
        6. AN TOÀN: Các hành động quan trọng (như xóa dữ liệu) sẽ yêu cầu xác nhận. Hệ thống sẽ tự động hiển thị yêu cầu xác nhận khi bạn gọi các tool có rủi ro cao.
      `,
      model: modelInstance,
      tools: tools,
    });
  }
}
