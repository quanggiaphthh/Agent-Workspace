import { BaseLlm, Gemini, LlmAgent, type LlmRequest, type BaseLlmConnection } from '@google/adk';
import { withNativeArtifactLoading } from './nativeArtifactIntegration';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { CapabilityToolNameRegistry } from '../../core/capabilities/capabilityToolNameRegistry';
import { CredentialService } from '../../core/ai/CredentialService';
import { ExecutionContext } from '../../../shared/contracts/capability';
import {
  AIConfigSchema,
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_AGENT_MODEL,
  type AIConfig,
} from '../../../shared/contracts/ai';
import { CapabilityToolAdapter, type AgentToolRuntimeMetadata } from './CapabilityToolAdapter';
import { classifyProviderFailure, shouldRotateCredential, toSafeProviderError } from '../../core/ai/credentialRotationPolicy';

interface RotationCandidate {
  apiKey: string;
  model: string;
  label: string;
}

/**
 * ADK-compatible Gemini model that can rotate credentials only before a
 * response has started. Retrying after yielding a partial response could
 * duplicate model/tool effects, so such errors are surfaced immediately.
 */
export class RotatingGemini extends BaseLlm {
  constructor(private readonly candidates: RotationCandidate[]) {
    super({ model: candidates[0]?.model || DEFAULT_AGENT_MODEL });
    if (candidates.length === 0) {
      throw new Error('Rotation pool cannot be empty.');
    }
  }

  override async *generateContentAsync(
    llmRequest: LlmRequest,
    stream?: boolean,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<any, void> {
    let lastError: unknown;

    for (const candidate of this.candidates) {
      let yielded = false;
      try {
        const model = new Gemini({ apiKey: candidate.apiKey, model: candidate.model });
        for await (const response of (model as any).generateContentAsync(llmRequest, stream, abortSignal)) {
          yielded = true;
          yield response;
        }
        return;
      } catch (err: any) {
        lastError = err;
        if (!shouldRotateCredential(err, yielded)) {
          throw toSafeProviderError(err);
        }
        const currentIndex = this.candidates.indexOf(candidate);
        if (currentIndex >= this.candidates.length - 1) {
          const exhausted = toSafeProviderError(err) as Error & { code?: string; providerFailure?: string };
          exhausted.code = 'NO_ROTATION_CANDIDATE';
          exhausted.providerFailure = classifyProviderFailure(err);
          throw exhausted;
        }
        console.warn(`[AI Rotation] credential=${candidate.label} failed before streaming with a credential-specific error; trying next eligible personal credential.`);
      }
    }

    throw toSafeProviderError(lastError);
  }

  /**
   * Delegates to the primary candidate for live connections.
   * Rotation is not supported for long-lived sessions in Phase 1.
   */
  override async connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    const primary = this.candidates[0];
    const model = new Gemini({ apiKey: primary.apiKey, model: primary.model });
    return model.connect(llmRequest);
  }
}


export function filterAgentCapabilitiesForConfig<T extends { id: string }>(capabilities: T[], aiConfig: AIConfig): T[] {
  return capabilities.filter((cap) => {
    if (!aiConfig.memoryEnabled && cap.id.startsWith('system.memory.')) return false;
    if (!aiConfig.webSearchEnabled && cap.id === 'system.web.search') return false;
    return true;
  });
}


export function assertUniqueAgentToolNames<T extends { id: string }>(capabilities: T[]): void {
  const seen = new Map<string, string>();
  for (const capability of capabilities) {
    const toolName = CapabilityToolNameRegistry.getToolName(capability.id);
    const existing = seen.get(toolName);
    if (existing && existing !== capability.id) throw new Error(`ADK tool-name collision between "${existing}" and "${capability.id}".`);
    seen.set(toolName, capability.id);
  }
}

