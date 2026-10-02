// Isolated feasibility spike. This file is not wired into production routes or capabilities.
import { createHash } from 'node:crypto';
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import sax from 'sax';

export const LIMITS = Object.freeze({
  input: 20 * 1024 * 1024,
  total: 128 * 1024 * 1024,
  entry: 16 * 1024 * 1024,
  count: 512,
  ratio: 100,
  xmlPart: 4 * 1024 * 1024,
  xmlTotal: 32 * 1024 * 1024,
  depth: 128,
  nodes: 500_000,
  output: 20 * 1024 * 1024,
});

const NS = Object.freeze({
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  officeRelationships: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  packageRelationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  contentTypes: 'http://schemas.openxmlformats.org/package/2006/content-types',
});
const OFFICE_DOCUMENT_TYPE = `${NS.officeRelationships}/officeDocument`;
const DOCX_MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const RELS_CONTENT_TYPE = 'application/vnd.openxmlformats-package.relationships+xml';
const decodeAlignment = Object.freeze({ left: 'LEFT', center: 'CENTER', right: 'RIGHT', both: 'JUSTIFY' });
const encodeAlignment = Object.freeze({ LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFY: 'both' });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function reject(code) {
  const error = new Error('DOCX processing rejected safely.');
  error.code = code;
  throw error;
}

function checkCancelled(signal) {
  if (signal?.aborted) reject('PROCESSING_CANCELLED');
}

function boundedRead(buffer, offset, size, code = 'MALFORMED_DOCX') {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > buffer.length) reject(code);
}

function decodeZipName(raw, flags) {
  try {
    // DOCX OPC part names are URI/UTF-8 compatible. Reject legacy encodings rather than
    // accepting names whose normalization differs between ZIP readers.
    if (!(flags & 0x0800) && [...raw].some(byte => byte >= 0x80)) reject('UNSAFE_ARCHIVE_PATH');
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (error) {
    if (error?.code) throw error;
    reject('UNSAFE_ARCHIVE_PATH');
  }
}

function validatePartName(name, seen) {
  if (typeof name !== 'string' || name.length === 0 || name.startsWith('/') || name.startsWith('\\') ||
      name.includes('\\') || name.includes('\0') || /[\u0000-\u001f\u007f]/u.test(name) ||
      name.includes(':') || name.includes('%')) reject('UNSAFE_ARCHIVE_PATH');

  const directory = name.endsWith('/');
  const rawSegments = (directory ? name.slice(0, -1) : name).split('/');
  if (rawSegments.length === 0 || rawSegments.some(segment => !segment || segment === '.' || segment === '..')) reject('UNSAFE_ARCHIVE_PATH');
  const normalized = rawSegments.map(segment => segment.normalize('NFC')).join('/');
  const key = normalized.toLowerCase();
  if (seen.has(key)) reject('UNSAFE_ARCHIVE');
  seen.add(key);
  return { normalized, directory };
}

function readExtraFields(bytes, start, length) {
  boundedRead(bytes, start, length);
  const end = start + length;
  const fields = [];
  for (let offset = start; offset < end;) {
    if (offset + 4 > end) reject('UNSAFE_ARCHIVE');
    const id = bytes.readUInt16LE(offset);
    const size = bytes.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end || id === 0x0001) reject('UNSAFE_ARCHIVE'); // ZIP64 is deliberately unsupported.
    fields.push({ id, data: bytes.subarray(offset, offset + size) });
    offset += size;
  }
  return fields;
}

