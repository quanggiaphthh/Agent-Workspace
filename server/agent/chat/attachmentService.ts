import type { UserFileRecord, UserFileService } from '../../core/files/UserFileService';
import { FileDomainError } from '../../core/files/UserFileService';
import { MAX_ATTACHMENTS_PER_TURN, MAX_MODEL_INPUT_BYTES_AGGREGATE, MAX_MODEL_INPUT_BYTES_PER_FILE, MODEL_INPUT_MIME_SET } from './attachmentPolicy';
import type { AttachmentReference } from './chatRequestContract';

export type SafeAttachmentReference={fileId:string;displayName:string;mimeType:string;sizeBytes:number};
export type RunScopedResolvedAttachment={safe:SafeAttachmentReference;bytes:Buffer};
const fail=(code:string,status:number,message:string)=>new FileDomainError(code,status,message);
export const toSafeAttachmentReference=(file:UserFileRecord):SafeAttachmentReference=>({fileId:file.fileId,displayName:file.originalName,mimeType:file.mimeType,sizeBytes:file.sizeBytes});
/** Compatibility helper for the RED seed: deliberately returns metadata only, never model parts/binary. */
export const formatAttachmentForModel=toSafeAttachmentReference;
export async function resolveAttachments(ownerId:string,refs:AttachmentReference[],files:Pick<UserFileService,'readBytes'>,signal?:AbortSignal):Promise<RunScopedResolvedAttachment[]>{
 if(!ownerId) throw fail('UNAUTHORIZED',401,'Verified owner is required.');
 if(refs.length>MAX_ATTACHMENTS_PER_TURN) throw fail('TOO_MANY_ATTACHMENTS',400,'Too many attachments.');
 if(new Set(refs.map(x=>x.fileId)).size!==refs.length) throw fail('DUPLICATE_ATTACHMENT',400,'Duplicate attachment.');
 const out:RunScopedResolvedAttachment[]=[]; let aggregate=0;
 for(const ref of refs){
   if(signal?.aborted) throw fail('FILE_READ_CANCELLED',499,'File read cancelled.');
   const resolved=await files.readBytes(ownerId,ref.fileId,MAX_MODEL_INPUT_BYTES_PER_FILE,signal);
   if(!MODEL_INPUT_MIME_SET.has(resolved.file.mimeType)) throw fail('UNSUPPORTED_MODEL_INPUT_TYPE',415,'File type is not supported for model input.');
   aggregate+=resolved.bytes.length;
   if(aggregate>MAX_MODEL_INPUT_BYTES_AGGREGATE) throw fail('ATTACHMENT_TOTAL_TOO_LARGE',413,'Attachments exceed the aggregate model input size limit.');
   out.push({safe:toSafeAttachmentReference(resolved.file),bytes:resolved.bytes});
 }
 return out;
}