export class RootAgent {
  public static async buildAgent(executionContext: ExecutionContext, runtime: AgentToolRuntimeMetadata, artifactLoadingEnabled = false): Promise<LlmAgent> {
    const { user } = executionContext;
    if (!user || user.id === 'guest') {
      throw new Error('Vui lòng đăng nhập để sử dụng Trợ lý AI.');
    }

    const aiConfig: AIConfig = AIConfigSchema.parse(executionContext.appContext?.aiConfig || {});
    if (aiConfig.agentProvider !== DEFAULT_AGENT_PROVIDER) {
      throw new Error('Agent Chat hiện chỉ hỗ trợ Google/Gemini.');
    }

    // Search remains a custom server capability; settings only reduce the server-authoritative tool set.
    const availableCaps = filterAgentCapabilitiesForConfig(
      await ServerCapabilityRegistry.listForContext(executionContext),
      aiConfig,
    );

    assertUniqueAgentToolNames(availableCaps);
    const capabilityTools = availableCaps.map((cap) => CapabilityToolAdapter.createTool(cap, executionContext, runtime));
    const tools = withNativeArtifactLoading(capabilityTools, artifactLoadingEnabled);

    let modelInstance: BaseLlm;
    if (aiConfig.autoRotate) {
      const eligibleCredentials = await CredentialService.getRotationCandidates(
        user.id,
        aiConfig.agentProvider,
        aiConfig.credentialId,
      );
      const candidates: RotationCandidate[] = eligibleCredentials.map((credential) => ({
        apiKey: credential.key,
        model: aiConfig.agentModel,
        label: credential.id,
      }));
      if (candidates.length === 0) {
        const error = new Error('Không có Gemini credential khả dụng để chạy Agent.') as Error & { code?: string; status?: number };
        error.code = 'NO_ROTATION_CANDIDATE';
        error.status = 409;
        throw error;
      }
      modelInstance = candidates.length > 1
        ? new RotatingGemini(candidates)
        : new Gemini({ apiKey: candidates[0].apiKey, model: candidates[0].model });
    } else {
      const selectedCredential = await CredentialService.resolveCredential(
        user.id,
        aiConfig.agentProvider,
        aiConfig.credentialId,
      );
      modelInstance = new Gemini({
        apiKey: selectedCredential.key,
        model: aiConfig.agentModel,
      });
    }

    return new LlmAgent({
      name: 'RootAgent',
      description: 'The primary orchestrator for the Modular Agent Webapp',
      instruction: `
        Bạn là "Trợ lý Hệ thống", bộ não trung tâm của Modular Agent Webapp.

        NGUYÊN TẮC HOẠT ĐỘNG:
        1. PHẢN HỒI TIẾNG VIỆT: Luôn phản hồi bằng tiếng Việt trừ khi người dùng yêu cầu ngôn ngữ khác.
        2. SỬ DỤNG TOOLS: Bạn không thể trực tiếp thao tác DOM hay giao diện. Hãy sử dụng các tools (capabilities) được cung cấp để thực hiện hành động hoặc lấy dữ liệu.
        3. NGỮ CẢNH: Bạn có quyền truy cập vào thông tin về module đang mở (activeModule) và đối tượng đang được chọn (selectedEntity). Hãy ưu tiên sử dụng thông tin này để hiểu các đại từ như "việc này", "mục này".
        4. ĐIỀU HƯỚNG: Khi cần thay đổi giao diện, chỉ sử dụng tool điều hướng đang được cung cấp trong danh sách tools của lượt chạy.
        5. KHÔNG GIẢ ĐỊNH: Chỉ sử dụng các tools có tên trong danh sách hiện tại. Nếu không thấy tool phù hợp, hãy thông báo cho người dùng rằng tính năng đó có thể bị khóa hoặc chưa được cài đặt.
        6. AN TOÀN: Các hành động quan trọng sẽ yêu cầu xác nhận theo policy phía server.
      `,
      model: modelInstance,
      tools,
    });
  }
}
