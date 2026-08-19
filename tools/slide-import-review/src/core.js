export const REVIEW_MAP_VERSION = 1;
export const REVIEW_STATUSES = ['pending', 'approved', 'needs_review', 'rejected'];
export const CONFIDENCE_VALUES = ['high', 'medium', 'low'];
export const WARNING_SEVERITIES = ['blocking', 'warning', 'info'];

// Kept equivalent to src/lib/server/import/content-package.js and storage/media.js.
// Tests assert these values against the production exports so drift fails closed.
export const PRODUCTION_LIMITS = Object.freeze({
  importPackageVersion: 1,
  maxArchiveBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 40 * 1024 * 1024,
  maxArchiveEntries: 256,
  maxManifestBytes: 2 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024
});

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PACKAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MIME = new Set(['image/jpeg', 'image/png']);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class ReviewBundleError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ReviewBundleError';
    this.issues = issues.length ? issues : [message];
  }
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const requiredString = (v, p) => {
  if (typeof v !== 'string' || !v.trim()) throw new ReviewBundleError(`${p} must be a non-empty string.`);
  return v.trim();
};
const optionalString = (v, p) => v == null ? null : requiredString(v, p);
const enumValue = (v, allowed, p) => {
  const s = requiredString(v, p);
  if (!allowed.includes(s)) throw new ReviewBundleError(`${p} must be one of: ${allowed.join(', ')}.`);
  return s;
};
const array = (v, p) => {
  if (!Array.isArray(v)) throw new ReviewBundleError(`${p} must be an array.`);
  return v;
};
const object = (v, p) => {
  if (!isObject(v)) throw new ReviewBundleError(`${p} must be an object.`);
  return v;
};
const allowedKeys = (v, keys, p) => {
  for (const key of Object.keys(v)) if (!keys.includes(key)) throw new ReviewBundleError(`${p}.${key} is not supported.`);
};
const uniqueIds = (items, key, p) => {
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const id = requiredString(items[i][key], `${p}[${i}].${key}`);
    if (seen.has(id)) throw new ReviewBundleError(`Duplicate ${p} ${key}: ${id}.`);
    seen.add(id);
  }
  return seen;
};

function warning(v, p) {
  v = object(v, p);
  allowedKeys(v, ['code', 'severity', 'message'], p);
  return {
    code: requiredString(v.code, `${p}.code`),
    severity: enumValue(v.severity, WARNING_SEVERITIES, `${p}.severity`),
    message: requiredString(v.message, `${p}.message`)
  };
}
function sourceRef(v, p) {
  v = object(v, p);
  allowedKeys(v, ['sourceId', 'pages'], p);
  const pages = array(v.pages, `${p}.pages`).map((n, i) => {
    if (!Number.isInteger(n) || n < 1) throw new ReviewBundleError(`${p}.pages[${i}] must be a positive integer.`);
    return n;
  });
  return { sourceId: requiredString(v.sourceId, `${p}.sourceId`), pages };
}
function componentMeta(v, p) {
  v = object(v, p);
  allowedKeys(v, ['reviewStatus', 'confidence', 'warnings', 'sourceRefs', 'promptSourceRefs', 'answerSourceRefs', 'extractionMethod', 'sha256', 'reviewNotes'], p);
  return {
    reviewStatus: enumValue(v.reviewStatus, REVIEW_STATUSES, `${p}.reviewStatus`),
    confidence: enumValue(v.confidence, CONFIDENCE_VALUES, `${p}.confidence`),
    warnings: array(v.warnings ?? [], `${p}.warnings`).map((w, i) => warning(w, `${p}.warnings[${i}]`)),
    sourceRefs: array(v.sourceRefs ?? [], `${p}.sourceRefs`).map((r, i) => sourceRef(r, `${p}.sourceRefs[${i}]`)),
    promptSourceRefs: array(v.promptSourceRefs ?? [], `${p}.promptSourceRefs`).map((r, i) => sourceRef(r, `${p}.promptSourceRefs[${i}]`)),
    answerSourceRefs: array(v.answerSourceRefs ?? [], `${p}.answerSourceRefs`).map((r, i) => sourceRef(r, `${p}.answerSourceRefs[${i}]`)),
    extractionMethod: optionalString(v.extractionMethod, `${p}.extractionMethod`),
    sha256: optionalString(v.sha256, `${p}.sha256`),
    reviewNotes: array(v.reviewNotes ?? [], `${p}.reviewNotes`).map((n, i) => requiredString(n, `${p}.reviewNotes[${i}]`))
  };
}

