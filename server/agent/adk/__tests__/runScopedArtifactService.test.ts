import { describe, expect, it, vi } from 'vitest';
import type { UserFileRecord } from '../../../core/files/UserFileService';
import { FileDomainError } from '../../../core/files/UserFileService';
import { MAX_MODEL_INPUT_BYTES_PER_FILE } from '../../chat/attachmentPolicy';
import { createRunScopedArtifactService } from '../RunScopedArtifactService';

const ids = {
  attached: '6b291111-1111-4111-8111-111111111111',
  second: '6b292222-2222-4222-8222-222222222222',
  sameOwnerUnattached: '6b293333-3333-4333-8333-333333333333',
  foreign: '6b294444-4444-4444-8444-444444444444',
  stale: '6b295555-5555-4555-8555-555555555555',
};

const record = (fileId:string, ownerId='owner', overrides:Partial<UserFileRecord>={}):UserFileRecord => ({
  fileId, ownerId, originalName:'report.txt', mimeType:'text/plain', sizeBytes:5, status:'ready', createdAt:null, ...overrides,
});

function setup() {
  const records = new Map<string,UserFileRecord>([
    [ids.attached, record(ids.attached)],
    [ids.second, record(ids.second, 'owner', {originalName:'image.png',mimeType:'image/png',sizeBytes:4})],
    [ids.sameOwnerUnattached, record(ids.sameOwnerUnattached)],
    [ids.foreign, record(ids.foreign, 'other')],
    [ids.stale, record(ids.stale)],
  ]);
  const resolve = vi.fn(async (ownerId:string,fileId:string) => {
    const file=records.get(fileId); if(!file || file.ownerId!==ownerId) throw new FileDomainError('FILE_NOT_FOUND',404,'File not found.'); return file;
  });
  const readBytes = vi.fn(async (ownerId:string,fileId:string,maxBytes:number,signal?:AbortSignal) => {
    if(signal?.aborted) throw new FileDomainError('FILE_READ_CANCELLED',499,'File read cancelled.');
    const file=records.get(fileId); if(!file || file.ownerId!==ownerId) throw new FileDomainError('FILE_NOT_FOUND',404,'File not found.');
    return {file,bytes:Buffer.from(fileId===ids.second?'png!':'hello')};
  });
  return {records, files:{resolve,readBytes}, resolve, readBytes};
}
const scope={appName:'app',userId:'owner',sessionId:'session'};

