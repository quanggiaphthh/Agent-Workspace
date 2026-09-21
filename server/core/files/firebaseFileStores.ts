import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore, adminStorageBucket } from '../../lib/firebaseAdmin';
import { UserFileService, type BinaryStore, type MetadataStore } from './UserFileService';
import { FileIngestionService } from './FileIngestionService';

class FirebaseBinaryStore implements BinaryStore {
  async put(object:string, bytes:Buffer, mime:string, signal?:AbortSignal) {
    if (signal?.aborted) throw new Error('cancelled');
    await adminStorageBucket.file(object).save(bytes, { resumable:false, contentType:mime, metadata:{ cacheControl:'private, max-age=0, no-store' } });
    if (signal?.aborted) { await this.delete(object); throw new Error('cancelled'); }
  }
  async readBounded(object:string,maxBytes:number,signal?:AbortSignal):Promise<Buffer> {
    if (signal?.aborted) throw new Error('cancelled');
    const file=adminStorageBucket.file(object);
    const [metadata]=await file.getMetadata();
    const declared=Number(metadata.size);
    if(Number.isFinite(declared)&&declared>maxBytes) throw Object.assign(new Error('read limit exceeded'),{code:'READ_LIMIT_EXCEEDED'});
    return await new Promise<Buffer>((resolve,reject)=>{
      const chunks:Buffer[]=[]; let total=0; const stream=file.createReadStream();
      const abort=()=>stream.destroy(new Error('cancelled')); signal?.addEventListener('abort',abort,{once:true});
      stream.on('data',(chunk:Buffer)=>{ total+=chunk.length; if(total>maxBytes){stream.destroy(Object.assign(new Error('read limit exceeded'),{code:'READ_LIMIT_EXCEEDED'}));return;} chunks.push(Buffer.from(chunk)); });
      stream.once('error',reject);
      stream.once('end',()=>resolve(Buffer.concat(chunks,total)));
      stream.once('close',()=>signal?.removeEventListener('abort',abort));
    });
  }
  async exists(object:string) { const [exists] = await adminStorageBucket.file(object).exists(); return exists; }
  async delete(object:string) { await adminStorageBucket.file(object).delete({ ignoreNotFound:true }); }
}
class FirestoreFileMetadataStore implements MetadataStore {
  private col(){ return adminFirestore.collection('user_files'); }
  async create(meta:any){ await this.col().doc(meta.fileId).create({ ...meta, createdAt:Timestamp.now() }); }
  async get(fileId:string){ const s=await this.col().doc(fileId).get(); if(!s.exists)return null; const d=s.data() as any; return { ...d,fileId:s.id,createdAt:d.createdAt?.toDate?.().toISOString?.()||d.createdAt||null }; }
  async delete(fileId:string){ await this.col().doc(fileId).delete(); }
}
export const userFileService = new UserFileService(new FirebaseBinaryStore(), new FirestoreFileMetadataStore());
export const fileIngestionService = new FileIngestionService(userFileService);
