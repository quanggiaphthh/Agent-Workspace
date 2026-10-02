import {describe,expect,it} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import {ZipReader,ZipWriter,Uint8ArrayReader,Uint8ArrayWriter,TextReader} from '@zip.js/zip.js';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspect,applyAlignment,LIMITS} from './processor.mjs';
import {processInWorker} from './thread-client.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const xml=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>Xin chào Việt Nam</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>Styled text</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`;
const sourceParts={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':xml,
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
 'word/styles.xml':'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Normal"/></w:styles>',
 'word/numbering.xml':'<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
 'word/header1.xml':'<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>',
 'word/footer1.xml':'<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>',
 'word/media/image1.png':new Uint8Array([137,80,78,71,13,10,26,10]),
};
const fixtureDir=join(dirname(fileURLToPath(import.meta.url)),'fixtures');
const readFixture=name=>readFile(join(fixtureDir,name));
async function make(overrides={},compression=0){const w=new ZipWriter(new Uint8ArrayWriter(),{zip64:false});for(const [name,data]of Object.entries({...sourceParts,...overrides})){if(data===null)continue;await w.add(name,data instanceof Uint8Array?new Uint8ArrayReader(data):new TextReader(data),{level:compression});}return Buffer.from(await w.close());}
async function aggregateBomb(){const w=new ZipWriter(new Uint8ArrayWriter(),{zip64:false});for(const [name,data]of Object.entries(sourceParts))await w.add(name,data instanceof Uint8Array?new Uint8ArrayReader(data):new TextReader(data),{level:0});const data=Buffer.concat([Buffer.alloc(14*1024*1024),randomBytes(1024*1024)]);for(let i=0;i<9;i++)await w.add(`bulk/part-${i}.dat`,new Uint8ArrayReader(data),{level:6});return Buffer.from(await w.close());}
async function readParts(bytes){const z=new ZipReader(new Uint8ArrayReader(bytes),{strictness:'strict'});try{const out={};for(const e of await z.getEntries())out[e.filename]=Buffer.from(await e.getData(new Uint8ArrayWriter(),{checkCrc32:true}));return out;}finally{await z.close();}}
async function compressedParts(bytes){const z=new ZipReader(new Uint8ArrayReader(bytes),{strictness:'strict'});try{const out={};for(const e of await z.getEntries())out[e.filename]=Buffer.from(await e.getData(new Uint8ArrayWriter(),{passThrough:true}));return out;}finally{await z.close();}}
async function rejects(bytes,code){await expect(inspect(bytes)).rejects.toMatchObject({code});}

