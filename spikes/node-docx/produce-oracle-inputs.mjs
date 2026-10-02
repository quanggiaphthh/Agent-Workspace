import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { applyAlignment, inspect } from './processor.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(root, 'fixtures');
const resultRoot = join(root, 'oracle-artifacts');
const inputRoot = join(resultRoot, 'inputs');
const outputRoot = join(resultRoot, 'outputs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = [
  '01-simple.docx', '02-paragraph-style.docx', '03-inherited-style.docx',
  '04-direct-override.docx', '05-multi-section.docx', '06-landscape-section.docx',
  '07-table.docx', '08-header-footer.docx', '09-page-numbering.docx',
  '10-tracked-changes.docx', '11-protected.docx', '12-macro-enabled.docm',
  '13-ole-embedded.docx', '14-external-relationship.docx',
  '15-signed-structure-simulation.docx', '16-readonly-parts.docx',
  '17-numbering.docx', '18-onoff-semantics.docx', '19-style-cycle.docx',
  '20-line-spacing.docx', '21-negative-margin.docx', '22-unsupported-altchunk.docx',
  '23-direct-alignment.docx', '24-vietnamese-rich.docx',
];
const mutationFixtures = new Set(['23-direct-alignment.docx', '24-vietnamese-rich.docx']);

async function alternativeMainPart(source) {
  const reader = new ZipReader(new Uint8ArrayReader(source), { strictness: 'strict', checkCrc32: true });
  const writer = new ZipWriter(new Uint8ArrayWriter(), { zip64: false });
  try {
    for (const entry of await reader.getEntries()) {
      let name = entry.filename;
      let bytes = Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkCrc32: true }));
      if (name === '[Content_Types].xml') bytes = Buffer.from(bytes.toString('utf8').replace('/word/document.xml', '/word/custom-document.xml'));
      if (name === '_rels/.rels') bytes = Buffer.from(bytes.toString('utf8').replace('Target="word/document.xml"', 'Target="word/custom-document.xml"'));
      if (name === 'word/document.xml') name = 'word/custom-document.xml';
      if (name === 'word/_rels/document.xml.rels') name = 'word/_rels/custom-document.xml.rels';
      await writer.add(name, new Uint8ArrayReader(bytes));
    }
    return Buffer.from(await writer.close());
  } finally {
    await reader.close();
  }
}

await mkdir(inputRoot, { recursive: true });
await mkdir(outputRoot, { recursive: true });
const results = [];
for (const fixture of [...fixtures.map(fileName => ({ fileName, source: null })), {
  fileName: '25-opc-alternate-main.docx',
  source: await alternativeMainPart(await readFile(join(fixtureRoot, '23-direct-alignment.docx'))),
}]) {
  const { fileName } = fixture;
  const source = fixture.source ?? await readFile(join(fixtureRoot, fileName));
  const sourceSha256 = digest(source);
  const inputPath = join(inputRoot, fileName);
  await mkdir(dirname(inputPath), { recursive: true });
  await writeFile(inputPath, source);
  try {
    const inspection = await inspect(source);
    if (!inspection.safeToMutate) throw new Error('The Node inspection did not grant mutation eligibility.');
    const result = {
      fileName,
      accepted: true,
      sourceSha256,
      mainDocumentPart: inspection.mainDocumentPart,
      paragraphs: inspection.paragraphs.map(({ paragraphId, text, directAlignment, anchor }) => ({ paragraphId, text, directAlignment, anchor })),
      outputFile: null,
      desiredAfter: null,
    };
    if (mutationFixtures.has(fileName) || fileName === '25-opc-alternate-main.docx') {
      const target = inspection.paragraphs.find(paragraph => paragraph.directAlignment !== null);
      if (!target) throw new Error(`Expected direct alignment target missing in ${fileName}.`);
      const desiredAfter = target.directAlignment === 'LEFT' ? 'RIGHT' : 'LEFT';
      const applied = await applyAlignment(source, {
        sourceSha256,
        paragraphId: target.paragraphId,
        anchor: target.anchor,
        expectedBefore: target.directAlignment,
        desiredAfter,
      });
      const outputFile = `${fileName}.node-output.docx`;
      await writeFile(join(outputRoot, outputFile), applied.bytes);
      result.outputFile = outputFile;
      result.outputSha256 = applied.outputSha256;
      result.targetParagraphId = target.paragraphId;
      result.expectedBefore = target.directAlignment;
      result.desiredAfter = desiredAfter;
      result.reopened = applied.reopened;
      result.revalidated = applied.revalidated;
    }
    results.push(result);
  } catch (error) {
    if (error?.code !== 'PACKAGE_NOT_MUTABLE') throw error;
    results.push({ fileName, accepted: false, sourceSha256, code: error.code, outputFile: null });
  }
}
await writeFile(join(resultRoot, 'node-results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`Node oracle inputs prepared: ${results.length} fixtures; ${results.filter(x => x.accepted).length} readable/mutable; ${results.filter(x => x.outputFile).length} mutation outputs.`);