export function validateReviewMap(input, manifest, bundlePaths = new Set()) {
  const root = object(input, 'reviewMap');
  allowedKeys(root, ['version', 'bundleId', 'batchName', 'sourceFiles', 'cases', 'sourceCoverage', 'unresolvedQuestions', 'batchWarnings'], 'reviewMap');
  if (root.version !== REVIEW_MAP_VERSION) throw new ReviewBundleError(`Unsupported review-map version: ${String(root.version)}.`);
  const sourceFiles = array(root.sourceFiles, 'reviewMap.sourceFiles').map((s, i) => {
    s = object(s, `reviewMap.sourceFiles[${i}]`);
    allowedKeys(s, ['sourceId', 'filename', 'repository', 'path', 'ref', 'pageCount'], `reviewMap.sourceFiles[${i}]`);
    const pageCount = s.pageCount;
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new ReviewBundleError(`reviewMap.sourceFiles[${i}].pageCount must be a positive integer.`);
    return { sourceId: requiredString(s.sourceId, `reviewMap.sourceFiles[${i}].sourceId`), filename: requiredString(s.filename, `reviewMap.sourceFiles[${i}].filename`), repository: optionalString(s.repository, `reviewMap.sourceFiles[${i}].repository`), path: optionalString(s.path, `reviewMap.sourceFiles[${i}].path`), ref: optionalString(s.ref, `reviewMap.sourceFiles[${i}].ref`), pageCount };
  });
  const sourceIds = uniqueIds(sourceFiles, 'sourceId', 'reviewMap.sourceFiles');
  const manifestCaseIds = new Set(manifest.cases.map((x) => x.id));
  const manifestAssetIds = new Set(manifest.assets.map((x) => x.id));
  const manifestQuestionIds = new Set(manifest.caseQuestions.map((x) => x.id));

  const cases = array(root.cases, 'reviewMap.cases').map((c, i) => {
    const p = `reviewMap.cases[${i}]`; c = object(c, p);
    allowedKeys(c, ['caseId', 'reviewStatus', 'confidence', 'warnings', 'sourceRefs', 'caseBoundaryNotes', 'assets', 'questions', 'reviewNotes'], p);
    const caseId = requiredString(c.caseId, `${p}.caseId`);
    if (!manifestCaseIds.has(caseId)) throw new ReviewBundleError(`${p}.caseId references missing manifest Case ${caseId}.`);
    const assets = array(c.assets ?? [], `${p}.assets`).map((a, j) => {
      const ap = `${p}.assets[${j}]`; a = object(a, ap);
      allowedKeys(a, ['assetId', 'reviewStatus', 'confidence', 'warnings', 'sourceRefs', 'extractionMethod', 'sha256', 'reviewNotes'], ap);
      const assetId = requiredString(a.assetId, `${ap}.assetId`);
      if (!manifestAssetIds.has(assetId)) throw new ReviewBundleError(`${ap}.assetId references missing manifest Asset ${assetId}.`);
      return { assetId, ...componentMeta(a, ap) };
    });
    const questions = array(c.questions ?? [], `${p}.questions`).map((q, j) => {
      const qp = `${p}.questions[${j}]`; q = object(q, qp);
      allowedKeys(q, ['caseQuestionId', 'reviewStatus', 'confidence', 'warnings', 'promptSourceRefs', 'answerSourceRefs', 'reviewNotes'], qp);
      const caseQuestionId = requiredString(q.caseQuestionId, `${qp}.caseQuestionId`);
      if (!manifestQuestionIds.has(caseQuestionId)) throw new ReviewBundleError(`${qp}.caseQuestionId references missing manifest Case Question ${caseQuestionId}.`);
      return { caseQuestionId, ...componentMeta(q, qp) };
    });
    return { caseId, reviewStatus: enumValue(c.reviewStatus, REVIEW_STATUSES, `${p}.reviewStatus`), confidence: enumValue(c.confidence, CONFIDENCE_VALUES, `${p}.confidence`), warnings: array(c.warnings ?? [], `${p}.warnings`).map((w,j)=>warning(w,`${p}.warnings[${j}]`)), sourceRefs: array(c.sourceRefs ?? [], `${p}.sourceRefs`).map((r,j)=>sourceRef(r,`${p}.sourceRefs[${j}]`)), caseBoundaryNotes: optionalString(c.caseBoundaryNotes, `${p}.caseBoundaryNotes`), assets, questions, reviewNotes: array(c.reviewNotes ?? [], `${p}.reviewNotes`).map((n,j)=>requiredString(n,`${p}.reviewNotes[${j}]`)) };
  });
  uniqueIds(cases, 'caseId', 'reviewMap.cases');

  const unresolvedQuestions = array(root.unresolvedQuestions, 'reviewMap.unresolvedQuestions').map((u, i) => {
    const p = `reviewMap.unresolvedQuestions[${i}]`; u = object(u, p);
    allowedKeys(u, ['candidateId','caseId','sourcePrompt','proposedPrompt','promptSourceRefs','answerSourceRefs','reviewStatus','confidence','warnings','reviewNotes','resolvedQuestionPromptId','resolvedCaseQuestionId'], p);
    const caseId = requiredString(u.caseId, `${p}.caseId`);
    if (!manifestCaseIds.has(caseId)) throw new ReviewBundleError(`${p}.caseId references missing manifest Case ${caseId}.`);
    return { candidateId: requiredString(u.candidateId, `${p}.candidateId`), caseId, sourcePrompt: optionalString(u.sourcePrompt, `${p}.sourcePrompt`), proposedPrompt: requiredString(u.proposedPrompt, `${p}.proposedPrompt`), promptSourceRefs: array(u.promptSourceRefs ?? [], `${p}.promptSourceRefs`).map((r,j)=>sourceRef(r,`${p}.promptSourceRefs[${j}]`)), answerSourceRefs: array(u.answerSourceRefs ?? [], `${p}.answerSourceRefs`).map((r,j)=>sourceRef(r,`${p}.answerSourceRefs[${j}]`)), reviewStatus: enumValue(u.reviewStatus, REVIEW_STATUSES, `${p}.reviewStatus`), confidence: enumValue(u.confidence, CONFIDENCE_VALUES, `${p}.confidence`), warnings: array(u.warnings ?? [], `${p}.warnings`).map((w,j)=>warning(w,`${p}.warnings[${j}]`)), reviewNotes: array(u.reviewNotes ?? [], `${p}.reviewNotes`).map((n,j)=>requiredString(n,`${p}.reviewNotes[${j}]`)), resolvedQuestionPromptId: optionalString(u.resolvedQuestionPromptId, `${p}.resolvedQuestionPromptId`), resolvedCaseQuestionId: optionalString(u.resolvedCaseQuestionId, `${p}.resolvedCaseQuestionId`) };
  });
  uniqueIds(unresolvedQuestions, 'candidateId', 'reviewMap.unresolvedQuestions');

  const coverage = array(root.sourceCoverage, 'reviewMap.sourceCoverage').map((x, i) => {
    const p=`reviewMap.sourceCoverage[${i}]`; x=object(x,p);
    allowedKeys(x,['sourceId','page','classification','caseIds','notes','previewPath'],p);
    const sourceId=requiredString(x.sourceId,`${p}.sourceId`); if(!sourceIds.has(sourceId)) throw new ReviewBundleError(`${p}.sourceId references missing source ${sourceId}.`);
    if(!Number.isInteger(x.page)||x.page<1) throw new ReviewBundleError(`${p}.page must be a positive integer.`);
    const caseIds=array(x.caseIds??[],`${p}.caseIds`).map((id,j)=>requiredString(id,`${p}.caseIds[${j}]`));
    for(const id of caseIds) if(!manifestCaseIds.has(id)) throw new ReviewBundleError(`${p}.caseIds references missing manifest Case ${id}.`);
    const previewPath=optionalString(x.previewPath,`${p}.previewPath`);
    if(previewPath && bundlePaths.size && !bundlePaths.has(previewPath)) throw new ReviewBundleError(`${p}.previewPath references missing bundle file ${previewPath}.`);
    return {sourceId,page:x.page,classification:requiredString(x.classification,`${p}.classification`),caseIds,notes:optionalString(x.notes,`${p}.notes`),previewPath};
  });
  const coverageKeys=new Set(); for(const x of coverage){const k=`${x.sourceId}:${x.page}`; if(coverageKeys.has(k)) throw new ReviewBundleError(`Duplicate source coverage entry: ${k}.`); coverageKeys.add(k);}

  const result={version:1,bundleId:requiredString(root.bundleId,'reviewMap.bundleId'),batchName:requiredString(root.batchName,'reviewMap.batchName'),sourceFiles,cases,sourceCoverage:coverage,unresolvedQuestions,batchWarnings:array(root.batchWarnings??[],'reviewMap.batchWarnings').map((w,i)=>warning(w,`reviewMap.batchWarnings[${i}]`))};
  validateSourceRefs(result, sourceIds);
  validateResolvedLinks(result, manifestQuestionIds, new Set(manifest.questionPrompts.map(x=>x.id)));
  return result;
}

