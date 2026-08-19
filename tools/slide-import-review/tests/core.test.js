import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_LIMITS, ReviewBundleError, validateReviewMap, writeStoredZip, loadReviewBundle,
  exportReviewedBundle, finalizeBundle, resolveUnresolvedQuestion, rejectUnresolvedQuestion,
  deterministicResolvedIds, sha256Hex, detectImageType
} from '../src/core.js';
import {
  parseImportPackage, IMPORT_PACKAGE_VERSION, MAX_ARCHIVE_BYTES, MAX_UNCOMPRESSED_BYTES,
  MAX_ARCHIVE_ENTRIES, MAX_MANIFEST_BYTES
} from '../../../src/lib/server/import/content-package.js';
import { MAX_IMAGE_BYTES } from '../../../src/lib/server/storage/media.js';

const enc = new TextEncoder();
const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
const jpg = new Uint8Array([0xff,0xd8,1,2,3,0xff,0xd9]);
const clone = x => structuredClone(x);

async function fixture({threeImages=false, unresolved=true}={}) {
  const assets = threeImages ? [1,2,3].map(i=>({id:`asset-${i}`,operation:'create',path:`media/a${i}.png`,mimeType:'image/png',originalFilename:`a${i}.png`,altText:`Image ${i}`,sourceLabel:null,sourceUrl:null,licence:null,isActive:true})) : [{id:'asset-1',operation:'create',path:'media/a1.png',mimeType:'image/png',originalFilename:'a1.png',altText:'Image 1',sourceLabel:null,sourceUrl:null,licence:null,isActive:true}];
  const caseAssets=assets.map((a,i)=>({id:`case-asset-${i+1}`,operation:'create',caseId:'case-a',assetId:a.id,displayOrder:i,captionMd:null}));
  const hash=await sha256Hex(png);
  const manifest={version:1,packageId:'slide-test',topics:[{id:'topic-holding',operation:'create',name:'Imported — Test — Unsorted',slug:'imported-test-unsorted',descriptionMd:null,parentTopicId:null,isActive:true}],cases:[{id:'case-a',operation:'create',title:'Admin diagnosis',vignetteMd:'A vignette',primaryTopicId:'topic-holding',secondaryTopicIds:[],questionSelectionMode:'all',isActive:true},{id:'case-b',operation:'create',title:'Rejected case',vignetteMd:'Other',primaryTopicId:'topic-holding',secondaryTopicIds:[],questionSelectionMode:'all',isActive:true}],assets:[...assets,{id:'asset-b',operation:'create',path:'media/b.png',mimeType:'image/png',originalFilename:'b.png',altText:'Rejected image',isActive:true}],caseAssets:[...caseAssets,{id:'case-asset-b',operation:'create',caseId:'case-b',assetId:'asset-b',displayOrder:0,captionMd:null}],questionPrompts:[{id:'prompt-a',operation:'create',promptMd:'What is the diagnosis?',isActive:true},{id:'prompt-b',operation:'create',promptMd:'Rejected prompt',isActive:true}],caseQuestions:[{id:'question-a',operation:'create',caseId:'case-a',questionPromptId:'prompt-a',answerMd:'Answer A',isActive:true},{id:'question-b',operation:'create',caseId:'case-b',questionPromptId:'prompt-b',answerMd:'Answer B',isActive:true}],topicQuestions:[]};
  const assetMeta=assets.map((a,i)=>({assetId:a.id,reviewStatus:'approved',confidence:'high',warnings:[],sourceRefs:[{sourceId:'source-1',pages:[i+1]}],extractionMethod:'embedded_original',sha256:hash,reviewNotes:[]}));
  const reviewMap={version:1,bundleId:'bundle-1',batchName:'Batch 1',sourceFiles:[{sourceId:'source-1',filename:'deck.pdf',repository:null,path:null,ref:null,pageCount:5}],cases:[{caseId:'case-a',reviewStatus:'approved',confidence:'high',warnings:[],sourceRefs:[{sourceId:'source-1',pages:[1,2,3]}],caseBoundaryNotes:'Question and answer pages',assets:assetMeta,questions:[{caseQuestionId:'question-a',reviewStatus:'approved',confidence:'high',warnings:[],promptSourceRefs:[{sourceId:'source-1',pages:[1]}],answerSourceRefs:[{sourceId:'source-1',pages:[2]}],reviewNotes:[]}],reviewNotes:[]},{caseId:'case-b',reviewStatus:'rejected',confidence:'high',warnings:[],sourceRefs:[{sourceId:'source-1',pages:[4]}],caseBoundaryNotes:null,assets:[{assetId:'asset-b',reviewStatus:'rejected',confidence:'high',warnings:[],sourceRefs:[{sourceId:'source-1',pages:[4]}],extractionMethod:'crop',sha256:hash,reviewNotes:[]}],questions:[{caseQuestionId:'question-b',reviewStatus:'rejected',confidence:'high',warnings:[],promptSourceRefs:[{sourceId:'source-1',pages:[4]}],answerSourceRefs:[{sourceId:'source-1',pages:[4]}],reviewNotes:[]}],reviewNotes:[]}],sourceCoverage:[1,2,3,4,5].map(page=>({sourceId:'source-1',page,classification:page===5?'teaching/reference material':'case',caseIds:page===4?['case-b']:page<4?['case-a']:[],notes:null,previewPath:`source-previews/p${page}.jpg`})),unresolvedQuestions:unresolved?[{candidateId:'unresolved-question-001-03',caseId:'case-a',sourcePrompt:'What investigation would you perform next?',proposedPrompt:'What investigation would you perform next?',promptSourceRefs:[{sourceId:'source-1',pages:[3]}],answerSourceRefs:[],reviewStatus:'needs_review',confidence:'low',warnings:[{code:'missing_answer',severity:'blocking',message:'No reliable answer was found in the supplied source material.'}],reviewNotes:[],resolvedQuestionPromptId:null,resolvedCaseQuestionId:null}]:[],batchWarnings:[]};
  const entries=[{path:'manifest.json',bytes:enc.encode(JSON.stringify(manifest))},{path:'review-map.json',bytes:enc.encode(JSON.stringify(reviewMap))},{path:'media/b.png',bytes:png},...assets.map(a=>({path:a.path,bytes:png})),...[1,2,3,4,5].map(p=>({path:`source-previews/p${p}.jpg`,bytes:jpg}))];
  return {manifest,reviewMap,zip:writeStoredZip(entries)};
}

