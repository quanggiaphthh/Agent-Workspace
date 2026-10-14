/**
 * Manual approval remains closed by default. The module is also disabled in
 * module settings until automatic rules and UI pass acceptance. Local DOCX
 * processing does not require remote processor credentials.
 */
export function isDocumentFormattingReleaseReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED === 'true';
}

export const DOCUMENT_FORMATTING_RELEASE_GATE_CODE = 'DOCUMENT_FORMATTING_RELEASE_GATE_CLOSED';