function inspectZipStructure(bytes) {
  if (bytes.length < 22) reject('MALFORMED_DOCX');
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.length) { eocd = offset; break; }
  }
  if (eocd < 0) reject('MALFORMED_DOCX');

  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const totalEntries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries || totalEntries === 0xffff ||
      centralSize === 0xffffffff || centralOffset === 0xffffffff ||
      (eocd >= 20 && bytes.readUInt32LE(eocd - 20) === 0x07064b50)) reject('UNSAFE_ARCHIVE');
  if (totalEntries > LIMITS.count) reject('ARCHIVE_ENTRY_LIMIT');
  if (centralOffset + centralSize !== eocd) reject('UNSAFE_ARCHIVE');
  boundedRead(bytes, centralOffset, centralSize, 'UNSAFE_ARCHIVE');

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index++) {
    boundedRead(bytes, cursor, 46, 'UNSAFE_ARCHIVE');
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) reject('UNSAFE_ARCHIVE');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc32 = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    boundedRead(bytes, cursor, recordLength, 'UNSAFE_ARCHIVE');
    if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff ||
        (flags & (0x0001 | 0x0040 | 0x2000)) !== 0 || ![0, 8].includes(method)) reject('UNSAFE_ARCHIVE');
    readExtraFields(bytes, cursor + 46 + nameLength, extraLength);
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeZipName(rawName, flags);

    boundedRead(bytes, localOffset, 30, 'UNSAFE_ARCHIVE');
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) reject('UNSAFE_ARCHIVE');
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localUncompressed = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localFlags !== flags || localMethod !== method || localNameLength !== nameLength) reject('UNSAFE_ARCHIVE');
    boundedRead(bytes, localOffset + 30, localNameLength + localExtraLength, 'UNSAFE_ARCHIVE');
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (!localName.equals(rawName)) reject('UNSAFE_ARCHIVE');
    readExtraFields(bytes, localOffset + 30 + localNameLength, localExtraLength);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset) reject('UNSAFE_ARCHIVE');
    const hasDescriptor = (flags & 0x0008) !== 0;
    if (hasDescriptor) {
      if ((localCrc !== 0 && localCrc !== crc32) || (localCompressed !== 0 && localCompressed !== compressedSize) ||
          (localUncompressed !== 0 && localUncompressed !== uncompressedSize)) reject('UNSAFE_ARCHIVE');
    } else if (localCrc !== crc32 || localCompressed !== compressedSize || localUncompressed !== uncompressedSize) {
      reject('UNSAFE_ARCHIVE');
    }
    let recordEnd = dataEnd;
    if (hasDescriptor) {
      let descriptor = dataEnd;
      boundedRead(bytes, descriptor, 12, 'UNSAFE_ARCHIVE');
      if (bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      boundedRead(bytes, descriptor, 12, 'UNSAFE_ARCHIVE');
      if (bytes.readUInt32LE(descriptor) !== crc32 || bytes.readUInt32LE(descriptor + 4) !== compressedSize ||
          bytes.readUInt32LE(descriptor + 8) !== uncompressedSize) reject('UNSAFE_ARCHIVE');
      recordEnd = descriptor + 12;
      if (recordEnd > centralOffset) reject('UNSAFE_ARCHIVE');
    }
    entries.push({ name, flags, method, crc32, compressedSize, uncompressedSize, localOffset, dataOffset, dataEnd, recordEnd });
    cursor += recordLength;
  }
  if (cursor !== centralOffset + centralSize) reject('UNSAFE_ARCHIVE');
  const spans = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let i = 1; i < spans.length; i++) if (spans[i - 1].recordEnd > spans[i].localOffset) reject('UNSAFE_ARCHIVE');
  return entries;
}

