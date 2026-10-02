export function hasFailClosedTaskAndMemoryRules(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  return normalized.includes('match /agent_memories/{id} {\n      allow read, write: if false;')
    && normalized.includes('match /agent_tasks/{id} {\n      allow read, write: if false;');
}
