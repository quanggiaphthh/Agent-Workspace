import { describe,expect,it } from 'vitest';
import { parseStrictAgentChatRequest } from '../chatRequestContract';
import { resolveAttachments,toSafeAttachmentReference } from '../attachmentService';
import { MAX_MODEL_INPUT_BYTES_PER_FILE } from '../attachmentPolicy';
import { UserFileService,type BinaryStore,type MetadataStore,type UserFileRecord } from '../../../core/files/UserFileService';
import { type SupportedFileMimeType } from '../../../core/files/filePolicy';

const ids=['6b291111-1111-4111-8111-111111111111','6b292222-2222-4222-8222-222222222222','6b293333-3333-4333-8333-333333333333','6b294444-4444-4444-8444-444444444444','6b295555-5555-4555-8555-555555555555'];
class B implements BinaryStore{data=new Map<string,Buffer>();fail=false;reads=0;async put(k:string,b:Buffer){this.data.set(k,b)}async readBounded(k:string,max:number){this.reads++;if(this.fail)throw Error('secret users/x/path');const b=this.data.get(k);if(!b)throw Error('secret users/x/path');if(b.length>max)throw Object.assign(Error('limit'),{code:'READ_LIMIT_EXCEEDED'});return b}async exists(k:string){return this.data.has(k)}async delete(k:string){this.data.delete(k)}}
class M implements MetadataStore{data=new Map<string,any>();async create(v:any){this.data.set(v.fileId,v)}async get(k:string){return this.data.get(k)||null}async delete(k:string){this.data.delete(k)}}
const setup=(mime: SupportedFileMimeType='text/plain',bytes=Buffer.from('ok'))=>{const b=new B(),m=new M(),s=new UserFileService(b,m);const meta: UserFileRecord & { storageObject: string }={fileId:ids[0],ownerId:'u',originalName:'a.txt',mimeType:mime,sizeBytes:bytes.length,status:'ready',createdAt:null,storageObject:'secret/path'};m.data.set(ids[0],meta);b.data.set('secret/path',bytes);return{b,m,s,meta}};

describe('L3A attachment contract',()=>{
 it('accepts no attachments',()=>expect(parseStrictAgentChatRequest({message:'x'}).attachments).toBeUndefined());
 it('accepts one',()=>expect(parseStrictAgentChatRequest({message:'x',attachments:[{fileId:ids[0]}]}).attachments).toHaveLength(1));
 it('accepts four',()=>expect(parseStrictAgentChatRequest({message:'x',attachments:ids.slice(0,4).map(fileId=>({fileId}))}).attachments).toHaveLength(4));
 it('rejects five',()=>expect(()=>parseStrictAgentChatRequest({message:'x',attachments:ids.map(fileId=>({fileId}))})).toThrow());
 it('rejects malformed id',()=>expect(()=>parseStrictAgentChatRequest({message:'x',attachments:[{fileId:'bad'}]})).toThrow());
 it('rejects unknown attachment field',()=>expect(()=>parseStrictAgentChatRequest({message:'x',attachments:[{fileId:ids[0],url:'x'}]})).toThrow());
 it.each(['ownerId','userId','storageObject','storagePath','bucket','path','url','uri','mimeType','contentType','size','bytes','base64'])('rejects client authority/data field %s',(k)=>expect(()=>parseStrictAgentChatRequest({message:'x',attachments:[{fileId:ids[0],[k]:'x'}]})).toThrow());
 it('rejects duplicate id',()=>expect(()=>parseStrictAgentChatRequest({message:'x',attachments:[{fileId:ids[0]},{fileId:ids[0]}]})).toThrow());
 it('does not permit attachments on tool response',()=>expect(()=>parseStrictAgentChatRequest({toolResponse:{role:'user',parts:[{functionResponse:{id:'x',name:'adk_request_confirmation',response:{confirmed:true}}}]},attachments:[{fileId:ids[0]}]})).toThrow());
});

