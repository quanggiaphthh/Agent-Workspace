import type {
  BaseArtifactService,
  DeleteArtifactRequest,
  ListArtifactKeysRequest,
  ListVersionsRequest,
  LoadArtifactRequest,
  SaveArtifactRequest,
} from '@google/adk';
import type { Part } from '@google/genai';
import type { UserFileRecord, UserFileService } from '../../core/files/UserFileService';
import { FileDomainError } from '../../core/files/UserFileService';
import {
  MAX_ATTACHMENTS_PER_TURN,
  MAX_MODEL_INPUT_BYTES_AGGREGATE,
  MAX_MODEL_INPUT_BYTES_PER_FILE,
  MODEL_INPUT_MIME_SET,
} from '../chat/attachmentPolicy';
import type { AttachmentReference } from '../chat/chatRequestContract';

interface ArtifactVersionMetadata {
  version: number;
  mimeType?: string;
}

type CanonicalFileReader = Pick<UserFileService, 'resolve' | 'readBytes'>;

const fail = (code:string,status:number,message:string) => new FileDomainError(code,status,message);
const readOnly = () => fail('ARTIFACT_READ_ONLY',405,'Run-scoped request artifacts are read-only.');

/**
 * Invocation-local, read-only ADK view over only the files attached to the
 * current request. It owns no storage authority and is never persisted.
 */
class RunScopedArtifactService implements BaseArtifactService {
  readonly #ownerId:string;
  readonly #files:CanonicalFileReader;
  readonly #signal?:AbortSignal;
  readonly #authorized:ReadonlyMap<string,Readonly<UserFileRecord>>;
  readonly #materializedSizes=new Map<string,number>();

  constructor(ownerId:string, files:CanonicalFileReader, authorized:Map<string,Readonly<UserFileRecord>>, signal?:AbortSignal) {
    this.#ownerId=ownerId;
    this.#files=files;
    this.#signal=signal;
    this.#authorized=authorized;
  }

  async saveArtifact(_request:SaveArtifactRequest):Promise<number> { throw readOnly(); }
  async deleteArtifact(_request:DeleteArtifactRequest):Promise<void> { throw readOnly(); }

  async listArtifactKeys(_request:ListArtifactKeysRequest):Promise<string[]> {
    return [...this.#authorized.keys()];
  }

  async loadArtifact(request:LoadArtifactRequest):Promise<Part|undefined> {
    const file=this.#authorized.get(request.filename);
    if(!file || (request.version!==undefined && request.version!==0)) return undefined;
    const resolved=await this.#files.readBytes(this.#ownerId,file.fileId,MAX_MODEL_INPUT_BYTES_PER_FILE,this.#signal);
    // Authorization and canonical metadata were fixed when this invocation was created.
    // Refuse materialization if the canonical identity changed underneath the run.
    if(resolved.file.fileId!==file.fileId || resolved.file.ownerId!==this.#ownerId) return undefined;
    if(resolved.file.mimeType!==file.mimeType || resolved.file.sizeBytes!==file.sizeBytes) {
      throw fail('ATTACHMENT_METADATA_CHANGED',409,'Attachment metadata changed during the Agent invocation.');
    }
    const prior=this.#materializedSizes.get(file.fileId) ?? 0;
    const aggregate=[...this.#materializedSizes.values()].reduce((sum,size)=>sum+size,0)-prior+resolved.bytes.length;
    if(aggregate>MAX_MODEL_INPUT_BYTES_AGGREGATE) throw fail('ATTACHMENT_TOTAL_TOO_LARGE',413,'Attachments exceed the aggregate model input size limit.');
    this.#materializedSizes.set(file.fileId,resolved.bytes.length);
    return {inlineData:{mimeType:file.mimeType,data:resolved.bytes.toString('base64')}};
  }

  async listVersions(request:ListVersionsRequest):Promise<number[]> {
    return this.#authorized.has(request.filename) ? [0] : [];
  }

  async listArtifactVersions(request:ListVersionsRequest):Promise<ArtifactVersionMetadata[]> {
    const file=this.#authorized.get(request.filename);
    return file ? [{version:0,mimeType:file.mimeType}] : [];
  }

  async getArtifactVersion(request:LoadArtifactRequest):Promise<ArtifactVersionMetadata|undefined> {
    const file=this.#authorized.get(request.filename);
    if(!file || (request.version!==undefined && request.version!==0)) return undefined;
    return {version:0,mimeType:file.mimeType};
  }
}

/**
 * Resolves only current-request references into an immutable authorization
 * snapshot. Resolution may verify metadata/blob existence but never reads file
 * bytes; binary materialization remains lazy in loadArtifact().
 */
export async function createRunScopedArtifactService(
  ownerId:string,
  refs:readonly AttachmentReference[],
  files:CanonicalFileReader,
  signal?:AbortSignal,
):Promise<BaseArtifactService> {
  if(!ownerId) throw fail('UNAUTHORIZED',401,'Verified owner is required.');
  if(refs.length>MAX_ATTACHMENTS_PER_TURN) throw fail('TOO_MANY_ATTACHMENTS',400,'Too many attachments.');
  if(new Set(refs.map(ref=>ref.fileId)).size!==refs.length) throw fail('DUPLICATE_ATTACHMENT',400,'Duplicate attachment.');
  if(signal?.aborted) throw fail('FILE_READ_CANCELLED',499,'File read cancelled.');

  const authorized=new Map<string,Readonly<UserFileRecord>>();
  let aggregate=0;
  for(const ref of refs) {
    if(signal?.aborted) throw fail('FILE_READ_CANCELLED',499,'File read cancelled.');
    const file=await files.resolve(ownerId,ref.fileId);
    if(file.fileId!==ref.fileId || file.ownerId!==ownerId) throw fail('FILE_NOT_FOUND',404,'File not found.');
    if(!MODEL_INPUT_MIME_SET.has(file.mimeType)) throw fail('UNSUPPORTED_MODEL_INPUT_TYPE',415,'File type is not supported for model input.');
    if(file.sizeBytes>MAX_MODEL_INPUT_BYTES_PER_FILE) throw fail('FILE_TOO_LARGE_FOR_MODEL',413,'File exceeds the model input size limit.');
    aggregate+=file.sizeBytes;
    if(aggregate>MAX_MODEL_INPUT_BYTES_AGGREGATE) throw fail('ATTACHMENT_TOTAL_TOO_LARGE',413,'Attachments exceed the aggregate model input size limit.');
    // fileId is the canonical opaque L3A identity and therefore the smallest
    // deterministic ADK artifact key without exposing storage implementation.
    authorized.set(file.fileId,Object.freeze({...file}));
  }
  return new RunScopedArtifactService(ownerId,files,authorized,signal);
}
