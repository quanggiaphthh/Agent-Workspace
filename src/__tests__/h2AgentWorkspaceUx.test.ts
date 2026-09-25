import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { moduleRegistry } from '../core/modules/moduleRegistry';
import type { ModuleManifest } from '../../shared/contracts/module';
import type { UserContext } from '../../shared/contracts/capability';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const owner: UserContext = { id: 'owner', email: 'owner@example.test', name: 'Owner', roles: ['admin'], permissions: [] };
const syntheticManifest: ModuleManifest = {
  id: 'h2-test-module', version: '1.0.0', meta: { name: 'H2 test' }, routes: [],
  agent: { suggestions: [
    { id: 'always', label: 'Always', prompt: 'Always' },
    { id: 'needs-cap', label: 'Needs capability', prompt: 'Needs capability', requiredCapabilities: ['demo.allowed'] },
  ] },
};

describe('H2 Agent Workspace UX architecture', () => {
  it('defaults Agent display state to closed and defines panel/focus transitions', () => {
    const source = read('src/app/shell/AppShell.tsx');
    expect(source).toContain("useState<AgentDisplayMode>('closed')");
    expect(source).toContain("if (action === 'focus') return 'focus'");
    expect(source).toContain("if (action === 'restore') return 'panel'");
    expect(source).toContain("if (action === 'close') return 'closed'");
  });

  it('keeps canonical workspace:open-agent on eventBus and overlay Escape/focus restoration', () => {
    const source = read('src/app/shell/AppShell.tsx');
    expect(source).toContain("const HOME_OPEN_AGENT_EVENT = 'workspace:open-agent'");
    expect(source).toContain('eventBus.on(HOME_OPEN_AGENT_EVENT');
    expect(source).not.toContain("window.addEventListener('workspace:open-agent'");
    expect(source).toContain("event.key !== 'Escape'");
    expect(source).toContain('lastAgentTriggerRef.current?.focus()');
  });

  it('filters manifest Agent suggestions by module enabled/access state and capability requirements', async () => {
    moduleRegistry.reset();
    moduleRegistry.register(syntheticManifest);
    expect(moduleRegistry.getAgentSuggestions('h2-test-module', owner, []).map(item => item.id)).toEqual(['always']);
    expect(moduleRegistry.getAgentSuggestions('h2-test-module', owner, ['demo.allowed']).map(item => item.id)).toEqual(['always', 'needs-cap']);
    await moduleRegistry.disable('h2-test-module');
    expect(moduleRegistry.getAgentSuggestions('h2-test-module', owner, ['demo.allowed'])).toEqual([]);
    moduleRegistry.reset();
  });

  it('moves Task suggestions to the Task manifest and removes Task hard-coding from Agent Core', () => {
    const manifest = read('src/modules/tasks/manifest.ts');
    const chat = read('src/agent/ui/AgentChatThread.tsx');
    expect(manifest).toContain('agent:');
    expect(manifest).toContain('Rà soát việc quá hạn');
    expect(chat).toContain('moduleRegistry.getAgentSuggestions');
    expect(chat).not.toContain("case 'tasks'");
    expect(chat).not.toContain("activeModule === 'tasks'");
  });

  it('does not render reasoning and removes sample-memory seeding', () => {
    const chat = read('src/agent/ui/AgentChatThread.tsx');
    const memory = read('src/agent/ui/AgentMemoryPanel.tsx');
    expect(chat).not.toContain("part.type === 'reasoning'");
    expect(chat).not.toContain('Suy nghĩ:');
    expect(memory).not.toContain('Tạo dữ liệu mẫu');
    expect(memory).not.toContain('handleSeedSampleData');
  });

  it('preserves the canonical attachment projection seam and HITL component', () => {
    const chat = read('src/agent/ui/AgentChatThread.tsx');
    expect(chat).toContain('uploadUserFile(file, controller.signal)');
    expect(chat).toContain('fileId: uploaded.fileId');
    expect(chat).toContain('successfulAttachmentReferences(attachments)');
    expect(chat).toContain('<AdkConfirmation />');
    expect(chat).toContain('temporaryMode');
    expect(chat).toContain('setTemporaryMode');
  });
});
