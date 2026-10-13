import { AsyncLocalStorage } from 'node:async_hooks';
import type { DocumentInspectionResult } from './documentProcessorClient';

/** Request-local DOCX bytes and results. This state is never serialized or persisted. */
export interface RequestScopedDocument {
  sourceBytes: Buffer;
  sourceSha256: string;
  originalName: string;
  inspection?: DocumentInspectionResult;
  output?: { bytes: Buffer; sha256: string };
}

const requestStorage = new AsyncLocalStorage<RequestScopedDocument>();

export function runWithRequestScopedDocument<T>(
  document: RequestScopedDocument,
  operation: () => T,
): T {
  return requestStorage.run(document, operation);
}

export function currentRequestScopedDocument(): RequestScopedDocument | undefined {
  return requestStorage.getStore();
}

export function clearRequestScopedSource(document: RequestScopedDocument): void {
  document.sourceBytes.fill(0);
  document.sourceBytes = Buffer.alloc(0);
}

export function clearRequestScopedOutput(document: RequestScopedDocument): void {
  if (document.output) {
    document.output.bytes.fill(0);
    document.output = undefined;
  }
}

export function clearRequestScopedDocument(document: RequestScopedDocument): void {
  clearRequestScopedSource(document);
  clearRequestScopedOutput(document);
  document.inspection = undefined;
}