function expectReviewError(fn, contains){assert.throws(fn,e=>e instanceof ReviewBundleError && e.message.includes(contains));}

test('browser production limits stay synchronized with production exports',()=>{
  assert.deepEqual(PRODUCTION_LIMITS,{importPackageVersion:IMPORT_PACKAGE_VERSION,maxArchiveBytes:MAX_ARCHIVE_BYTES,maxUncompressedBytes:MAX_UNCOMPRESSED_BYTES,maxArchiveEntries:MAX_ARCHIVE_ENTRIES,maxManifestBytes:MAX_MANIFEST_BYTES,maxImageBytes:MAX_IMAGE_BYTES});
});

test('valid review-map v1 loads and source previews resolve',async()=>{const f=await fixture();const b=await loadReviewBundle(f.zip);assert.equal(b.reviewMap.version,1);assert.equal(b.reviewMap.cases.length,2);});

test('review-map rejects unknown version/status/confidence/severity and broken references',async()=>{
  const f=await fixture();
  for(const [mutate,msg] of [
    [r=>r.version=2,'Unsupported review-map version'],[r=>r.cases[0].reviewStatus='done','reviewStatus must be one of'],[r=>r.cases[0].confidence='certain','confidence must be one of'],[r=>r.cases[0].warnings=[{code:'x',severity:'fatal',message:'x'}],'severity must be one of'],[r=>r.cases[0].caseId='missing','missing manifest Case'],[r=>r.cases[0].assets[0].assetId='missing','missing manifest Asset'],[r=>r.cases[0].questions[0].caseQuestionId='missing','missing manifest Case Question'],[r=>r.sourceCoverage[0].previewPath='source-previews/nope.jpg','missing bundle file']
  ]){const r=clone(f.reviewMap);mutate(r);assert.throws(()=>validateReviewMap(r,f.manifest,new Set(['source-previews/p1.jpg','source-previews/p2.jpg','source-previews/p3.jpg','source-previews/p4.jpg','source-previews/p5.jpg'])),new RegExp(msg));}
  const r=clone(f.reviewMap);r.sourceFiles.push(clone(r.sourceFiles[0]));expectReviewError(()=>validateReviewMap(r,f.manifest,new Set()),'Duplicate reviewMap.sourceFiles');
});