function parseXml(bytes, partName, signal, handlers = {}) {
  if (bytes.length > LIMITS.xmlPart) reject('UNSAFE_XML');
  let xml;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { reject('UNSAFE_XML'); }
  if (xml.length > LIMITS.xmlPart || /<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) reject('UNSAFE_XML');

  const parser = sax.parser(true, { xmlns: true, strictEntities: true, maxEntityCount: 1024, maxEntityDepth: 4 });
  const stack = [];
  let depth = 0;
  let nodes = 0;
  let state;
  parser.ondoctype = () => reject('UNSAFE_XML');
  parser.onsgmldeclaration = () => reject('UNSAFE_XML');
  parser.onopentag = tag => {
    checkCancelled(signal);
    depth++;
    nodes++;
    if (depth > LIMITS.depth || nodes > LIMITS.nodes) reject('UNSAFE_XML');
    if (tag.uri === NS.word && ['ins', 'del', 'moveFrom', 'moveTo', 'object', 'altChunk', 'subDoc', 'documentProtection', 'writeProtection'].includes(tag.local)) state.unsupported = true;
    if (tag.uri === NS.word && tag.local === 'body') state.bodyDepth = depth;
    if (state.isMain && tag.uri === NS.word && tag.local === 'document' && depth === 1) state.sawDocumentRoot = true;
    if (state.isMain && tag.uri === NS.word && tag.local === 'body' && depth === 2) state.sawBody = true;
    if (state.isMain && tag.uri === NS.word && tag.local === 'p' && depth === state.bodyDepth + 1) {
      state.paragraph = { paragraphId: `p${state.paragraphs.length + 1}`, text: '', directAlignment: null, anchor: null, jcRange: null, jcAttribute: null, pPrCount: 0, pPrDepth: 0, depth };
    }
    if (state.paragraph && tag.uri === NS.word && tag.local === 'pPr' && depth === state.paragraph.depth + 1) {
      state.paragraph.pPrCount++;
      state.paragraph.pPrDepth = depth;
    }
    if (state.paragraph && state.paragraph.pPrDepth && tag.uri === NS.word && tag.local === 'jc' && depth === state.paragraph.pPrDepth + 1) {
      if (state.paragraph.jcRange) reject('PACKAGE_NOT_MUTABLE');
      const values = Object.values(tag.attributes).filter(attribute => attribute.uri === NS.word && attribute.local === 'val');
      if (values.length !== 1 || !decodeAlignment[values[0].value]) reject('PACKAGE_NOT_MUTABLE');
      state.paragraph.directAlignment = decodeAlignment[values[0].value];
      state.paragraph.jcRange = [parser.startTagPosition - 1, parser.position];
      state.paragraph.jcAttribute = values[0].name;
    }
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri === NS.officeRelationships && ['id', 'embed', 'link'].includes(attribute.local)) state.relationshipRefs.add(attribute.value);
    }
    handlers.open?.(tag, state);
    stack.push(tag);
  };
  parser.ontext = value => {
    const top = stack.at(-1);
    if (state.paragraph && top?.uri === NS.word && top.local === 't') state.paragraph.text += value;
    handlers.text?.(value, state);
  };
  parser.onclosetag = () => {
    const tag = stack.pop();
    handlers.close?.(tag, state);
    if (state.paragraph && tag?.uri === NS.word && tag.local === 'p' && depth === state.paragraph.depth) {
      if (state.paragraph.pPrCount > 1) reject('PACKAGE_NOT_MUTABLE');
      state.paragraph.anchor = sha256(Buffer.from(state.paragraph.text.replace(/\s+/gu, ' ').trim()));
      state.paragraphs.push(state.paragraph);
      state.paragraph = null;
    }
    if (tag?.uri === NS.word && tag.local === 'body' && depth === state.bodyDepth) state.bodyDepth = 0;
    depth--;
  };
  state = { isMain: partName === handlers.mainPart, paragraphs: [], paragraph: null, bodyDepth: 0, relationshipRefs: new Set(), unsupported: false, sawDocumentRoot: false, sawBody: false };

  try {
    for (let offset = 0; offset < xml.length; offset += 64 * 1024) {
      checkCancelled(signal);
      parser.write(xml.slice(offset, offset + 64 * 1024));
    }
    parser.close();
  } catch (error) {
    if (error?.code) throw error;
    reject('UNSAFE_XML');
  }
  if (state.paragraph || depth !== 0) reject('UNSAFE_XML');
  handlers.finish?.(state);
  return { xml, paragraphs: state.paragraphs, relationshipRefs: state.relationshipRefs, unsupported: state.unsupported, sawDocumentRoot: state.sawDocumentRoot, sawBody: state.sawBody };
}