function validateSourceRefs(reviewMap, sourceIds){
  const refs=[]; for(const c of reviewMap.cases){refs.push(...c.sourceRefs); for(const a of c.assets)refs.push(...a.sourceRefs); for(const q of c.questions)refs.push(...q.promptSourceRefs,...q.answerSourceRefs);} for(const u of reviewMap.unresolvedQuestions)refs.push(...u.promptSourceRefs,...u.answerSourceRefs);
  for(const r of refs) if(!sourceIds.has(r.sourceId)) throw new ReviewBundleError(`Source reference points to missing source ${r.sourceId}.`);
}
function validateResolvedLinks(reviewMap, questionIds, promptIds){
  for(const u of reviewMap.unresolvedQuestions){
    if(Boolean(u.resolvedQuestionPromptId)!==Boolean(u.resolvedCaseQuestionId)) throw new ReviewBundleError(`Unresolved Question ${u.candidateId} must point to both resolved manifest IDs or neither.`);
    if(u.resolvedQuestionPromptId && !promptIds.has(u.resolvedQuestionPromptId)) throw new ReviewBundleError(`Unresolved Question ${u.candidateId} points to missing resolved Question Prompt.`);
    if(u.resolvedCaseQuestionId && !questionIds.has(u.resolvedCaseQuestionId)) throw new ReviewBundleError(`Unresolved Question ${u.candidateId} points to missing resolved Case Question.`);
  }
}

