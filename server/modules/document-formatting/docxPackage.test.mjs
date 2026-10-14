import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ZipReader, ZipWriter, TextReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { inspect, applyAlignment, applyTopMargin, applyAdministrativePageLayout } from './docxPackage.mjs';
import { processDocxInWorker } from './docxWorkerClient.ts';
import { LocalDocumentProcessor } from './localDocumentProcessor.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const documentXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>Xin chào Việt Nam</w:t></w:r></w:p><w:sectPr><w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1701"/></w:sectPr></w:body></w:document>';
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const relationships = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

async function makeDocx(overrides = {}) {
  const parts = {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': relationships,
    'word/document.xml': documentXml,
    'word/media/image1.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ...overrides,
  };
  const writer = new ZipWriter(new Uint8ArrayWriter(), { zip64: false });
  for (const [name, content] of Object.entries(parts)) {
    if (content === null) continue;
    await writer.add(name, content instanceof Uint8Array ? new Uint8ArrayReader(content) : new TextReader(content), { level: 6 });
  }
  return Buffer.from(await writer.close());
}

async function partsOf(bytes) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { strictness: 'strict' });
  try {
    const result = new Map();
    for (const entry of await reader.getEntries()) {
      result.set(entry.filename, Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkCrc32: true })));
    }
    return result;
  } finally { await reader.close(); }
}