describe('isolated bounded Node DOCX feasibility seam',()=>{
 it('inspects direct alignment, reports absent direct formatting, and leaves the canonical input unchanged',async()=>{const b=await make(),before=sha(b),r=await inspect(b);expect(r.sourceSha256).toBe(before);expect(r.paragraphs.map(p=>p.directAlignment)).toEqual(['LEFT',null]);expect(r.paragraphs[0].text).toBe('Xin chào Việt Nam');expect(r.safeToMutate).toBe(true);expect(sha(b)).toBe(before);});
 it('changes only direct w:jc, preserves all other decompressed parts and compressed payloads, then reopens/revalidates',async()=>{const b=await make(),r=await inspect(b),out=await applyAlignment(b,{sourceSha256:r.sourceSha256,paragraphId:'p1',anchor:r.paragraphs[0].anchor,expectedBefore:'LEFT',desiredAfter:'RIGHT'});expect(sha(b)).toBe(r.sourceSha256);expect(out.outputSha256).toBe(sha(out.bytes));expect(out.outputSha256).not.toBe(r.sourceSha256);expect(out.reopened&&out.revalidated).toBe(true);const a=await readParts(b),c=await readParts(out.bytes),ca=await compressedParts(b),cc=await compressedParts(out.bytes);for(const n of Object.keys(a))if(n!=='word/document.xml'){expect(sha(c[n])).toBe(sha(a[n]));expect(sha(cc[n])).toBe(sha(ca[n]));}expect(c['word/document.xml'].toString()).toBe(xml.replace('w:val="left"','w:val="right"'));expect((await inspect(out.bytes)).paragraphs[0].directAlignment).toBe('RIGHT');});
 it('requires fresh source hash, paragraph anchor, unique direct alignment and expected-before',async()=>{const b=await make(),r=await inspect(b),op={sourceSha256:r.sourceSha256,paragraphId:'p1',anchor:r.paragraphs[0].anchor,expectedBefore:'LEFT',desiredAfter:'RIGHT'};await expect(applyAlignment(b,{...op,sourceSha256:'0'.repeat(64)})).rejects.toMatchObject({code:'STALE_DOCUMENT'});await expect(applyAlignment(b,{...op,paragraphId:'p2',anchor:r.paragraphs[1].anchor})).rejects.toMatchObject({code:'PROVENANCE_NOT_DIRECT'});await expect(applyAlignment(b,{...op,anchor:'0'.repeat(64)})).rejects.toMatchObject({code:'TARGET_NOT_FOUND'});await expect(applyAlignment(b,{...op,expectedBefore:'CENTER'})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});});
 it('rejects compressed input, entry count, per-entry size and compression expansion',async()=>{await rejects(Buffer.alloc(LIMITS.input+1),'INPUT_TOO_LARGE');const big=Buffer.alloc(LIMITS.entry+1);await rejects(await make({'word/media/large.bin':big}),'ARCHIVE_ENTRY_TOO_LARGE');const many={};for(let i=0;i<LIMITS.count;i++)many[`parts/${i}.txt`]='x';await rejects(await make(many),'ARCHIVE_ENTRY_LIMIT');const bomb='X'.repeat(150_000);await rejects(await make({'word/media/repetitive.bin':Buffer.from(bomb)},9),'ARCHIVE_EXPANSION_LIMIT');});
 it('rejects aggregate actual/declared expansion above 128 MiB while each entry remains individually bounded',async()=>{const b=await aggregateBomb();expect(b.length).toBeLessThan(LIMITS.input);await rejects(b,'ARCHIVE_EXPANSION_LIMIT');},30_000);
 it('fails closed on traversal, duplicate normalized paths, DTD, depth, XML size, bad XML, ZIP64 and broken directory',async()=>{await rejects(await make({'../escape':'x'}),'UNSAFE_ARCHIVE_PATH');await rejects(await make({'WORD/DOCUMENT.XML':'x'}),'UNSAFE_ARCHIVE');await rejects(await make({'word/styles.xml':'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'}),'UNSAFE_XML');await rejects(await make({'word/styles.xml':'<x>'.repeat(130)+'</x>'.repeat(130)}),'UNSAFE_XML');await rejects(await make({'word/styles.xml':'<x>'+('a'.repeat(LIMITS.xmlPart+1))+'</x>'}),'UNSAFE_XML');await rejects(await make({'word/styles.xml':'<x><n></x>'}),'UNSAFE_XML');const zip64=await make();zip64.writeUInt16LE(0xffff,zip64.length-12);await rejects(zip64,'UNSAFE_ARCHIVE');const malformed=await make();malformed[malformed.length-22]=0;await rejects(malformed,'MALFORMED_DOCX');});
 it('rejects external relationships, tracked changes, encrypted entry, excessive node count and cancellation',async()=>{await rejects(await make({'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://evil.invalid" TargetMode="External"/></Relationships>'}),'PACKAGE_NOT_MUTABLE');await rejects(await make({'word/document.xml':xml.replace('<w:pPr>','<w:ins><w:pPr>').replace('</w:pPr>','</w:pPr></w:ins>')}),'PACKAGE_NOT_MUTABLE');await rejects(await make({'word/styles.xml':'<x>'+('<n/>'.repeat(LIMITS.nodes+1))+'</x>'}),'UNSAFE_XML');const encrypted=await make();for(let i=0;i<encrypted.length-4;i++){if(encrypted.readUInt32LE(i)===0x04034b50)encrypted.writeUInt16LE(encrypted.readUInt16LE(i+6)|1,i+6);else if(encrypted.readUInt32LE(i)===0x02014b50)encrypted.writeUInt16LE(encrypted.readUInt16LE(i+8)|1,i+8);}await rejects(encrypted,'UNSAFE_ARCHIVE');const c=new AbortController();c.abort();await expect(inspect(await make(),c.signal)).rejects.toMatchObject({code:'PROCESSING_CANCELLED'});});
 it('runs processing off the request event loop and enforces one worker, timeout and cancellation',async()=>{const b=await make();let heartbeat=false;setTimeout(()=>{heartbeat=true;},0);const started=performance.now(),rssBefore=process.memoryUsage().rss,r=processInWorker('inspect',b);await expect(processInWorker('inspect',b)).rejects.toMatchObject({code:'PROCESSOR_BUSY'});const result=await r,elapsedMs=performance.now()-started,rssDelta=process.memoryUsage().rss-rssBefore;expect(heartbeat).toBe(true);expect(result.sourceSha256).toBe(sha(b));expect(elapsedMs).toBeLessThan(30_000);expect(rssDelta).toBeLessThan(192*1024*1024);await expect(processInWorker('inspect',b,{}, {deadlineMs:1})).rejects.toMatchObject({code:'PROCESSING_TIMEOUT'});const c=new AbortController(),pending=processInWorker('inspect',b,{}, {signal:c.signal,deadlineMs:30_000});setTimeout(()=>c.abort(),1);await expect(pending).rejects.toMatchObject({code:'PROCESSING_CANCELLED'});});
 it('rejects the exact Spike 1 missing-content-type and missing-officeDocument package before inspection',async()=>{
  const direct='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>bad OPC</w:t></w:r></w:p></w:body></w:document>';
  await rejects(await make({'[Content_Types].xml':null,'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>','word/document.xml':direct}),'MALFORMED_DOCX');
  await rejects(await make({'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>','word/document.xml':direct}),'MALFORMED_DOCX');
 });
 it('rejects malformed or ambiguous content types and root office-document relationships',async()=>{
  const ct=sourceParts['[Content_Types].xml'];
  await rejects(await make({'[Content_Types].xml':ct.replace('</Types>','<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')}),'MALFORMED_DOCX');
  await rejects(await make({'[Content_Types].xml':ct.replace('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml','application/xml')}),'MALFORMED_DOCX');
  await rejects(await make({'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="missing.xml"/></Relationships>'}),'MALFORMED_DOCX');
  await rejects(await make({'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'}),'MALFORMED_DOCX');
 });
 it('resolves the main document through OPC relationships rather than a fixed part path',async()=>{
  const ct=sourceParts['[Content_Types].xml'].replace('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>','<Override PartName="/custom/main.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>');
  const rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rMain" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="custom/main.xml"/></Relationships>';
  const b=await make({'[Content_Types].xml':ct,'_rels/.rels':rel,'word/document.xml':null,'word/_rels/document.xml.rels':null,'custom/main.xml':xml});
  const r=await inspect(b);expect(r.safeToMutate).toBe(true);expect(r.mainDocumentPart).toBe('custom/main.xml');expect(r.paragraphs[0].directAlignment).toBe('LEFT');
  const out=await applyAlignment(b,{sourceSha256:r.sourceSha256,paragraphId:'p1',anchor:r.paragraphs[0].anchor,expectedBefore:'LEFT',desiredAfter:'RIGHT'});
  expect((await inspect(out.bytes)).paragraphs[0].directAlignment).toBe('RIGHT');
 });
 it('rejects missing internal relationship targets and absolute or traversing relationship targets',async()=>{
  const rels=target=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`;
  await rejects(await make({'word/_rels/document.xml.rels':rels('media/missing.png')}),'MALFORMED_DOCX');
  await rejects(await make({'word/_rels/document.xml.rels':rels('/word/media/image1.png')}),'UNSAFE_ARCHIVE_PATH');
  await rejects(await make({'word/_rels/document.xml.rels':rels('../escape.xml')}),'UNSAFE_ARCHIVE_PATH');
 });
 it('rejects absolute ZIP names, local-central filename disagreement and malformed central-directory offsets',async()=>{
  await rejects(await make({'/absolute.xml':'<x/>'}),'UNSAFE_ARCHIVE_PATH');
  await rejects(await make({'\\absolute.xml':'<x/>'}),'UNSAFE_ARCHIVE_PATH');
  const localMismatch=await make();for(let i=0;i<localMismatch.length-4;i++)if(localMismatch.readUInt32LE(i)===0x04034b50){localMismatch[i+30]^=1;break;}await rejects(localMismatch,'UNSAFE_ARCHIVE');
  const badDirectory=await make();let central=-1;for(let i=0;i<badDirectory.length-4;i++)if(badDirectory.readUInt32LE(i)===0x02014b50){central=i;break;}expect(central).toBeGreaterThanOrEqual(0);badDirectory.writeUInt32LE(0xfffffff0,central+42);await rejects(badDirectory,'UNSAFE_ARCHIVE');
  const overlap=await make();let first=-1,second=-1;for(let i=0;i<overlap.length-4;i++)if(overlap.readUInt32LE(i)===0x02014b50){if(first<0)first=i;else{second=i;break;}}expect(second).toBeGreaterThan(first);overlap.writeUInt32LE(overlap.readUInt32LE(first+42),second+42);await rejects(overlap,'UNSAFE_ARCHIVE');
 });
 it('enforces aggregate XML bytes and observes cancellation during XML chunk parsing',async()=>{
  const blocks=Array.from({length:1400},()=>{const block=randomBytes(1024).toString('base64');return block+block;});const value=`<x>${blocks.join('')}</x>`;const many={};for(let i=0;i<9;i++)many[`custom/part-${i}.xml`]=value;
  const aggregate=await make(many,6);expect(aggregate.length).toBeLessThan(LIMITS.input);await rejects(aggregate,'UNSAFE_XML');
  const largeXml=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>${'a'.repeat(500_000)}</w:t></w:r></w:p></w:body></w:document>`;
  const cancelDuringParse=await make({'word/document.xml':largeXml});let reads=0;const signal={get aborted(){reads++;return reads>12;}};
  await expect(inspect(cancelDuringParse,signal)).rejects.toMatchObject({code:'PROCESSING_CANCELLED'});expect(reads).toBeGreaterThan(12);
 },30_000);
 it('matches the .NET mutation gate for canonical risky fixtures',async()=>{
  for(const name of ['10-tracked-changes.docx','11-protected.docx','12-macro-enabled.docm','13-ole-embedded.docx','14-external-relationship.docx','15-signed-structure-simulation.docx','22-unsupported-altchunk.docx'])
   await expect(inspect(await readFixture(name))).rejects.toMatchObject({code:'PACKAGE_NOT_MUTABLE'});
 });
 it('accepts canonical valid fixtures including table-only documents without inventing paragraphs',async()=>{
  for(const name of ['01-simple.docx','02-paragraph-style.docx','03-inherited-style.docx','05-multi-section.docx','07-table.docx','08-header-footer.docx','09-page-numbering.docx','17-numbering.docx','19-style-cycle.docx','20-line-spacing.docx','23-direct-alignment.docx','24-vietnamese-rich.docx']){
   const r=await inspect(await readFixture(name));expect(r.safeToMutate).toBe(true);expect(r.profile).toBe('generic-direct-alignment-spike');
  }
  expect((await inspect(await readFixture('07-table.docx'))).paragraphs).toEqual([]);
  expect((await inspect(await readFixture('03-inherited-style.docx'))).paragraphs[0].directAlignment).toBe(null);
  const rich=await inspect(await readFixture('24-vietnamese-rich.docx')),richParts=await readParts(await readFixture('24-vietnamese-rich.docx'));
  expect(rich.paragraphs[0].directAlignment).toBe('LEFT');expect(rich.paragraphs[1].directAlignment).toBe(null);
  expect(richParts['word/styles.xml'].toString()).toContain('<w:jc w:val="center"/>');
  expect(richParts['word/document.xml'].toString()).toContain('<w:pStyle w:val="Normal"/>');
 });
 it('mutates a real Unicode DOCX with table, image, style, numbering, sections and header/footer relationships',async()=>{
  const b=await readFixture('24-vietnamese-rich.docx'),sourceHash=sha(b),inspection=await inspect(b),target=inspection.paragraphs[0];
  expect(target.text).toContain('Cộng hòa xã hội chủ nghĩa Việt Nam');expect(target.directAlignment).toBe('LEFT');
  const parts=await readParts(b);expect(Object.keys(parts)).toEqual(expect.arrayContaining(['word/styles.xml','word/numbering.xml','word/header1.xml','word/footer1.xml','word/media/image1.png']));
  const result=await applyAlignment(b,{sourceSha256:inspection.sourceSha256,paragraphId:target.paragraphId,anchor:target.anchor,expectedBefore:'LEFT',desiredAfter:'RIGHT'});
  expect(sha(b)).toBe(sourceHash);expect(result.outputSha256).not.toBe(sourceHash);expect(result.reopened&&result.revalidated).toBe(true);
  const outputParts=await readParts(result.bytes);for(const name of Object.keys(parts))if(name!=='word/document.xml')expect(sha(outputParts[name])).toBe(sha(parts[name]));
  expect((await inspect(result.bytes)).paragraphs[0].directAlignment).toBe('RIGHT');
 });
 it('rejects authority ambiguity before mutation: duplicate officeDocument, external root edge, duplicate relationship IDs and content-type defaults',async()=>{
  const relationshipRoot=relationships=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
  const officeType='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
  await rejects(await make({'_rels/.rels':relationshipRoot(`<Relationship Id="a" Type="${officeType}" Target="word/document.xml"/><Relationship Id="b" Type="${officeType}" Target="word/document.xml"/>`)}),'MALFORMED_DOCX');
  await rejects(await make({'_rels/.rels':relationshipRoot(`<Relationship Id="a" Type="${officeType}" Target="word/document.xml"/><Relationship Id="b" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://invalid.example" TargetMode="External"/>`)}),'PACKAGE_NOT_MUTABLE');
  const rels=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="dup" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="dup" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`;
  await rejects(await make({'word/_rels/document.xml.rels':rels}),'MALFORMED_DOCX');
  const ct=sourceParts['[Content_Types].xml'].replace('</Types>','<Default Extension="XML" ContentType="application/xml"/></Types>');
  await rejects(await make({'[Content_Types].xml':ct}),'MALFORMED_DOCX');
  const nestedTypes=sourceParts['[Content_Types].xml'].replace('<Default Extension="xml" ContentType="application/xml"/>','<Default Extension="xml" ContentType="application/xml"><Default Extension="rels" ContentType="application/xml"/></Default>');
  await rejects(await make({'[Content_Types].xml':nestedTypes}),'MALFORMED_DOCX');
  const nestedRelationships=relationshipRoot(`<Relationship Id="a" Type="${officeType}" Target="word/document.xml"><Relationship Id="b" Type="${officeType}" Target="word/document.xml"/></Relationship>`);
  await rejects(await make({'_rels/.rels':nestedRelationships}),'MALFORMED_DOCX');
 });
 it('never reaches mutation for the exact malformed OPC package from Spike 1',async()=>{
  const direct='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>bad OPC</w:t></w:r></w:p></w:body></w:document>';
  const broken=await make({'[Content_Types].xml':null,'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>','word/document.xml':direct});
  await expect(inspect(broken)).rejects.toMatchObject({code:'MALFORMED_DOCX'});
  await expect(applyAlignment(broken,{sourceSha256:sha(broken),paragraphId:'p1',anchor:sha(Buffer.from('bad OPC')),expectedBefore:'LEFT',desiredAfter:'RIGHT'})).rejects.toMatchObject({code:'MALFORMED_DOCX'});
 });
});
