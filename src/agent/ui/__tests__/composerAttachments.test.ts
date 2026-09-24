import { describe, expect, it } from 'vitest';
import {
  composerAttachmentReducer,
  createComposerAttachment,
  successfulAttachmentReferences,
} from '../AgentChatThread';
import { buildMessageRequestPayload } from '../AdkRuntimeProvider';

const fileIdA = '11111111-1111-4111-8111-111111111111';
const fileIdB = '22222222-2222-4222-8222-222222222222';

function file(name: string) {
  return new File(['hello'], name, { type: 'text/plain' });
}

describe('L3C composer attachment lifecycle', () => {
  it('maps only successful uploads to canonical fileId references', () => {
    const pending = createComposerAttachment(file('pending.txt'), 'pending');
    const complete = { ...createComposerAttachment(file('done.txt'), 'done'), phase: 'complete' as const, fileId: fileIdA };
    const failed = { ...createComposerAttachment(file('failed.txt'), 'failed'), phase: 'error' as const, error: 'Lỗi' };

    expect(successfulAttachmentReferences([pending, complete, failed])).toEqual([{ fileId: fileIdA }]);
  });

  it('removes an attachment without changing the others', () => {
    const a = createComposerAttachment(file('a.txt'), 'a');
    const b = createComposerAttachment(file('b.txt'), 'b');
    expect(composerAttachmentReducer([a, b], { type: 'remove', localId: 'a' })).toEqual([b]);
  });

  it('enforces the canonical maximum of four composer attachments', () => {
    let state = [] as ReturnType<typeof createComposerAttachment>[];
    for (let index = 0; index < 5; index += 1) {
      state = composerAttachmentReducer(state, { type: 'add', attachment: createComposerAttachment(file(`${index}.txt`), String(index)) });
    }
    expect(state).toHaveLength(4);
  });

  it('resets attachments after a successful send', () => {
    const state = [createComposerAttachment(file('a.txt'), 'a')];
    expect(composerAttachmentReducer(state, { type: 'reset' })).toEqual([]);
  });
});

describe('L3C chat request serialization', () => {
  it('keeps text-only request behavior unchanged', () => {
    expect(buildMessageRequestPayload('Xin chào', { activeModule: 'home' }, [])).toEqual({
      message: 'Xin chào',
      stateDelta: { activeModule: 'home' },
    });
  });

  it('adds only canonical fileId attachment references', () => {
    const payload = buildMessageRequestPayload('Đọc tệp', {}, [{ fileId: fileIdA }, { fileId: fileIdB }]);
    expect(payload).toEqual({
      message: 'Đọc tệp',
      stateDelta: {},
      attachments: [{ fileId: fileIdA }, { fileId: fileIdB }],
    });
    expect(JSON.stringify(payload)).not.toMatch(/base64|data:|owner|storagePath|storageObject|firebase/i);
  });
});
