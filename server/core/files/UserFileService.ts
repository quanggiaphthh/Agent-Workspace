import { randomUUID } from 'crypto';
import { sanitizeDisplayFilename, validateFileBytes, type SupportedFileMimeType } from './filePolicy';

export interface UserFileRecord { fileId:string; ownerId:string; originalName:string; mimeType:SupportedFileMimeType; sizeBytes:number; status:'ready'; createdAt:string|null; }
interface StoredMeta extends UserFileRecord { storageObject:string; }
export interface BinaryStore { put(object:string, bytes:Buffer, mime:string, signal?:AbortSignal):Promise<void>; exists(object:string):Promise<boolean>; delete(object:string):Promise<void>; readBounded(object:string,maxBytes:number,signal?:AbortSignal):Promise<Buffer>; }
export interface MetadataStore { create(meta:StoredMeta):Promise<void>; get(fileId:string):Promise<StoredMeta|null>; delete(fileId:string):Promise<void>; }

export class FileDomainError extends Error { constructor(public code:string, public status:number, message:string){ super(message); } }
const err=(code:string,status:number,msg:string)=>new FileDomainError(code,status,msg);
const publicRecord=(m:StoredMeta):UserFileRecord=>({fileId:m.fileId,ownerId:m.ownerId,originalName:m.originalName,mimeType:m.mimeType,sizeBytes:m.sizeBytes,status:m.status,createdAt:m.createdAt});

export class UserFileService {
 constructor(private binaries:BinaryStore, private metadata:MetadataStore) {}
 async store(ownerId:string,input:{originalName:string;mimeType:string;bytes:Buffer;signal?:AbortSignal}):Promise<UserFileRecord>{
  if (!ownerId) throw err('UNAUTHORIZED',401,'Verified owner is required.');
  if (input.signal?.aborted) throw err('UPLOAD_CANCELLED',499,'Upload cancelled.');
  try { validateFileBytes(input.mimeType,input.bytes); } catch(e:any){ throw e instanceof FileDomainError?e:err(e.code||'INVALID_FILE',e.status||400,e.message); }
  const fileId=randomUUID(); const storageObject=`users/${encodeURIComponent(ownerId)}/files/${fileId}/blob`;
  const meta:StoredMeta={fileId,ownerId,originalName:sanitizeDisplayFilename(input.originalName),mimeType:input.mimeType as SupportedFileMimeType,sizeBytes:input.bytes.length,storageObject,status:'ready',createdAt:new Date().toISOString()};
  try { await this.binaries.put(storageObject,input.bytes,input.mimeType,input.signal); }
  catch(e:any){ if(input.signal?.aborted) throw err('UPLOAD_CANCELLED',499,'Upload cancelled.'); throw err('BLOB_WRITE_FAILED',503,'File binary could not be stored.'); }
  try { await this.metadata.create(meta); }
  catch { try { await this.binaries.delete(storageObject); } catch { throw err('ORPHAN_CLEANUP_FAILED',503,'File metadata failed and orphan cleanup requires reconciliation.'); } throw err('METADATA_WRITE_FAILED',503,'File metadata could not be stored.'); }
  return publicRecord(meta);
 }
 async readBytes(ownerId:string,fileId:string,maxBytes:number,signal?:AbortSignal):Promise<{file:UserFileRecord;bytes:Buffer}>{
  if(!ownerId) throw err('UNAUTHORIZED',401,'Verified owner is required.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0) throw err('INVALID_READ_BOUND',400,'Invalid file read bound.');
  if(signal?.aborted) throw err('FILE_READ_CANCELLED',499,'File read cancelled.');
  const meta=await this.metadata.get(fileId);
  if(!meta||meta.ownerId!==ownerId) throw err('FILE_NOT_FOUND',404,'File not found.');
  if(meta.status!=='ready') throw err('FILE_NOT_READY',409,'File is not ready.');
  if(meta.sizeBytes>maxBytes) throw err('FILE_TOO_LARGE_FOR_MODEL',413,'File exceeds the model input size limit.');
  try {
    const bytes=await this.binaries.readBounded(meta.storageObject,maxBytes,signal);
    if(signal?.aborted) throw err('FILE_READ_CANCELLED',499,'File read cancelled.');
    if(bytes.length>maxBytes) throw err('FILE_TOO_LARGE_FOR_MODEL',413,'File exceeds the model input size limit.');
    return {file:publicRecord(meta),bytes};
  } catch(e:any) {
    if(e instanceof FileDomainError) throw e;
    if(signal?.aborted) throw err('FILE_READ_CANCELLED',499,'File read cancelled.');
    if(e?.code==='READ_LIMIT_EXCEEDED') throw err('FILE_TOO_LARGE_FOR_MODEL',413,'File exceeds the model input size limit.');
    throw err('FILE_READ_FAILED',503,'File binary could not be read.');
  }
 }
 async resolve(ownerId:string,fileId:string):Promise<UserFileRecord>{
  const meta=await this.metadata.get(fileId);
  if(!meta) throw err('FILE_NOT_FOUND',404,'File not found.');
  // Fail closed without disclosing whether a foreign file exists.
  if(meta.ownerId!==ownerId) throw err('FILE_NOT_FOUND',404,'File not found.');
  if(meta.status!=='ready') throw err('FILE_NOT_READY',409,'File is not ready.');
  if(!await this.binaries.exists(meta.storageObject)) throw err('FILE_BLOB_MISSING',410,'File binary is unavailable.');
  return publicRecord(meta);
 }
}

