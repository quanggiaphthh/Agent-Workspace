import { describe, expect, it } from 'vitest';
import { UserFileService, FileDomainError, type BinaryStore, type MetadataStore } from '../UserFileService';
import { MAX_FILE_BYTES, sanitizeDisplayFilename, validateFileBytes, buildSafeFileAuditMetadata } from '../filePolicy';

class B implements BinaryStore { data=new Map<string,Buffer>(); failPut=false; failDelete=false; async put(k:string,b:Buffer){if(this.failPut)throw Error('put');this.data.set(k,b)} async readBounded(k:string,max:number){const b=this.data.get(k);if(!b)throw Error('missing');if(b.length>max)throw Object.assign(Error('limit'),{code:'READ_LIMIT_EXCEEDED'});return b} async exists(k:string){return this.data.has(k)} async delete(k:string){if(this.failDelete)throw Error('del');this.data.delete(k)} }
class M implements MetadataStore { data=new Map<string,any>(); fail=false; async create(v:any){if(this.fail)throw Error('meta');this.data.set(v.fileId,v)} async get(k:string){return this.data.get(k)||null} async delete(k:string){this.data.delete(k)} }
const pdf=Buffer.from('%PDF-1.7\nhello');
const svc=()=>{const b=new B(),m=new M();return {b,m,s:new UserFileService(b,m)}};

describe('GĐ4 Lượt 1 secure file foundation',()=>{
 it.each(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/markdown'])('accepts policy MIME %s',m=>expect(()=>validateFileBytes(m, m==='application/pdf'?pdf:m==='image/jpeg'?Buffer.from([255,216,255,1]):m==='image/png'?Buffer.from([137,80,78,71,13,10,26,10]):m==='image/webp'?Buffer.from('RIFF0000WEBP'):Buffer.from('hello'))).not.toThrow());
 it('rejects unsupported MIME',()=>expect(()=>validateFileBytes('text/html',Buffer.from('x'))).toThrow());
 it('accepts normal size',()=>expect(()=>validateFileBytes('text/plain',Buffer.from('ok'))).not.toThrow());
 it('accepts exact max boundary',()=>expect(()=>validateFileBytes('text/plain',Buffer.alloc(MAX_FILE_BYTES,65))).not.toThrow());
 it('rejects over max',()=>expect(()=>validateFileBytes('text/plain',Buffer.alloc(MAX_FILE_BYTES+1,65))).toThrow());
 it('sanitizes traversal/control filename',()=>expect(sanitizeDisplayFilename('../a/..\\evil\u0000.txt')).toBe('evil.txt'));
 it('does not use filename as object identity',async()=>{const {b,s}=svc();const r=await s.store('u',{originalName:'../../x.pdf',mimeType:'application/pdf',bytes:pdf});const k=[...b.data.keys()][0];expect(k).toMatch(/^users\/u\/files\/[0-9a-f-]+\/blob$/);expect(k).not.toContain('x.pdf');expect(r.originalName).toBe('x.pdf')});
 it('derives owner from service context',async()=>{const {s}=svc();expect((await s.store('owner',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf})).ownerId).toBe('owner')});
 it('cannot forge owner through file input',async()=>{const {s}=svc();const r=await s.store('server-owner',{originalName:'owner=evil.pdf',mimeType:'application/pdf',bytes:pdf});expect(r.ownerId).toBe('server-owner')});
 it('resolves correct owner',async()=>{const {s}=svc();const r=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});expect((await s.resolve('u',r.fileId)).fileId).toBe(r.fileId)});
 it('hides foreign-user file as not found',async()=>{const {s}=svc();const r=await s.store('u1',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});await expect(s.resolve('u2',r.fileId)).rejects.toMatchObject({code:'FILE_NOT_FOUND',status:404})});
 it('missing metadata is deterministic',async()=>{const {s}=svc();await expect(s.resolve('u','missing')).rejects.toMatchObject({code:'FILE_NOT_FOUND'})});
 it('metadata with missing blob is deterministic',async()=>{const {s,b}=svc();const r=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});b.data.clear();await expect(s.resolve('u',r.fileId)).rejects.toMatchObject({code:'FILE_BLOB_MISSING'})});
 it('blob write failure leaves no metadata',async()=>{const {s,b,m}=svc();b.failPut=true;await expect(s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf})).rejects.toMatchObject({code:'BLOB_WRITE_FAILED'});expect(m.data.size).toBe(0)});
 it('metadata failure compensates blob',async()=>{const {s,b,m}=svc();m.fail=true;await expect(s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf})).rejects.toMatchObject({code:'METADATA_WRITE_FAILED'});expect(b.data.size).toBe(0)});
 it('reports orphan cleanup failure deterministically',async()=>{const {s,b,m}=svc();m.fail=true;b.failDelete=true;await expect(s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf})).rejects.toMatchObject({code:'ORPHAN_CLEANUP_FAILED'})});
 it('successful durable round-trip returns safe descriptor',async()=>{const {s}=svc();const r=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});expect(await s.resolve('u',r.fileId)).toEqual(r)});
 it('audit metadata contains no binary content',()=>{const a:any=buildSafeFileAuditMetadata({fileId:'f',mimeType:'application/pdf',sizeBytes:12});expect(a).toEqual({fileId:'f',mimeType:'application/pdf',sizeBytes:12});expect(a.bytes).toBeUndefined()});
 it('public descriptor exposes no storage path or binary',async()=>{const {s}=svc();const r:any=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});expect(r.storageObject).toBeUndefined();expect(r.bytes).toBeUndefined()});
 it('cancellation before write is deterministic',async()=>{const {s}=svc();const c=new AbortController();c.abort();await expect(s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf,signal:c.signal})).rejects.toMatchObject({code:'UPLOAD_CANCELLED'})});
 it('retry is explicit non-deduplicating upload behavior',async()=>{const {s}=svc();const a=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});const b=await s.store('u',{originalName:'a.pdf',mimeType:'application/pdf',bytes:pdf});expect(a.fileId).not.toBe(b.fileId)});
 it('binary signature mismatch is rejected',()=>expect(()=>validateFileBytes('application/pdf',Buffer.from('not pdf'))).toThrow());
});
