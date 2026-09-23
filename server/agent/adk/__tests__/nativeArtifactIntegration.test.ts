import { describe, expect, it } from 'vitest';
import { InMemorySessionService, LlmAgent, type BaseArtifactService } from '@google/adk';
import { createCanonicalAgentRunner, withNativeArtifactLoading } from '../nativeArtifactIntegration';

const artifactService: BaseArtifactService = {
  saveArtifact: async () => { throw new Error('read only'); },
  loadArtifact: async () => undefined,
  listArtifactKeys: async () => ['file-a'],
  deleteArtifact: async () => { throw new Error('read only'); },
  listVersions: async () => [0],
  listArtifactVersions: async () => [{ version: 0 }],
  getArtifactVersion: async () => ({ version: 0 }),
};

describe('GĐ4 L3B native ADK integration boundary', () => {
  it('adds exactly one native load_artifacts tool only for attachment-bearing runs', () => {
    const base: any[] = [{ name: 'business_tool' }];
    expect(withNativeArtifactLoading(base, false)).toBe(base);
    const enabled: any[] = withNativeArtifactLoading(base, true) as any[];
    expect(enabled).not.toBe(base);
    expect(enabled.map((tool) => tool.name)).toEqual(['business_tool', 'load_artifacts']);
    expect(base.map((tool) => tool.name)).toEqual(['business_tool']);
  });

  it('constructs the supported Runner with the canonical session and request-scoped artifact service', () => {
    const sessionService = new InMemorySessionService();
    const agent = new LlmAgent({ name: 'artifact_test', model: 'gemini-2.0-flash', instruction: 'test' });
    const runner = createCanonicalAgentRunner({ agent, appName: 'root_agent', sessionService, artifactService });
    expect(runner.sessionService).toBe(sessionService);
    expect(runner.artifactService).toBe(artifactService);
    expect(runner.agent).toBe(agent);
  });

  it('keeps no-attachment runs artifact-free and backward compatible', () => {
    const sessionService = new InMemorySessionService();
    const agent = new LlmAgent({ name: 'plain_test', model: 'gemini-2.0-flash', instruction: 'test' });
    const runner = createCanonicalAgentRunner({ agent, appName: 'root_agent', sessionService });
    expect(runner.sessionService).toBe(sessionService);
    expect(runner.artifactService).toBeUndefined();
  });
});