describe('DOCX package engine on current main', () => {
  it('keeps the source unchanged and changes only one explicit paragraph alignment', async () => {
    const source = await makeDocx();
    const before = await inspect(source);
    expect(before.paragraphs[0].text).toBe('Xin chào Việt Nam');
    const changed = await applyAlignment(source, {
      sourceSha256: before.sourceSha256,
      paragraphId: 'p1',
      anchor: before.paragraphs[0].anchor,
      expectedBefore: 'LEFT',
      desiredAfter: 'RIGHT',
    });
    expect(changed.outputSha256).toBe(digest(changed.bytes));
    expect(before.sourceSha256).toBe(digest(source));
    const originalParts = await partsOf(source);
    const changedParts = await partsOf(changed.bytes);
    expect(changedParts.get('word/document.xml').toString()).toBe(documentXml.replace('w:val="left"', 'w:val="right"'));
    for (const [name, bytes] of originalParts) if (name !== 'word/document.xml') expect(digest(changedParts.get(name))).toBe(digest(bytes));
  });

  it('changes one existing page margin and reports only the actual mutation', async () => {
    const source = await makeDocx();
    const output = await applyTopMargin(source, {
      sourceSha256: digest(source),
      expectedBeforeTwips: 1440,
      desiredAfterTwips: 1420,
    });
    expect(output.actualChanges).toEqual([{
      part: 'word/document.xml', property: 'w:pgMar/@w:top', beforeTwips: 1440, afterTwips: 1420,
    }]);
    expect((await partsOf(output.bytes)).get('word/document.xml').toString())
      .toBe(documentXml.replace('w:top="1440"', 'w:top="1420"'));
    expect(digest(source)).toBe(output.sourceSha256);
  });

  it('preserves Vietnamese text, tables, images and other parts in a real DOCX fixture', async () => {
    const source = await readFile(new URL('./fixtures/24-vietnamese-rich.docx', import.meta.url));
    const original = await partsOf(source);
    const xml = original.get('word/document.xml').toString('utf8');
    const margin = xml.match(/<w:pgMar\b[^>]*\/>/u)?.[0];
    expect(margin).toBeTruthy();
    const top = Number(margin.match(/\bw:top=(["'])([0-9]+)\1/u)?.[2]);
    const next = top === 1420 ? 1440 : 1420;
    const before = await inspect(source);
    const output = await applyTopMargin(source, {
      sourceSha256: before.sourceSha256, expectedBeforeTwips: top, desiredAfterTwips: next,
    });
    const after = await partsOf(output.bytes);
    expect(after.get('word/document.xml').toString('utf8'))
      .toBe(xml.replace(margin, margin.replace(/\bw:top=(["'])([0-9]+)\1/u, (_all, quote) => `w:top=${quote}${next}${quote}`)));
    expect([...after.keys()].sort()).toEqual([...original.keys()].sort());
    for (const [name, bytes] of original) if (name !== 'word/document.xml') expect(digest(after.get(name))).toBe(digest(bytes));
    expect(original.has('word/media/image1.png')).toBe(true);
    expect(original.has('word/numbering.xml')).toBe(true);
    expect(original.has('word/header1.xml')).toBe(true);
    expect((await inspect(output.bytes)).paragraphs.map(p => p.text)).toEqual(before.paragraphs.map(p => p.text));
    expect(digest(source)).toBe(before.sourceSha256);
  });

  it('rejects alternate main part paths without classifying valid OPC as malformed', async () => {
    const source = await makeDocx({
      '[Content_Types].xml': contentTypes.replace('/word/document.xml', '/word/custom-document.xml'),
      '_rels/.rels': relationships.replace('word/document.xml', 'word/custom-document.xml'),
      'word/document.xml': null,
      'word/custom-document.xml': documentXml,
    });
    await expect(inspect(source)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
  });

  it('processes in a worker, rejects overlapping work and supports cancellation', async () => {
    const source = await makeDocx();
    const pending = processDocxInWorker('inspect', source);
    await expect(processDocxInWorker('inspect', source)).rejects.toMatchObject({ code: 'PROCESSOR_BUSY' });
    const result = await pending;
    expect(result.sourceSha256).toBe(digest(source));
    const controller = new AbortController();
    controller.abort();
    await expect(processDocxInWorker('inspect', source, {}, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'PROCESSING_CANCELLED' });
    const changed = await processDocxInWorker('applyTopMargin', source, {
      sourceSha256: digest(source), expectedBeforeTwips: 1440, desiredAfterTwips: 1420,
    });
    expect(changed.actualChanges).toHaveLength(1);
    expect(changed.outputSha256).toBe(digest(changed.bytes));
    const layoutSource = await makeDocx({ 'word/document.xml':
      documentXml.replace('<w:pgMar', '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar') });
    const layout = await processDocxInWorker('applyAdministrativePageLayout', layoutSource);
    expect(layout.actualChanges.map(change => change.property)).toEqual(['w:pgSz/@w:w', 'w:pgSz/@w:h', 'w:pgMar/@w:top', 'w:pgMar/@w:bottom']);
  });

  it('satisfies the existing inspection and apply contract without an external processor', async () => {
    const source = await makeDocx();
    const client = new LocalDocumentProcessor();
    const before = await client.inspect(source);
    expect(before.paragraphs[0]).toMatchObject({
      paragraphId: 'p1', directAlignment: 'LEFT', issueId: null,
    });
    const output = await client.applyAlignment({
      bytes: source, sourceSha256: before.sourceSha256,
      paragraphId: 'p1', expectedBefore: 'LEFT', desiredAfter: 'RIGHT',
    });
    expect(output.sha256).toBe(digest(output.bytes));
    expect((await client.inspect(output.bytes)).paragraphs[0].directAlignment).toBe('RIGHT');
  });

  it('automatically fixes only A4/page margins outside the allowed ranges', async () => {
    const originalXml = documentXml
      .replace('<w:pgMar', '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar')
      .replace('w:top="1440"', 'w:top="1000"')
      .replace('w:bottom="1440"', 'w:bottom="1300"')
      .replace('w:left="1701"', 'w:left="1400"');
    const source = await makeDocx({ 'word/document.xml': originalXml });
    const output = await applyAdministrativePageLayout(source);
    expect(output.actualChanges.map(change => change.property)).toEqual([
      'w:pgSz/@w:w', 'w:pgSz/@w:h', 'w:pgMar/@w:top', 'w:pgMar/@w:left',
    ]);
    const expectedXml = originalXml.replace('w:w="12240"', 'w:w="11906"')
      .replace('w:h="15840"', 'w:h="16838"')
      .replace('w:top="1000"', 'w:top="1417"')
      .replace('w:left="1400"', 'w:left="1701"');
    expect((await partsOf(output.bytes)).get('word/document.xml').toString()).toBe(expectedXml);
    expect(output.actualChanges[2]).toMatchObject({ beforeTwips: 1000, afterTwips: 1417 });
    expect(digest(source)).toBe(output.sourceSha256);
    expect(output.outputSha256).toBe(digest(output.bytes));
    const sourceParts = await partsOf(source);
    const outputParts = await partsOf(output.bytes);
    for (const [name, bytes] of sourceParts) if (name !== 'word/document.xml')
      expect(digest(outputParts.get(name))).toBe(digest(bytes));
  });

  it('formats explicitly identified body text without changing headings, text or attachments', async () => {
    const body = '<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Văn bản nội dung</w:t></w:r></w:p>';
    const sourceXml = documentXml.replace('<w:p><w:pPr>', `${body}<w:p><w:pPr>`)
      .replace('<w:pgMar', '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar')
      .replace('w:top="1440"', 'w:top="1417"').replace('w:bottom="1440"', 'w:bottom="1417"');
    const source = await makeDocx({ 'word/document.xml': sourceXml });
    const output = await applyAdministrativePageLayout(source);
    expect(output.bodySummary).toEqual({ formattedParagraphs: 1, unclassifiedParagraphs: 1,
      adjustments: { font: 1, size: 1, spacing: 1, indent: 1, alignment: 1 } });
    const afterXml = (await partsOf(output.bytes)).get('word/document.xml').toString('utf8');
    expect(afterXml).toContain('<w:pStyle w:val="BodyText"/><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="567"/><w:jc w:val="both"/>');
    expect(afterXml).toContain('<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:b/><w:sz w:val="28"/></w:rPr>');
    expect((await inspect(source)).paragraphs.map(p => p.text)).toEqual((await inspect(output.bytes)).paragraphs.map(p => p.text));
    expect((await partsOf(output.bytes)).get('word/media/image1.png')).toEqual((await partsOf(source)).get('word/media/image1.png'));
    const repeat = await applyAdministrativePageLayout(output.bytes);
    expect(repeat.bytes).toEqual(output.bytes);
    expect(Object.values(repeat.bodySummary.adjustments).every(count => count === 0)).toBe(true);
  });

  it('does not guess formatting of body style with nested fields or links', async () => {
    const source = await makeDocx({ 'word/document.xml': documentXml
      .replace('<w:p><w:pPr>', '<w:p><w:pPr><w:pStyle w:val="BodyText"/>')
      .replace('<w:r><w:t>', '<w:hyperlink><w:r><w:t>')
      .replace('</w:t></w:r>', '</w:t></w:r></w:hyperlink>')
      .replace('<w:pgMar', '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar') });
    await expect(applyAdministrativePageLayout(source)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
  });

  it('preserves valid geometry, formats multiple sections, and rejects unsafe layouts', async () => {
    const validXml = documentXml.replace('<w:pgMar',
      '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar')
      .replace('w:top="1440"', 'w:top="1134"')
      .replace('w:bottom="1440"', 'w:bottom="1417"');
    const source = await makeDocx({ 'word/document.xml': validXml });
    const same = await applyAdministrativePageLayout(source);
    expect(same.actualChanges).toEqual([]);
    expect(same.bytes).toEqual(source);
    const multi = await makeDocx({ 'word/document.xml': validXml.replace('<w:sectPr>', '<w:sectPr/><w:sectPr>') });
    await expect(applyAdministrativePageLayout(multi)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
    const landscape = await makeDocx({ 'word/document.xml': validXml.replace('w:h="16838"', 'w:h="16838" w:orient="landscape"') });
    await expect(applyAdministrativePageLayout(landscape)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
    const mirrored = await makeDocx({
      'word/document.xml': validXml,
      'word/settings.xml': '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:alias="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><alias:mirrorMargins/></w:settings>',
    });
    await expect(applyAdministrativePageLayout(mirrored)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
    const richSource = await readFile(new URL('./fixtures/24-vietnamese-rich.docx', import.meta.url));
    const richBefore = await partsOf(richSource);
    const richOutput = await applyAdministrativePageLayout(richSource);
    const richAfter = await partsOf(richOutput.bytes);
    expect(richOutput.actualChanges.some(change => change.section === 1)).toBe(true);
    expect(richOutput.actualChanges.some(change => change.section === 2)).toBe(true);
    expect((await inspect(richOutput.bytes)).paragraphs.map(item => item.text))
      .toEqual((await inspect(richSource)).paragraphs.map(item => item.text));
    for (const [name, bytes] of richBefore) if (name !== 'word/document.xml')
      expect(digest(richAfter.get(name))).toBe(digest(bytes));
    const unsafe = await makeDocx({ 'word/document.xml': validXml.replace('</w:sectPr>',
      '</w:sectPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>') });
    await expect(applyAdministrativePageLayout(unsafe)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
    const deceptive = await makeDocx({ 'word/document.xml': validXml.replace('<w:sectPr>',
      '<!-- <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr> --><w:sectPr>') });
    await expect(applyAdministrativePageLayout(deceptive)).rejects.toMatchObject({ code: 'PACKAGE_NOT_MUTABLE' });
  });
});
