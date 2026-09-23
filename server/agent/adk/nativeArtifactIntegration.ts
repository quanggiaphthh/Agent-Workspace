import {
  LoadArtifactsTool,
  Runner,
  type BaseArtifactService,
  type BaseSessionService,
  type LlmAgent,
  type ToolUnion,
} from '@google/adk';

/**
 * Adds ADK's native artifact loader only when the current request has an
 * authorized run-scoped artifact view. Business capability registration is
 * intentionally untouched.
 */
export function withNativeArtifactLoading(tools: ToolUnion[], enabled: boolean): ToolUnion[] {
  if (!enabled) return tools;
  return [...tools, new LoadArtifactsTool()];
}

/** Supported public Runner composition for one canonical Agent invocation. */
export function createCanonicalAgentRunner(input: {
  agent: LlmAgent;
  appName: string;
  sessionService: BaseSessionService;
  artifactService?: BaseArtifactService;
}): Runner {
  return new Runner(input);
}
