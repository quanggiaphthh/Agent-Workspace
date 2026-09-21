import { describe, expect, it } from 'vitest';
import { parseStrictAgentChatRequest } from '../chatRequestContract';
import { UserFileService } from '../../../core/files/UserFileService';
import { resolveAttachments, formatAttachmentForModel } from '../attachmentService';

describe('GĐ4 Lượt 3A — Chat Attachment Foundation (RED TEST)', () => {

  describe('1. Attachment Request Contract', () => {
    it('accepts an optional attachments array in chat requests', () => {
      const payload = {
        message: 'Xin chào, hãy phân tích tệp này',
        attachments: [
          { fileId: '6b291111-1111-1111-1111-111111111111' }
        ],
        sessionId: 'test_session_123'
      };

      // In GĐ4 Lượt 3, the request parsing must successfully parse attachments.
      // Since attachments are currently rejected by the strict schema validation, this will fail.
      const parsed = parseStrictAgentChatRequest(payload);
      expect((parsed as any).attachments).toEqual([
        { fileId: '6b291111-1111-1111-1111-111111111111' }
      ]);
    });

    it('rejects malformed attachments in request payload', () => {
      const payload = {
        message: 'Hello',
        attachments: [
          { id: 'wrong-field-name-should-be-fileId' }
        ]
      };

      let error: any = null;
      try {
        parseStrictAgentChatRequest(payload);
      } catch (err: any) {
        error = err;
      }

      // It must throw a validation/bad-request error
      expect(error).not.toBeNull();
    });
  });

  describe('2. BinaryStore Bounded Read', () => {
    it('should expose readBytes on UserFileService to load file binaries safely', () => {
      // UserFileService must have a prototype method readBytes to retrieve the Buffer
      const hasReadBytes = typeof (UserFileService.prototype as any).readBytes === 'function';
      
      // Expected to fail because the readBytes function does not exist in the baseline code
      expect(hasReadBytes).toBe(true);
    });
  });

  describe('3. Authorized Attachment Resolution', () => {
    it('should have a helper to resolve and authorize user file attachments', async () => {
      // Expected to fail because attachmentService and resolveAttachments do not exist yet
      expect(resolveAttachments).toBeTypeOf('function');
    });
  });

  describe('4. Safe Attachment Representation', () => {
    it('should format resolved file attachments safely for model execution', () => {
      // Expected to fail because formatAttachmentForModel does not exist yet
      expect(formatAttachmentForModel).toBeTypeOf('function');
    });
  });

});