function parseContentTypes(parsed, entries) {
  if (parsed.root !== 'Types' || parsed.rootNamespace !== NS.contentTypes) reject('MALFORMED_DOCX');
  const defaults = new Map();
  const overrides = new Map();
  for (const item of parsed.items) {
    if (item.kind === 'Default') {
      if (!/^[A-Za-z0-9_-]{1,32}$/u.test(item.extension) || !item.contentType || item.contentType.includes('\0')) reject('MALFORMED_DOCX');
      const key = item.extension.toLowerCase();
      if (defaults.has(key)) reject('MALFORMED_DOCX');
      defaults.set(key, item.contentType);
    } else if (item.kind === 'Override') {
      if (!item.partName?.startsWith('/') || item.partName.startsWith('//') || item.partName.includes('\\') || /[?#]/u.test(item.partName)) reject('MALFORMED_DOCX');
      const partName = item.partName.slice(1);
      const { normalized } = validatePartName(partName, new Set());
      const key = normalized.toLowerCase();
      if (!item.contentType || item.contentType.includes('\0') || overrides.has(key)) reject('MALFORMED_DOCX');
      overrides.set(key, item.contentType);
    } else reject('MALFORMED_DOCX');
  }
  if (!defaults.size && !overrides.size) reject('MALFORMED_DOCX');
  const resolve = name => {
    const normalized = name.normalize('NFC').toLowerCase();
    if (overrides.has(normalized)) return overrides.get(normalized);
    const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    return defaults.get(extension);
  };
  for (const [name, record] of entries) {
    if (record.directory || name === '[Content_Types].xml') continue;
    if (!resolve(name)) reject('MALFORMED_DOCX');
  }
  return { defaults, overrides, resolve };
}

function resolveRelationshipTarget(sourcePart, target) {
  if (typeof target !== 'string' || target.length === 0 || target.startsWith('/') || target.startsWith('\\') ||
      target.includes('\\') || /[?#]/u.test(target) || /%/u.test(target) || /^[a-z][a-z0-9+.-]*:/iu.test(target)) reject('UNSAFE_ARCHIVE_PATH');
  const sourceDirectory = sourcePart ? sourcePart.slice(0, Math.max(0, sourcePart.lastIndexOf('/') + 1)) : '';
  const segments = [...sourceDirectory.split('/').filter(Boolean), ...target.split('/')];
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\u0000-\u001f\u007f]/u.test(segment))) reject('UNSAFE_ARCHIVE_PATH');
  return segments.map(segment => segment.normalize('NFC')).join('/');
}

function sourcePartForRels(relsName) {
  if (relsName === '_rels/.rels') return '';
  const marker = '/_rels/';
  const index = relsName.lastIndexOf(marker);
  if (index < 0 || !relsName.endsWith('.rels')) reject('MALFORMED_DOCX');
  const fileName = relsName.slice(index + marker.length, -'.rels'.length);
  if (!fileName) reject('MALFORMED_DOCX');
  return `${relsName.slice(0, index + 1)}${fileName}`;
}

function parseSimpleXml(bytes, name, signal, mainPart) {
  const result = { root: null, rootNamespace: null, items: [], relationships: [], settingsProtected: false, refs: new Set(), unsupported: false, document: null };
  let rootSeen = false;
  let elementDepth = 0;
  const parsed = parseXml(bytes, name, signal, {
    mainPart,
    open(tag, state) {
      elementDepth++;
      if (!rootSeen) { rootSeen = true; result.root = tag.local; result.rootNamespace = tag.uri; }
      else if (name === '[Content_Types].xml' && (elementDepth !== 2 || tag.uri !== NS.contentTypes || !['Default', 'Override'].includes(tag.local))) reject('MALFORMED_DOCX');
      else if (name.endsWith('.rels') && (elementDepth !== 2 || tag.uri !== NS.packageRelationships || tag.local !== 'Relationship')) reject('MALFORMED_DOCX');
      if (name === '[Content_Types].xml' && tag.uri === NS.contentTypes && ['Default', 'Override'].includes(tag.local)) {
        const attrs = Object.values(tag.attributes);
        const attr = local => attrs.filter(value => value.local === local && value.uri === '');
        const required = tag.local === 'Default' ? ['Extension', 'ContentType'] : ['PartName', 'ContentType'];
        for (const key of required) if (attr(key).length !== 1) reject('MALFORMED_DOCX');
        if (attrs.some(value => !required.includes(value.local))) reject('MALFORMED_DOCX');
        result.items.push(tag.local === 'Default'
          ? { kind: 'Default', extension: attr('Extension')[0].value, contentType: attr('ContentType')[0].value }
          : { kind: 'Override', partName: attr('PartName')[0].value, contentType: attr('ContentType')[0].value });
      }
      if (name.endsWith('.rels') && tag.uri === NS.packageRelationships && tag.local === 'Relationship') {
        const attrs = Object.values(tag.attributes);
        const one = local => attrs.filter(value => value.local === local && value.uri === '');
        if (one('Id').length !== 1 || one('Type').length !== 1 || one('Target').length !== 1 || attrs.some(value => !['Id', 'Type', 'Target', 'TargetMode'].includes(value.local))) reject('MALFORMED_DOCX');
        const modes = one('TargetMode');
        if (modes.length > 1 || (modes.length === 1 && modes[0].value !== 'External' && modes[0].value !== 'Internal')) reject('MALFORMED_DOCX');
        result.relationships.push({ id: one('Id')[0].value, type: one('Type')[0].value, target: one('Target')[0].value, external: modes[0]?.value === 'External' });
      }
      if (name === 'word/settings.xml' && tag.uri === NS.word && tag.local === 'documentProtection') result.settingsProtected = true;
      result.unsupported ||= state.unsupported;
    },
    close() { elementDepth--; },
    finish(state) {
      if (elementDepth !== 0) reject('MALFORMED_DOCX');
      result.unsupported ||= state.unsupported;
      result.refs = state.relationshipRefs;
    },
  });
  if (name === mainPart) {
    if (!parsed.sawDocumentRoot || !parsed.sawBody || result.root !== 'document' || result.rootNamespace !== NS.word) reject('MALFORMED_DOCX');
    result.document = { xml: parsed.xml, paragraphs: parsed.paragraphs };
  }
  result.sawDocumentRoot = parsed.sawDocumentRoot;
  result.sawBody = parsed.sawBody;
  result.refs = parsed.relationshipRefs;
  result.unsupported ||= parsed.unsupported;
  return result;
}

async function preflight(input, signal) {
  checkCancelled(signal);
  if (!Buffer.isBuffer(input)) reject('MALFORMED_DOCX');
  if (input.length > LIMITS.input) reject('INPUT_TOO_LARGE');
  const structure = inspectZipStructure(input);
  const snapshot = Buffer.from(input);
  const sourceSha256 = sha256(snapshot);
  const reader = new ZipReader(new Uint8ArrayReader(snapshot), { strictness: 'strict', checkCrc32: true, checkOverlappingEntry: true, filenameValidation: 'tolerant' });
  const entries = new Map();
  const byKey = new Map();
  const parsedParts = new Map();
  let declaredTotal = 0;
  let actualTotal = 0;
  let xmlTotal = 0;
  let mainPart;

  try {
    const zipEntries = await reader.getEntries({ strictness: 'strict', filenameValidation: 'tolerant' });
    if (zipEntries.length !== structure.length || zipEntries.length > LIMITS.count) reject('UNSAFE_ARCHIVE');
    const centralByName = new Map(structure.map(item => [item.name, item]));
    for (const entry of zipEntries) {
      checkCancelled(signal);
      const central = centralByName.get(entry.filename);
      if (!central || central.compressedSize !== entry.compressedSize || central.uncompressedSize !== entry.uncompressedSize || central.method !== entry.compressionMethod) reject('UNSAFE_ARCHIVE');
      const { normalized, directory } = validatePartName(entry.filename, new Set());
      const key = normalized.toLowerCase();
      if (byKey.has(key)) reject('UNSAFE_ARCHIVE');
      byKey.set(key, normalized);
      if (entry.encrypted || ![0, 8].includes(entry.compressionMethod) || !Number.isSafeInteger(entry.uncompressedSize) || !Number.isSafeInteger(entry.compressedSize)) reject('UNSAFE_ARCHIVE');
      if (entry.uncompressedSize > LIMITS.entry) reject('ARCHIVE_ENTRY_TOO_LARGE');
      declaredTotal += entry.uncompressedSize;
      if (declaredTotal > LIMITS.total) reject('ARCHIVE_EXPANSION_LIMIT');
      if (entry.uncompressedSize > 0 && (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > LIMITS.ratio)) reject('ARCHIVE_EXPANSION_LIMIT');
      if (/(^|\/)(?:vbaProject\.bin|[^/]*\.bin|embeddings|activeX|_xmlsignatures|customXml)(\/|$)/iu.test(normalized) || /\.docm$/iu.test(normalized)) reject('PACKAGE_NOT_MUTABLE');

      const isXml = !directory && (/\.(?:xml|rels)$/iu.test(normalized) || normalized === '[Content_Types].xml');
      const chunks = [];
      let actual = 0;
      await entry.getData(new WritableStream({
        write(chunk) {
          checkCancelled(signal);
          actual += chunk.length;
          actualTotal += chunk.length;
          if (actual > LIMITS.entry) reject('ARCHIVE_ENTRY_TOO_LARGE');
          if (actualTotal > LIMITS.total) reject('ARCHIVE_EXPANSION_LIMIT');
          if (isXml) {
            xmlTotal += chunk.length;
            if (chunk.length + (chunks.byteLength || 0) > LIMITS.xmlPart || xmlTotal > LIMITS.xmlTotal) reject('UNSAFE_XML');
            chunks.push(Buffer.from(chunk));
          }
        },
      }), { strictness: 'strict', checkCrc32: true, checkOverlappingEntry: true });
      if (actual !== entry.uncompressedSize) reject('UNSAFE_ARCHIVE');
      const record = { name: normalized, originalName: entry.filename, directory, entry, size: actual };
      entries.set(normalized, record);
      if (isXml) {
        const xmlBytes = Buffer.concat(chunks);
        if (xmlBytes.length > LIMITS.xmlPart) reject('UNSAFE_XML');
        const parsed = parseSimpleXml(xmlBytes, normalized, signal, mainPart);
        parsedParts.set(normalized, { ...parsed, bytes: xmlBytes });
      }
    }

    const types = entries.get('[Content_Types].xml');
    const rootRels = entries.get('_rels/.rels');
    if (!types || !rootRels) reject('MALFORMED_DOCX');
    const parsedTypes = parsedParts.get('[Content_Types].xml');
    const parsedRootRels = parsedParts.get('_rels/.rels');
    if (!parsedTypes || !parsedRootRels || parsedRootRels.root !== 'Relationships' || parsedRootRels.rootNamespace !== NS.packageRelationships) reject('MALFORMED_DOCX');
    const contentTypes = parseContentTypes(parsedTypes, entries);

    const relIds = new Set();
    let officeDocument = [];
    for (const relationship of parsedRootRels.relationships) {
      if (!relationship.id || relIds.has(relationship.id) || !relationship.type) reject('MALFORMED_DOCX');
      relIds.add(relationship.id);
      if (relationship.external) reject('PACKAGE_NOT_MUTABLE');
      if (relationship.type === OFFICE_DOCUMENT_TYPE) officeDocument.push(relationship);
    }
    if (officeDocument.length !== 1) reject('MALFORMED_DOCX');
    mainPart = resolveRelationshipTarget('', officeDocument[0].target);
    const mainEntry = entries.get(mainPart);
    if (!mainEntry || mainEntry.directory || byKey.get(mainPart.toLowerCase()) !== mainPart) reject('MALFORMED_DOCX');
    if (contentTypes.resolve(mainPart) !== DOCX_MAIN_CONTENT_TYPE) reject('MALFORMED_DOCX');
    const mainBytes = parsedParts.get(mainPart)?.bytes;
    if (!mainBytes) reject('MALFORMED_DOCX');
    const parsedMain = parseSimpleXml(mainBytes, mainPart, signal, mainPart);
    parsedParts.set(mainPart, { ...parsedMain, bytes: mainBytes });

    const relationshipIdsBySource = new Map([['', new Set(relIds)]]);
    for (const [name, parsed] of parsedParts) {
      if (!name.endsWith('.rels')) continue;
      if (parsed.root !== 'Relationships' || parsed.rootNamespace !== NS.packageRelationships) reject('MALFORMED_DOCX');
      const source = sourcePartForRels(name);
      if (source && !entries.has(source)) reject('MALFORMED_DOCX');
      const ids = new Set();
      for (const relationship of parsed.relationships) {
        if (!relationship.id || !relationship.type || ids.has(relationship.id)) reject('MALFORMED_DOCX');
        ids.add(relationship.id);
        if (relationship.external) reject('PACKAGE_NOT_MUTABLE');
        const target = resolveRelationshipTarget(source, relationship.target);
        if (!entries.has(target) || entries.get(target).directory) reject('MALFORMED_DOCX');
      }
      relationshipIdsBySource.set(source, ids);
    }
    for (const [name, parsed] of parsedParts) {
      if (name.endsWith('.rels') || name === '[Content_Types].xml') continue;
      const refs = parsed.refs ?? new Set();
      const relIdsForPart = relationshipIdsBySource.get(name) ?? new Set();
      for (const ref of refs) if (!relIdsForPart.has(ref)) reject('MALFORMED_DOCX');
    }
    for (const [name] of entries) {
      if (name === '[Content_Types].xml') continue;
      if (name.endsWith('.rels') && contentTypes.resolve(name) !== RELS_CONTENT_TYPE) reject('MALFORMED_DOCX');
    }

    const parsedDocument = parsedParts.get(mainPart);
    if (!parsedDocument?.document) reject('MALFORMED_DOCX');
    for (const parsed of parsedParts.values()) if (parsed.unsupported) reject('PACKAGE_NOT_MUTABLE');
    if (parsedParts.has('word/settings.xml') && parsedParts.get('word/settings.xml').settingsProtected) reject('PACKAGE_NOT_MUTABLE');
    return { snapshot, sourceSha256, reader, entries, parsedParts, document: parsedDocument.document, mainPart };
  } catch (error) {
    await reader.close().catch(() => {});
    if (error?.code) throw error;
    reject('MALFORMED_DOCX');
  }
}

export async function inspect(input, signal) {
  const packageState = await preflight(input, signal);
  try {
    return {
      sourceSha256: packageState.sourceSha256,
      profile: 'generic-direct-alignment-spike',
      safeToMutate: true,
      packagePolicy: 'NORMAL',
      mainDocumentPart: packageState.mainPart,
      paragraphs: packageState.document.paragraphs.slice(0, 250).map(paragraph => ({
        paragraphId: paragraph.paragraphId,
        text: paragraph.text.slice(0, 500),
        directAlignment: paragraph.directAlignment,
        anchor: paragraph.anchor,
      })),
      paragraphsTruncated: packageState.document.paragraphs.length > 250,
      diagnostics: [],
    };
  } finally {
    await packageState.reader.close();
  }
}

export async function applyAlignment(input, operation, signal) {
  const packageState = await preflight(input, signal);
  try {
    if (packageState.sourceSha256 !== operation.sourceSha256) reject('STALE_DOCUMENT');
    const paragraph = packageState.document.paragraphs.find(item => item.paragraphId === operation.paragraphId);
    if (!paragraph || paragraph.anchor !== operation.anchor) reject('TARGET_NOT_FOUND');
    if (!paragraph.jcRange || !paragraph.directAlignment) reject('PROVENANCE_NOT_DIRECT');
    if (paragraph.directAlignment !== operation.expectedBefore) reject('PRECONDITION_FAILED');
    if (!encodeAlignment[operation.desiredAfter] || operation.desiredAfter === operation.expectedBefore) reject('UNSUPPORTED_OPERATION');

    const parsed = packageState.parsedParts.get(packageState.mainPart);
    const [start, end] = paragraph.jcRange;
    const tag = parsed.document.xml.slice(start, end);
    const attribute = paragraph.jcAttribute;
    const from = encodeAlignment[operation.expectedBefore];
    const to = encodeAlignment[operation.desiredAfter];
    const escapedName = attribute.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const escapedValue = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const expression = new RegExp(`(\\b${escapedName}\\s*=\\s*["'])${escapedValue}(["'])`, 'gu');
    const matches = [...tag.matchAll(expression)];
    if (matches.length !== 1) reject('PACKAGE_NOT_MUTABLE');
    const replacement = tag.replace(expression, (_match, prefix, quote) => `${prefix}${to}${quote}`);
    const xml = parsed.document.xml.slice(0, start) + replacement + parsed.document.xml.slice(end);

    const writer = new ZipWriter(new Uint8ArrayWriter(), { zip64: false });
    for (const [name, record] of packageState.entries) {
      checkCancelled(signal);
      if (name === packageState.mainPart) await writer.add(record.originalName, new Uint8ArrayReader(Buffer.from(xml)), { level: 6 });
      else {
        const compressed = await record.entry.getData(new Uint8ArrayWriter(), { passThrough: true, strictness: 'strict' });
        await writer.add(record.originalName, new Uint8ArrayReader(compressed), { passThrough: true, entry: record.entry });
      }
    }
    const outputBytes = Buffer.from(await writer.close());
    if (outputBytes.length > LIMITS.output) reject('OUTPUT_TOO_LARGE');
    const outputState = await preflight(outputBytes, signal);
    try {
      const reopened = outputState.document.paragraphs.find(item => item.paragraphId === operation.paragraphId);
      if (!reopened || reopened.directAlignment !== operation.desiredAfter || reopened.anchor !== operation.anchor) reject('POSTCONDITION_FAILED');
      for (const [name, record] of packageState.entries) {
        if (name === packageState.mainPart) continue;
        const outputRecord = outputState.entries.get(name);
        if (!outputRecord) reject('OUTPUT_INTEGRITY_FAILED');
        const originalPart = await record.entry.getData(new Uint8ArrayWriter(), { checkCrc32: true });
        const outputPart = await outputRecord.entry.getData(new Uint8ArrayWriter(), { checkCrc32: true });
        if (sha256(originalPart) !== sha256(outputPart)) reject('OUTPUT_INTEGRITY_FAILED');
        const originalCompressed = await record.entry.getData(new Uint8ArrayWriter(), { passThrough: true });
        const outputCompressed = await outputRecord.entry.getData(new Uint8ArrayWriter(), { passThrough: true });
        if (sha256(originalCompressed) !== sha256(outputCompressed)) reject('OUTPUT_INTEGRITY_FAILED');
      }
      if (sha256(input) !== packageState.sourceSha256) reject('SOURCE_IMMUTABILITY_VIOLATION');
      return { bytes: outputBytes, sourceSha256: packageState.sourceSha256, outputSha256: outputState.sourceSha256, reopened: true, revalidated: true };
    } finally {
      await outputState.reader.close();
    }
  } catch (error) {
    if (error?.code) throw error;
    reject('PROCESSING_FAILED');
  } finally {
    await packageState.reader.close();
  }
}
