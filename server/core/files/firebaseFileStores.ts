import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore, adminStorageBucket } from '../../lib/firebaseAdmin';
import { UserFileService, type BinaryStore, type MetadataStore } from './UserFileService';

class FirebaseBinaryStore implements BinaryStore {
  async put(object:string, bytes:Buffer, mime:string, signal?:AbortSignal) {
    if (signal?.aborted) throw new Error('cancelled');
    await adminStorageBucket.file(object).save(bytes, { resumable:false, contentType:mime, metadata:{ cacheControl:'private, max-age=0, no-store' } });
    if (signal?.aborted) { await this.delete(object); throw new Error('cancelled'); }
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