describe('L3A authorized bounded resolution',()=>{
 it.each(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/markdown'])('accepts eligible canonical MIME %s',async mime=>{const {s}=setup(mime as SupportedFileMimeType);expect(await resolveAttachments('u',[{fileId:ids[0]}],s)).toHaveLength(1)});
 it('rejects unsupported canonical MIME',async()=>{const {s,m}=setup();m.data.get(ids[0]).mimeType='text/html';await expect(resolveAttachments('u',[{fileId:ids[0]}],s)).rejects.toMatchObject({code:'UNSUPPORTED_MODEL_INPUT_TYPE'})});
 it('own file resolves',async()=>{const {s}=setup();expect((await resolveAttachments('u',[{fileId:ids[0]}],s))[0].safe.fileId).toBe(ids[0])});
 it('foreign file fails closed',async()=>{const {s}=setup();await expect(resolveAttachments('foreign',[{fileId:ids[0]}],s)).rejects.toMatchObject({code:'FILE_NOT_FOUND'})});
 it('missing metadata fails closed',async()=>{const {s,m}=setup();m.data.clear();await expect(resolveAttachments('u',[{fileId:ids[0]}],s)).rejects.toMatchObject({code:'FILE_NOT_FOUND'})});
 it('missing binary safely fails',async()=>{const {s,b}=setup();b.data.clear();await expect(resolveAttachments('u',[{fileId:ids[0]}],s)).rejects.toMatchObject({code:'FILE_READ_FAILED',message:'File binary could not be read.'})});
 it('under bound accepted',async()=>{const {s}=setup();expect((await s.readBytes('u',ids[0],3)).bytes.length).toBe(2)});
 it('exact bound accepted',async()=>{const {s}=setup();expect((await s.readBytes('u',ids[0],2)).bytes.length).toBe(2)});
 it('metadata over bound rejected before binary read',async()=>{const {s,b,m}=setup();m.data.get(ids[0]).sizeBytes=3;await expect(s.readBytes('u',ids[0],2)).rejects.toMatchObject({code:'FILE_TOO_LARGE_FOR_MODEL'});expect(b.reads).toBe(0)});
 it('metadata-under binary-over rejected',async()=>{const {s,b,m}=setup();m.data.get(ids[0]).sizeBytes=1;b.data.set('secret/path',Buffer.alloc(3));await expect(s.readBytes('u',ids[0],2)).rejects.toMatchObject({code:'FILE_TOO_LARGE_FOR_MODEL'})});
 it('aggregate under accepted',async()=>{const {s,m,b}=setup();m.data.set(ids[1],{...m.data.get(ids[0]),fileId:ids[1],storageObject:'p2'});b.data.set('p2',Buffer.from('ok'));expect(await resolveAttachments('u',[{fileId:ids[0]},{fileId:ids[1]}],s)).toHaveLength(2)});
 it('aggregate over rejected',async()=>{const b=new B(),m=new M(),s=new UserFileService(b,m);for(let i=0;i<2;i++){m.data.set(ids[i],{fileId:ids[i],ownerId:'u',originalName:'a.txt',mimeType:'text/plain',sizeBytes:11*1024*1024,status:'ready',createdAt:null,storageObject:'p'+i});b.data.set('p'+i,Buffer.alloc(11*1024*1024,65))}await expect(resolveAttachments('u',ids.slice(0,2).map(fileId=>({fileId})),s)).rejects.toMatchObject({code:'ATTACHMENT_TOTAL_TOO_LARGE'})});
 it('read failure does not expose storage path',async()=>{const {s,b}=setup();b.fail=true;try{await s.readBytes('u',ids[0],100)}catch(e:any){expect(e.message).not.toContain('secret');expect(e.code).toBe('FILE_READ_FAILED')}});
 it('safe reference has no binary/storage authority',()=>{const {meta}=setup();const x=toSafeAttachmentReference(meta);expect(x).toEqual({fileId:ids[0],displayName:'a.txt',mimeType:'text/plain',sizeBytes:2});for(const k of ['bytes','base64','storageObject','bucket','path','uri'])expect((x as any)[k]).toBeUndefined()});
 it('run scoped bytes are separated from safe metadata',async()=>{const {s}=setup();const x:any=(await resolveAttachments('u',[{fileId:ids[0]}],s))[0];expect(Buffer.isBuffer(x.bytes)).toBe(true);expect(x.safe.bytes).toBeUndefined();expect(JSON.stringify(x.safe)).not.toContain('base64')});
 it('pre-abort avoids binary read',async()=>{const {s,b}=setup();const c=new AbortController();c.abort();await expect(resolveAttachments('u',[{fileId:ids[0]}],s,c.signal)).rejects.toMatchObject({code:'FILE_READ_CANCELLED'});expect(b.reads).toBe(0)});
 it('post-read abort is deterministic',async()=>{const {s,b}=setup();const c=new AbortController();b.readBounded=async(k,max)=>{c.abort();return b.data.get(k)!};await expect(s.readBytes('u',ids[0],MAX_MODEL_INPUT_BYTES_PER_FILE,c.signal)).rejects.toMatchObject({code:'FILE_READ_CANCELLED'})});
});