export function deterministicResolvedIds(candidateId){
  const safe=requiredString(candidateId,'candidateId').replace(/[^A-Za-z0-9._:-]/g,'-');
  return {questionPromptId:`resolved-prompt:${safe}`,caseQuestionId:`resolved-case-question:${safe}`};
}

export function resolveUnresolvedQuestion(manifest, reviewMap, candidateId, {promptMd, answerMd}){
  const candidate=reviewMap.unresolvedQuestions.find(x=>x.candidateId===candidateId); if(!candidate) throw new ReviewBundleError(`Unknown unresolved Question ${candidateId}.`);
  const prompt=requiredString(promptMd,'promptMd'); const answer=requiredString(answerMd,'answerMd'); const ids=deterministicResolvedIds(candidateId);
  if(manifest.questionPrompts.some(x=>x.id===ids.questionPromptId)||manifest.caseQuestions.some(x=>x.id===ids.caseQuestionId)) throw new ReviewBundleError(`Deterministic IDs for ${candidateId} already exist.`);
  manifest.questionPrompts.push({id:ids.questionPromptId,operation:'create',promptMd:prompt,isActive:true});
  manifest.caseQuestions.push({id:ids.caseQuestionId,operation:'create',caseId:candidate.caseId,questionPromptId:ids.questionPromptId,answerMd:answer,isActive:true});
  const caseMeta=reviewMap.cases.find(x=>x.caseId===candidate.caseId); if(!caseMeta) throw new ReviewBundleError(`Missing review Case ${candidate.caseId}.`);
  caseMeta.questions.push({caseQuestionId:ids.caseQuestionId,reviewStatus:'pending',confidence:candidate.confidence,warnings:[],sourceRefs:[],promptSourceRefs:candidate.promptSourceRefs,answerSourceRefs:candidate.answerSourceRefs,extractionMethod:null,sha256:null,reviewNotes:[]});
  candidate.reviewStatus='approved'; candidate.resolvedQuestionPromptId=ids.questionPromptId; candidate.resolvedCaseQuestionId=ids.caseQuestionId; candidate.warnings=candidate.warnings.filter(w=>w.code!=='missing_answer');
  return ids;
}
export function rejectUnresolvedQuestion(reviewMap,candidateId){const c=reviewMap.unresolvedQuestions.find(x=>x.candidateId===candidateId);if(!c)throw new ReviewBundleError(`Unknown unresolved Question ${candidateId}.`);c.reviewStatus='rejected';c.resolvedQuestionPromptId=null;c.resolvedCaseQuestionId=null;}