test('missing-answer question lives only in review-map then promotes deterministically',async()=>{
  const f=await fixture();assert.equal(f.manifest.caseQuestions.some(q=>q.id.includes('001-03')),false);const ids=deterministicResolvedIds('unresolved-question-001-03');assert.deepEqual(ids,{questionPromptId:'resolved-prompt:unresolved-question-001-03',caseQuestionId:'resolved-case-question:unresolved-question-001-03'});resolveUnresolvedQuestion(f.manifest,f.reviewMap,'unresolved-question-001-03',{promptMd:'Prompt fixed',answerMd:'Human supplied answer'});assert.equal(f.manifest.questionPrompts.at(-1).id,ids.questionPromptId);assert.equal(f.manifest.caseQuestions.at(-1).id,ids.caseQuestionId);const u=f.reviewMap.unresolvedQuestions[0];assert.equal(u.resolvedQuestionPromptId,ids.questionPromptId);assert.equal(u.reviewStatus,'approved');assert.equal(f.reviewMap.cases[0].questions.at(-1).reviewStatus,'pending');
});

test('rejecting unresolved question preserves history and creates no manifest objects',async()=>{const f=await fixture();const before=[f.manifest.questionPrompts.length,f.manifest.caseQuestions.length];rejectUnresolvedQuestion(f.reviewMap,'unresolved-question-001-03');assert.equal(f.reviewMap.unresolvedQuestions[0].reviewStatus,'rejected');assert.deepEqual([f.manifest.questionPrompts.length,f.manifest.caseQuestions.length],before);});

test('pending unresolved blocks finalization while rejected unresolved does not',async()=>{const f=await fixture();const b=await loadReviewBundle(f.zip);await assert.rejects(()=>finalizeBundle(b),e=>e.issues.some(x=>x.includes('Unresolved Question')));rejectUnresolvedQuestion(b.reviewMap,'unresolved-question-001-03');const out=await finalizeBundle(b);assert.ok(out.zip.length>0);});

test('direct edits are the manifest values finalized; no semantic conversion occurs',async()=>{const f=await fixture({unresolved:false});const b=await loadReviewBundle(f.zip);b.manifest.cases[0].title='Edited title';b.manifest.cases[0].vignetteMd='Edited vignette';b.manifest.questionPrompts[0].promptMd='Edited prompt';b.manifest.caseQuestions[0].answerMd='Edited answer';b.manifest.assets[0].altText='Edited alt';b.manifest.caseAssets[0].displayOrder=7;const out=await finalizeBundle(b);assert.equal(out.manifest.cases[0].title,'Edited title');assert.equal(out.manifest.cases[0].vignetteMd,'Edited vignette');assert.equal(out.manifest.questionPrompts[0].promptMd,'Edited prompt');assert.equal(out.manifest.caseQuestions[0].answerMd,'Edited answer');assert.equal(out.manifest.assets[0].altText,'Edited alt');assert.equal(out.manifest.caseAssets[0].displayOrder,7);});

