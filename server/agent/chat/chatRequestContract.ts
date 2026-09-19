import { z } from 'zod';

const StateDeltaSchema = z.record(z.string(), z.unknown()).default({});
const FunctionResponseSchema = z.object({
  id: z.string().trim().min(1),
  name: z.literal('adk_request_confirmation'),
  response: z.object({
    confirmed: z.boolean(),
    payload: z.unknown().optional(),
  }).strict(),
}).strict();
const ToolResponseSchema = z.object({
  role: z.literal('user'),
  parts: z.array(z.object({ functionResponse: FunctionResponseSchema }).strict()).length(1),
}).strict();

const CommonSchema = {
  stateDelta: StateDeltaSchema.optional(),
  aiConfig: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().optional(),
  temporaryMode: z.boolean().optional(),
};
const MessageRequestSchema = z.object({
  ...CommonSchema,
  message: z.string().trim().min(1).max(100_000),
  toolResponse: z.never().optional(),
}).strict();
const ToolResponseRequestSchema = z.object({
  ...CommonSchema,
  message: z.never().optional(),
  toolResponse: ToolResponseSchema,
}).strict();
const AgentChatRequestSchema = z.union([MessageRequestSchema, ToolResponseRequestSchema]);

export type StrictAgentChatRequest = {
  kind: 'message' | 'toolResponse';
  stateDelta: Record<string, unknown>;
  newMessage: unknown;
};

export function parseStrictAgentChatRequest(body: unknown): StrictAgentChatRequest {
  const parsed = AgentChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const err = new Error('Invalid Agent Chat request. Provide exactly one valid message or toolResponse.');
    (err as any).status = 400;
    (err as any).code = 'INVALID_CHAT_REQUEST';
    throw err;
  }
  const value = parsed.data;
  if ('toolResponse' in value && value.toolResponse) {
    return { kind: 'toolResponse', stateDelta: value.stateDelta || {}, newMessage: value.toolResponse };
  }
  return {
    kind: 'message',
    stateDelta: value.stateDelta || {},
    newMessage: { role: 'user', parts: [{ text: value.message }] },
  };
}
