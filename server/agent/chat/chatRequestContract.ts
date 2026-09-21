import { z } from 'zod';
import { MAX_ATTACHMENTS_PER_TURN } from './attachmentPolicy';

const FileIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid canonical fileId.');
const AttachmentRefSchema = z.object({ fileId: FileIdSchema }).strict();
const AttachmentsSchema = z.array(AttachmentRefSchema).max(MAX_ATTACHMENTS_PER_TURN).superRefine((items,ctx)=>{
  const seen=new Set<string>();
  items.forEach((item,index)=>{ if(seen.has(item.fileId)) ctx.addIssue({code:'custom',path:[index,'fileId'],message:'Duplicate attachment fileId.'}); seen.add(item.fileId); });
});
const StateDeltaSchema = z.record(z.string(), z.unknown()).default({});
const FunctionResponseSchema = z.object({ id:z.string().trim().min(1), name:z.literal('adk_request_confirmation'), response:z.object({confirmed:z.boolean(),payload:z.unknown().optional()}).strict() }).strict();
const ToolResponseSchema = z.object({role:z.literal('user'),parts:z.array(z.object({functionResponse:FunctionResponseSchema}).strict()).length(1)}).strict();
const CommonSchema={stateDelta:StateDeltaSchema.optional(),aiConfig:z.record(z.string(),z.unknown()).optional(),sessionId:z.string().optional(),temporaryMode:z.boolean().optional()};
const MessageRequestSchema=z.object({...CommonSchema,message:z.string().trim().min(1).max(100_000),attachments:AttachmentsSchema.optional(),toolResponse:z.never().optional()}).strict();
const ToolResponseRequestSchema=z.object({...CommonSchema,message:z.never().optional(),attachments:z.never().optional(),toolResponse:ToolResponseSchema}).strict();
const AgentChatRequestSchema=z.union([MessageRequestSchema,ToolResponseRequestSchema]);
export type AttachmentReference={fileId:string};
export type StrictAgentChatRequest={kind:'message'|'toolResponse';stateDelta:Record<string,unknown>;newMessage:unknown;attachments?:AttachmentReference[]};
export function parseStrictAgentChatRequest(body:unknown):StrictAgentChatRequest{
 const parsed=AgentChatRequestSchema.safeParse(body); if(!parsed.success){const e:any=new Error('Invalid Agent Chat request. Provide exactly one valid message or toolResponse.');e.status=400;e.code='INVALID_CHAT_REQUEST';throw e;}
 const value=parsed.data;
 if('toolResponse' in value&&value.toolResponse)return{kind:'toolResponse',stateDelta:value.stateDelta||{},newMessage:value.toolResponse};
 return{kind:'message',stateDelta:value.stateDelta||{},newMessage:{role:'user',parts:[{text:value.message}]},...(value.attachments?{attachments:value.attachments}: {})};
}
