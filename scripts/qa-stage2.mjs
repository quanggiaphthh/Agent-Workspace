import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const server = read('server.ts');
const systemCaps = read('server/core/capabilities/systemCapabilities.ts');
const root = read('server/agent/adk/RootAgent.ts');
const memoryPanel = read('src/agent/ui/AgentMemoryPanel.tsx');
const tasks = read('src/modules/tasks/TasksModule.tsx');
const taskStats = read('src/modules/tasks/TasksStatsWidget.tsx');
const data = read('server/core/data/UserDataService.ts');
const search = read('server/core/search/WebSearchService.ts');
const rules = read('firestore.rules');
const registry = read('server/core/capabilities/serverCapabilityRegistry.ts');
const chat = read('src/agent/ui/AgentChatThread.tsx');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');

check('web search is a custom capability', systemCaps.includes("id: 'system.web.search'"));
check('RootAgent does not inject built-in GOOGLE_SEARCH', !root.includes('GOOGLE_SEARCH'));
check('web search uses a dedicated googleSearch request', search.includes('tools: [{ googleSearch: {} }]'));
check('web search returns grounding sources', search.includes('groundingChunks') && search.includes('sources: uniqueSources'));
check('memory query uses query text', data.includes('options.query?.trim()'));
check('memory query filters approved status for Agent', systemCaps.includes("status: 'approved'"));
check('agent-created memory is pending', systemCaps.includes("status: 'pending'"));
check('Tasks UI uses server API', tasks.includes("authFetch('/api/tasks"));
check('Tasks UI has no Firestore client CRUD', !/firebase\/firestore/.test(tasks));
check('Tasks stats uses server API', taskStats.includes("authFetch('/api/tasks/stats'"));
check('Tasks stats has no Firestore client CRUD', !/firebase\/firestore/.test(taskStats));
check('Memory UI uses server API', memoryPanel.includes("authFetch('/api/memory"));
check('Memory UI has no Firestore client CRUD', !/firebase\/firestore/.test(memoryPanel));
check('Chat memory action uses server API', chat.includes("authFetch('/api/memory'"));
check('Chat has no direct agent_memories Firestore writes', !chat.includes("collection(db, 'agent_memories')"));
check('Firestore rules deny direct Tasks/Memory client access', rules.includes('match /agent_memories/{id} {\n      allow read, write: if false;') && rules.includes('match /agent_tasks/{id} {\n      allow read, write: if false;'));
check('capability listing is context-filtered', server.includes('ServerCapabilityRegistry.listForContext({'));
check('module-aware capability registry exists', registry.includes('storage.getData()'));
check('credential save route has one declaration', (server.match(/const id = await CredentialService\.saveCredential/g) || []).length === 1);
check('Search sources are mapped into chat metadata', runtime.includes("type: 'sources'") && runtime.includes('sourceCandidate'));
check('Search sources are rendered in UI', chat.includes('Nguồn tham khảo') && chat.includes("part.type === 'sources'"));
check('Memory mutations are permission-gated in UI', memoryPanel.includes("permissions.includes('memory.write')") && memoryPanel.includes("permissions.includes('memory.delete')"));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nStage 2: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