export function detectImageType(bytes){
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return'image/png';
  if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9)return'image/jpeg'; return null;
}
export async function sha256Hex(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}

const u16=(b,o)=>b[o]|(b[o+1]<<8); const u32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;
function eocd(bytes){for(let o=bytes.length-22;o>=Math.max(0,bytes.length-65557);o--)if(u32(bytes,o)===0x06054b50)return o;throw new ReviewBundleError('ZIP end-of-central-directory record is missing.');}
function safePath(path){if(!path||path.includes('\\')||path.includes('\0')||path.startsWith('/')||/^[A-Za-z]:/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'))throw new ReviewBundleError(`Unsafe ZIP path: ${path}.`);}
async function inflateRaw(bytes){if(typeof DecompressionStream==='undefined')throw new ReviewBundleError('This runtime cannot decompress deflated ZIP entries.');const s=new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer());}
export async function readZip(input){
  const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(await input.arrayBuffer()); const end=eocd(bytes); const count=u16(bytes,end+10), centralOffset=u32(bytes,end+16); const files=new Map(); let cursor=centralOffset;
  for(let i=0;i<count;i++){
    if(u32(bytes,cursor)!==0x02014b50)throw new ReviewBundleError('ZIP central directory entry is invalid.'); const flags=u16(bytes,cursor+8),method=u16(bytes,cursor+10),compressed=u32(bytes,cursor+20),uncompressed=u32(bytes,cursor+24),nameLen=u16(bytes,cursor+28),extraLen=u16(bytes,cursor+30),commentLen=u16(bytes,cursor+32),local=u32(bytes,cursor+42); if(flags&1)throw new ReviewBundleError('Encrypted ZIP entries are not supported.');
    const path=textDecoder.decode(bytes.slice(cursor+46,cursor+46+nameLen)); safePath(path); if(files.has(path))throw new ReviewBundleError(`Duplicate ZIP entry: ${path}.`); if(u32(bytes,local)!==0x04034b50)throw new ReviewBundleError(`Invalid local ZIP header for ${path}.`); const localNameLen=u16(bytes,local+26),localExtra=u16(bytes,local+28),start=local+30+localNameLen+localExtra; const stored=bytes.slice(start,start+compressed); const data=method===0?stored:method===8?await inflateRaw(stored):null; if(!data)throw new ReviewBundleError(`ZIP compression method ${method} is not supported.`); if(data.byteLength!==uncompressed)throw new ReviewBundleError(`ZIP entry size mismatch: ${path}.`); files.set(path,data); cursor+=46+nameLen+extraLen+commentLen;
  } return files;
}

function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function push16(a,v){a.push(v&255,(v>>>8)&255);} function push32(a,v){a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);}
export function writeStoredZip(entries){
  const local=[],central=[]; let offset=0; const seen=new Set();
  for(const entry of entries){safePath(entry.path);if(seen.has(entry.path))throw new ReviewBundleError(`Duplicate ZIP entry: ${entry.path}.`);seen.add(entry.path);const name=textEncoder.encode(entry.path),data=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes),crc=crc32(data);const head=[];push32(head,0x04034b50);push16(head,20);push16(head,0);push16(head,0);push16(head,0);push16(head,0);push32(head,crc);push32(head,data.length);push32(head,data.length);push16(head,name.length);push16(head,0);local.push(new Uint8Array(head),name,data);const ch=[];push32(ch,0x02014b50);push16(ch,20);push16(ch,20);push16(ch,0);push16(ch,0);push16(ch,0);push16(ch,0);push32(ch,crc);push32(ch,data.length);push32(ch,data.length);push16(ch,name.length);push16(ch,0);push16(ch,0);push16(ch,0);push16(ch,0);push32(ch,0);push32(ch,offset);central.push(new Uint8Array(ch),name);offset+=head.length+name.length+data.length;}
  const centralSize=central.reduce((n,x)=>n+x.length,0),out=[...local,...central],end=[];push32(end,0x06054b50);push16(end,0);push16(end,0);push16(end,entries.length);push16(end,entries.length);push32(end,centralSize);push32(end,offset);push16(end,0);out.push(new Uint8Array(end));const total=out.reduce((n,x)=>n+x.length,0),result=new Uint8Array(total);let p=0;for(const x of out){result.set(x,p);p+=x.length;}return result;
}