describe('GĐ4 L3B-1 run-scoped artifact bridge',()=>{
  it('lists only the immutable current-request whitelist without reading bytes',async()=>{
    const {files,readBytes}=setup();
    const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached},{fileId:ids.second}],files as any);
    expect(await service.listArtifactKeys(scope)).toEqual([ids.attached,ids.second]);
    expect(readBytes).not.toHaveBeenCalled();
    expect(await service.listVersions({...scope,filename:ids.attached})).toEqual([0]);
    expect(await service.listArtifactVersions({...scope,filename:ids.attached})).toEqual([{version:0,mimeType:'text/plain'}]);
  });

  it('loads an attached artifact lazily through the canonical bounded read and maps safe Part metadata',async()=>{
    const {files,readBytes}=setup();
    const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any);
    expect(readBytes).not.toHaveBeenCalled();
    const part:any=await service.loadArtifact({...scope,filename:ids.attached});
    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(readBytes).toHaveBeenCalledWith('owner',ids.attached,MAX_MODEL_INPUT_BYTES_PER_FILE,undefined);
    expect(part).toEqual({inlineData:{mimeType:'text/plain',data:Buffer.from('hello').toString('base64')}});
    expect(JSON.stringify(part)).not.toContain('storage');
    expect((service as any).whitelist).toBeUndefined();
  });

  it.each([
    ['unknown','00000000-0000-4000-8000-000000000000'],
    ['same-owner unattached',ids.sameOwnerUnattached],
    ['foreign',ids.foreign],
    ['stale prior-turn',ids.stale],
  ])('fails closed for %s artifact keys without canonical binary read',async(_label,key)=>{
    const {files,readBytes}=setup();
    const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any);
    expect(await service.loadArtifact({...scope,filename:key})).toBeUndefined();
    expect(readBytes).not.toHaveBeenCalled();
  });

  it('blocks a foreign file even when supplied as a current-request reference',async()=>{
    const {files,readBytes}=setup();
    await expect(createRunScopedArtifactService('owner',[{fileId:ids.foreign}],files as any)).rejects.toMatchObject({code:'FILE_NOT_FOUND'});
    expect(readBytes).not.toHaveBeenCalled();
  });

  it('propagates an in-flight abort through the canonical read without rewriting cancellation',async()=>{
    const {files}=setup(); const controller=new AbortController();
    files.readBytes=vi.fn((_owner:string,_fileId:string,_max:number,signal?:AbortSignal)=>new Promise((_resolve,reject)=>{
      signal?.addEventListener('abort',()=>reject(new FileDomainError('FILE_READ_CANCELLED',499,'File read cancelled.')),{once:true});
    })) as any;
    const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any,controller.signal);
    const pending=service.loadArtifact({...scope,filename:ids.attached}); controller.abort();
    await expect(pending).rejects.toMatchObject({code:'FILE_READ_CANCELLED'});
  });

  it('propagates AbortSignal to canonical read and preserves cancellation',async()=>{
    const {files,readBytes}=setup(); const controller=new AbortController();
    const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any,controller.signal);
    controller.abort();
    await expect(service.loadArtifact({...scope,filename:ids.attached})).rejects.toMatchObject({code:'FILE_READ_CANCELLED'});
    expect(readBytes).toHaveBeenCalledWith('owner',ids.attached,MAX_MODEL_INPUT_BYTES_PER_FILE,controller.signal);
  });

  it('uses canonical metadata, rejects unsupported/aggregate policy before exposure, and supports empty scope',async()=>{
    const {files,records,readBytes}=setup();
    records.get(ids.attached)!.originalName='safe-name.txt';
    const empty=await createRunScopedArtifactService('owner',[],files as any);
    expect(await empty.listArtifactKeys(scope)).toEqual([]);
    expect(readBytes).not.toHaveBeenCalled();
    records.get(ids.attached)!.mimeType='text/html' as any;
    await expect(createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any)).rejects.toMatchObject({code:'UNSUPPORTED_MODEL_INPUT_TYPE'});
    records.get(ids.attached)!.mimeType='text/plain'; records.get(ids.attached)!.sizeBytes=11*1024*1024; records.get(ids.second)!.sizeBytes=11*1024*1024;
    await expect(createRunScopedArtifactService('owner',[{fileId:ids.attached},{fileId:ids.second}],files as any)).rejects.toMatchObject({code:'ATTACHMENT_TOTAL_TOO_LARGE'});
  });

  it('is read-only and exposes truthful single-version metadata only for whitelisted keys',async()=>{
    const {files}=setup(); const service=await createRunScopedArtifactService('owner',[{fileId:ids.attached}],files as any);
    await expect(service.saveArtifact({...scope,filename:ids.attached,artifact:{text:'x'}} as any)).rejects.toMatchObject({code:'ARTIFACT_READ_ONLY'});
    await expect(service.deleteArtifact({...scope,filename:ids.attached})).rejects.toMatchObject({code:'ARTIFACT_READ_ONLY'});
    expect(await service.loadArtifact({...scope,filename:ids.attached,version:1})).toBeUndefined();
    expect(await service.listVersions({...scope,filename:ids.sameOwnerUnattached})).toEqual([]);
    expect(await service.getArtifactVersion({...scope,filename:ids.attached})).toEqual({version:0,mimeType:'text/plain'});
    expect(await service.getArtifactVersion({...scope,filename:ids.attached,version:1})).toBeUndefined();
  });
});