test('three fixed images preserve display order, replacement hash, and final media',async()=>{const f=await fixture({threeImages:true,unresolved:false});const b=await loadReviewBundle(f.zip);assert.deepEqual(b.manifest.caseAssets.filter(x=>x.caseId==='case-a').map(x=>x.displayOrder),[0,1,2]);b.files.set('media/a2.png',png);b.reviewMap.cases[0].assets[1].sha256=await sha256Hex(png);const out=await finalizeBundle(b);const parsed=await parseImportPackage(out.zip);assert.equal(parsed.manifest.assets.length,3);assert.equal(parsed.media.size,3);});

test('rejected Case and its orphan entities/media are pruned',async()=>{const f=await fixture({unresolved:false});const b=await loadReviewBundle(f.zip);const out=await finalizeBundle(b);assert.deepEqual(out.manifest.cases.map(x=>x.id),['case-a']);assert.deepEqual(out.manifest.assets.map(x=>x.id),['asset-1']);assert.deepEqual(out.manifest.caseQuestions.map(x=>x.id),['question-a']);const parsed=await parseImportPackage(out.zip);assert.equal(parsed.media.has('media/b.png'),false);});

test('finalizer fail-closed representative failures',async()=>{
  const cases=[
    ['pending Case',b=>b.reviewMap.cases[0].reviewStatus='pending','review state is pending'],
    ['needs-review Case',b=>b.reviewMap.cases[0].reviewStatus='needs_review','review state is needs_review'],
    ['blank answer',b=>b.manifest.caseQuestions[0].answerMd='','blank answer'],
    ['blank prompt',b=>b.manifest.questionPrompts[0].promptMd='','blank prompt'],
    ['unapproved Asset',b=>b.reviewMap.cases[0].assets[0].reviewStatus='needs_review','Asset asset-1'],
    ['blocking warning',b=>b.reviewMap.cases[0].warnings.push({code:'x',severity:'blocking',message:'blocked'}),'blocked'],
    ['missing media',b=>b.files.delete('media/a1.png'),'missing media'],
    ['hash mismatch',b=>b.reviewMap.cases[0].assets[0].sha256='00','SHA-256 mismatch'],
    ['MIME mismatch',b=>b.manifest.assets[0].mimeType='image/jpeg','MIME mismatch'],
    ['unsupported bytes',b=>{b.files.set('media/a1.png',new Uint8Array([1,2,3]));b.reviewMap.cases[0].assets[0].sha256='00';},'unsupported image format'],
    ['broken topic',b=>b.manifest.cases[0].primaryTopicId='missing-topic','missing Topic']
  ];
  for(const [,mutate,needle] of cases){const f=await fixture({unresolved:false});const b=await loadReviewBundle(f.zip);mutate(b);await assert.rejects(()=>finalizeBundle(b),e=>e.issues.some(x=>x.includes(needle)),needle);}
});

test('reviewed bundle export preserves review-only material',async()=>{const f=await fixture({unresolved:false});const b=await loadReviewBundle(f.zip);const exported=exportReviewedBundle(b);const round=await loadReviewBundle(exported);assert.equal(round.reviewMap.bundleId,'bundle-1');assert.ok(round.files.has('source-previews/p1.jpg'));});

test('production compatibility: finalizer output succeeds in real parseImportPackage()',async()=>{const f=await fixture({unresolved:false});const b=await loadReviewBundle(f.zip);const out=await finalizeBundle(b);const parsed=await parseImportPackage(out.zip);assert.equal(parsed.manifest.version,1);assert.equal(parsed.manifest.packageId,'slide-test');assert.equal(parsed.manifest.cases.length,1);assert.equal(parsed.media.size,1);});

test('image detection recognizes JPEG and PNG only',()=>{assert.equal(detectImageType(png),'image/png');assert.equal(detectImageType(jpg),'image/jpeg');assert.equal(detectImageType(new Uint8Array([1,2,3])),null);});