export function parseJsonFile(files,path){const bytes=files.get(path);if(!bytes)throw new ReviewBundleError(`Review bundle is missing ${path}.`);try{return JSON.parse(textDecoder.decode(bytes));}catch{throw new ReviewBundleError(`${path} is malformed JSON.`);}}

export async function loadReviewBundle(input){
  const files=await readZip(input); if(!files.has('manifest.json')||!files.has('review-map.json'))throw new ReviewBundleError('Review ZIP must contain manifest.json and review-map.json.');
  for(const p of files.keys()) if(p!=='manifest.json'&&p!=='review-map.json'&&!p.startsWith('media/')&&!p.startsWith('source-previews/'))throw new ReviewBundleError(`Unexpected review ZIP path: ${p}.`);
  const manifest=parseJsonFile(files,'manifest.json'); validateManifestShape(manifest); const reviewMap=validateReviewMap(parseJsonFile(files,'review-map.json'),manifest,new Set(files.keys()));
  return {manifest,reviewMap,files};
}

export function validateManifestShape(m){
  object(m,'manifest'); if(m.version!==1)throw new ReviewBundleError(`Unsupported import manifest version: ${String(m.version)}.`); const packageId=requiredString(m.packageId,'manifest.packageId');if(!PACKAGE_ID_RE.test(packageId))throw new ReviewBundleError('manifest.packageId contains unsupported characters.');
  for(const k of ['topics','cases','assets','caseAssets','questionPrompts','caseQuestions','topicQuestions'])array(m[k],`manifest.${k}`);
  const all=[];for(const k of ['topics','cases','assets','caseAssets','questionPrompts','caseQuestions','topicQuestions'])for(const x of m[k]){const id=requiredString(x.id,`manifest.${k}.id`);if(!ID_RE.test(id))throw new ReviewBundleError(`Invalid package-local ID ${id}.`);all.push(id);}if(new Set(all).size!==all.length)throw new ReviewBundleError('Duplicate package-local identifier in manifest.'); return m;
}

function blockers(warnings){return (warnings??[]).filter(w=>w.severity==='blocking');}
export function readinessErrors(manifest,reviewMap,files){
  const errors=[]; const caseMeta=new Map(reviewMap.cases.map(x=>[x.caseId,x])); const prompts=new Map(manifest.questionPrompts.map(x=>[x.id,x])); const assets=new Map(manifest.assets.map(x=>[x.id,x])); const cases=new Map(manifest.cases.map(x=>[x.id,x]));
  for(const c of manifest.cases){const meta=caseMeta.get(c.id);if(!meta){errors.push(`Case ${c.id}: missing review metadata.`);continue;} if(!['approved','rejected'].includes(meta.reviewStatus))errors.push(`Case ${c.id}: review state is ${meta.reviewStatus}.`); if(meta.reviewStatus==='approved'){if(!String(c.title??'').trim())errors.push(`Case ${c.id}: approved Case has no title.`);if(!String(c.primaryTopicId??'').trim())errors.push(`Case ${c.id}: approved Case has no primary Topic.`);if(!['automatic','all','fixed'].includes(c.questionSelectionMode??'automatic'))errors.push(`Case ${c.id}: invalid questionSelectionMode.`);for(const w of blockers(meta.warnings))errors.push(`Case ${c.id}: ${w.message}`);for(const a of meta.assets){if(a.reviewStatus!=='approved')errors.push(`Case ${c.id} Asset ${a.assetId}: status ${a.reviewStatus}.`);for(const w of blockers(a.warnings))errors.push(`Asset ${a.assetId}: ${w.message}`);}for(const q of meta.questions){if(q.reviewStatus!=='approved')errors.push(`Case ${c.id} Question ${q.caseQuestionId}: status ${q.reviewStatus}.`);for(const w of blockers(q.warnings))errors.push(`Question ${q.caseQuestionId}: ${w.message}`);}}}
  for(const u of reviewMap.unresolvedQuestions)if(!['approved','rejected'].includes(u.reviewStatus))errors.push(`Unresolved Question ${u.candidateId}: status ${u.reviewStatus}.`); else if(u.reviewStatus==='approved'&&(!u.resolvedQuestionPromptId||!u.resolvedCaseQuestionId))errors.push(`Unresolved Question ${u.candidateId}: approved without promotion into manifest.`);
  for(const w of blockers(reviewMap.batchWarnings))errors.push(`Batch: ${w.message}`);
  const approvedCases=new Set(reviewMap.cases.filter(x=>x.reviewStatus==='approved').map(x=>x.caseId));
  for(const cq of manifest.caseQuestions){if(!approvedCases.has(cq.caseId))continue;const p=prompts.get(cq.questionPromptId);if(!p)errors.push(`Case Question ${cq.id}: missing Question Prompt ${cq.questionPromptId}.`);else if(!String(p.promptMd??'').trim())errors.push(`Question Prompt ${p.id}: blank prompt.`);if(!String(cq.answerMd??'').trim())errors.push(`Case Question ${cq.id}: blank answer.`);}
  for(const ca of manifest.caseAssets){if(!approvedCases.has(ca.caseId))continue;if(!cases.has(ca.caseId))errors.push(`Case Asset ${ca.id}: missing Case.`);const a=assets.get(ca.assetId);if(!a)errors.push(`Case Asset ${ca.id}: missing Asset ${ca.assetId}.`);}
  for(const c of manifest.cases)if(approvedCases.has(c.id)&&!manifest.topics.some(t=>t.id===c.primaryTopicId))errors.push(`Case ${c.id}: missing Topic ${c.primaryTopicId}.`);
  return errors;
}

export function selectProductionManifest(manifest,reviewMap){
  const approvedCases=new Set(reviewMap.cases.filter(x=>x.reviewStatus==='approved').map(x=>x.caseId)); const caseAssets=manifest.caseAssets.filter(x=>approvedCases.has(x.caseId)); const assetIds=new Set(caseAssets.map(x=>x.assetId)); const caseQuestions=manifest.caseQuestions.filter(x=>approvedCases.has(x.caseId)); const promptIds=new Set(caseQuestions.map(x=>x.questionPromptId)); const cases=manifest.cases.filter(x=>approvedCases.has(x.id)); const topicIds=new Set(); for(const c of cases){topicIds.add(c.primaryTopicId);for(const t of c.secondaryTopicIds??[])topicIds.add(t);} let changed=true;while(changed){changed=false;for(const t of manifest.topics)if(topicIds.has(t.id)&&t.parentTopicId&&!topicIds.has(t.parentTopicId)){topicIds.add(t.parentTopicId);changed=true;}}
  return {version:manifest.version,packageId:manifest.packageId,topics:manifest.topics.filter(x=>topicIds.has(x.id)),cases,assets:manifest.assets.filter(x=>assetIds.has(x.id)),caseAssets,questionPrompts:manifest.questionPrompts.filter(x=>promptIds.has(x.id)),caseQuestions,topicQuestions:[]};
}

export async function validateSelectedMedia(prod,reviewMap,files){
  const errors=[]; const declared=new Set(); const assetMeta=new Map();for(const c of reviewMap.cases)for(const a of c.assets)assetMeta.set(a.assetId,a);
  for(const a of prod.assets){if(a.operation!=='create')continue;if(!a.path||!a.path.startsWith('media/')){errors.push(`Asset ${a.id}: invalid media path.`);continue;}if(declared.has(a.path))errors.push(`Media path declared more than once: ${a.path}.`);declared.add(a.path);const bytes=files.get(a.path);if(!bytes){errors.push(`Asset ${a.id}: missing media ${a.path}.`);continue;}if(bytes.length>PRODUCTION_LIMITS.maxImageBytes)errors.push(`Asset ${a.id}: image exceeds ${PRODUCTION_LIMITS.maxImageBytes}-byte limit.`);const detected=detectImageType(bytes);if(!detected)errors.push(`Asset ${a.id}: unsupported image format.`);else if(detected!==a.mimeType)errors.push(`Asset ${a.id}: MIME mismatch (${a.mimeType} vs ${detected}).`);if(!String(a.altText??'').trim())errors.push(`Asset ${a.id}: alt text is blank.`);const meta=assetMeta.get(a.id);if(!meta)errors.push(`Asset ${a.id}: missing review metadata.`);else{const hash=await sha256Hex(bytes);if(!meta.sha256)errors.push(`Asset ${a.id}: SHA-256 is missing from review metadata.`);else if(hash.toLowerCase()!==meta.sha256.toLowerCase())errors.push(`Asset ${a.id}: SHA-256 mismatch.`);}}
  for(const p of files.keys())if(p.startsWith('media/')&&!declared.has(p)){/* allowed in reviewed bundle; rejected material is pruned */}
  return errors;
}

export async function finalizeBundle(bundle){
  const errors=readinessErrors(bundle.manifest,bundle.reviewMap,bundle.files); const prod=selectProductionManifest(bundle.manifest,bundle.reviewMap); errors.push(...await validateSelectedMedia(prod,bundle.reviewMap,bundle.files)); validateManifestShape(prod);
  const manifestBytes=textEncoder.encode(JSON.stringify(prod,null,2)+'\n'); if(manifestBytes.length>PRODUCTION_LIMITS.maxManifestBytes)errors.push(`Final manifest exceeds ${PRODUCTION_LIMITS.maxManifestBytes}-byte limit.`); const entries=[{path:'manifest.json',bytes:manifestBytes}];for(const a of prod.assets)if(a.operation==='create')entries.push({path:a.path,bytes:bundle.files.get(a.path)});if(entries.length>PRODUCTION_LIMITS.maxArchiveEntries)errors.push(`Final package exceeds ${PRODUCTION_LIMITS.maxArchiveEntries}-entry limit.`);const total=entries.reduce((n,e)=>n+e.bytes.length,0);if(total>PRODUCTION_LIMITS.maxUncompressedBytes)errors.push(`Final package exceeds ${PRODUCTION_LIMITS.maxUncompressedBytes}-byte decompressed limit.`);if(errors.length)throw new ReviewBundleError('Finalization failed.',errors);const zip=writeStoredZip(entries);if(zip.length>PRODUCTION_LIMITS.maxArchiveBytes)throw new ReviewBundleError('Finalization failed.',[`Final package exceeds the current Import Package compressed-size limit (${PRODUCTION_LIMITS.maxArchiveBytes} bytes). Split this review batch into smaller imports.`]);return {zip,manifest:prod};
}

export function exportReviewedBundle(bundle){const entries=[{path:'manifest.json',bytes:textEncoder.encode(JSON.stringify(bundle.manifest,null,2)+'\n')},{path:'review-map.json',bytes:textEncoder.encode(JSON.stringify(bundle.reviewMap,null,2)+'\n')}];for(const [path,bytes]of bundle.files)if(path.startsWith('media/')||path.startsWith('source-previews/'))entries.push({path,bytes});return writeStoredZip(entries);}
