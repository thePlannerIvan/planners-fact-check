#!/usr/bin/env node
/**
 * 事实核查的唯一校验器 + 交付门。
 *
 * 用法：
 *   node validate-fact-audit.mjs <fact-audit.json> [--gate] [--text]
 *
 * 两种模式：
 *   默认       只做结构与一致性检查（写草稿时用，允许 pending）
 *   --gate     交付门：任何未裁定／没写清／机器替人接受的疑点都不放行
 *
 * 注：这里那段通用结构校验器与 planners-source-index 里的是同一套写法。
 *     出现第三个消费者时抽成公共件（见 GOTCHAS）。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '..', 'contracts', 'fact-audit.schema.json');

const errors = [];
const warnings = [];
const err = (code, message) => errors.push({ code, message });
const warn = (code, message) => warnings.push({ code, message });

const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const typeMatches = (v, t) =>
  t === 'integer' ? typeof v === 'number' && Number.isInteger(v)
  : t === 'number' ? typeof v === 'number'
  : typeOf(v) === t;
const sha256File = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const isBlank = v => typeof v !== 'string' || v.trim() === '';

// ---------- 1. 结构校验（对着 schema 跑） ----------
function validateNode(node, schema, path) {
  if (schema.const !== undefined && node !== schema.const) err('const', `${path} 必须是 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(node)) err('enum', `${path} 取值 ${JSON.stringify(node)} 不在 ${JSON.stringify(schema.enum)}`);
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : null;
  if (types && !types.some(t => typeMatches(node, t))) {
    err('type', `${path} 应为 ${types.join('|')}，实际是 ${typeOf(node)}`);
    return;
  }
  if (typeof node === 'string') {
    if (schema.minLength !== undefined && node.length < schema.minLength) err('minLength', `${path} 长度不足 ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(node)) err('pattern', `${path} 不匹配 ${schema.pattern}`);
  }
  if (Array.isArray(node)) {
    if (schema.minItems !== undefined && node.length < schema.minItems) err('minItems', `${path} 至少 ${schema.minItems} 项`);
    if (schema.items) node.forEach((v, i) => validateNode(v, schema.items, `${path}[${i}]`));
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const r of schema.required || []) if (!(r in node)) err('required', `${path} 缺少必填字段 ${r}`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false)
      for (const k of Object.keys(node)) if (!(k in props)) err('additionalProperties', `${path} 出现未定义字段 ${k}`);
    for (const [k, s] of Object.entries(props)) if (k in node) validateNode(node[k], s, `${path}.${k}`);
  }
}

// ---------- 2. 一致性与交付门 ----------
function checkConsistency(doc, auditDir, gate) {
  // 成品改了没有
  const artifactPath = resolve(auditDir, doc.artifact.path);
  if (existsSync(artifactPath)) {
    if (sha256File(artifactPath) !== doc.artifact.sha256)
      err('artifact_changed', `成品在核查之后被改过：${doc.artifact.path} —— 这份核查结论不适用于它现在的样子`);
  } else {
    (gate ? err : warn)('artifact_absent', `成品不在磁盘上：${doc.artifact.path}`);
  }

  // 盲区必须原样带过来
  const srcPath = resolve(auditDir, doc.source_index.path);
  if (existsSync(srcPath)) {
    try {
      const src = JSON.parse(readFileSync(srcPath, 'utf8'));
      if (!['source-index/2.1.0', 'source-index/2.0.0'].includes(src.contract_version) || !Array.isArray(src.sources)) {
        err('source_index_invalid', '来源索引必须为 source-index/2.1.0（或兼容 2.0.0）且包含 sources');
      }
      if (doc.source_index.index_sha256 && src.index_sha256 !== doc.source_index.index_sha256) {
        err('source_index_changed', '来源索引版本已变化，需要续检');
      }
      const identity = b => JSON.stringify([b.source_id ?? null, b.scope, b.reason, b.impact]);
      const expected = (src.blind_spots || []).map(identity);
      const got = new Set((doc.blind_spots || []).map(identity));
      for (const key of expected) {
        if (!got.has(key)) {
          const [, scope] = JSON.parse(key);
          err('blind_spot_not_carried', `来源索引里的盲区没有抄进本次核查：${scope} —— 下游会把它当全量`);
        }
      }
    } catch (e) {
      (gate ? err : warn)('source_index_unreadable', `来源索引读不了（${e.message}）：${doc.source_index.path}`);
    }
  } else {
    (gate ? err : warn)('source_index_absent', `来源索引不在磁盘上：${doc.source_index.path}`);
  }
}

function checkGate(doc) {
  (doc.suspects || []).forEach((s, i) => {
    const where = `suspects[${i}](${s.id})`;
    if (s.verdict === 'pending') err('pending_verdict', `${where} 还没裁定：${s.surface}`);
    if (s.verdict === 'confirmed' && isBlank(s.note)) err('confirmed_without_note', `${where} 判为要改，但没写改什么`);
    if (s.verdict === 'accepted_with_caveat' && s.decided_by !== 'human')
      err('caveat_not_human', `${where} 带保留地接受必须由人裁定（decided_by=${s.decided_by ?? 'null'}）`);
    if (s.verdict === 'accepted_with_caveat' && isBlank(s.note))
      err('caveat_without_note', `${where} 缺少用户接受边界的理由`);
    if (s.verdict === 'confirmed' && !s.evidence && s.class !== 'planned' && s.class !== 'non_factual')
      warn('confirmed_without_evidence', `${where} 判为要改，但没有指向来源证据`);
    if (s.class === 'derived' && !s.check) warn('derived_without_check', `${where} 是算出来的，但没把分子/分母/口径摊开`);
  });
}

// ---------- 主流程 ----------
function main() {
  const argv = process.argv.slice(2);
  const text = argv.includes('--text');
  const gate = argv.includes('--gate');
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('用法：node validate-fact-audit.mjs <fact-audit.json> [--gate] [--text]');
    process.exit(2);
  }
  const abs = resolve(file);
  if (!existsSync(abs)) {
    console.error(`找不到文件：${abs}`);
    process.exit(2);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`不是合法 JSON：${e.message}`);
    process.exit(2);
  }
  validateNode(doc, JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')), '$');
  if (errors.length) return finish(text, gate, doc);

  checkConsistency(doc, dirname(abs), gate);
  if (gate) checkGate(doc);
  else {
    const pending = (doc.suspects || []).filter(s => s.verdict === 'pending').length;
    if (pending) warn('pending_in_draft', `草稿里还有 ${pending} 条未裁定（--gate 时会拦）`);
  }
  return finish(text, gate, doc);
}

function finish(text, gate, doc) {
  const fatal = errors.length > 0;
  if (text) {
    for (const w of warnings) console.log(`WARN  [${w.code}] ${w.message}`);
    for (const e of errors) console.log(`ERROR [${e.code}] ${e.message}`);
    const n = (doc.suspects || []).length;
    const toFix = (doc.suspects || []).filter(s => s.verdict === 'confirmed').length;
    const tail = `共 ${n} 条疑点` + (gate && toFix ? `；其中 **${toFix} 条判为要改** —— 改完才是可交付` : '');
    console.log(fatal
      ? `\n${gate ? '交付门不放行' : '不合规'}：${errors.length} 个错误、${warnings.length} 个警告（${tail}）`
      : `\n${gate ? '交付门放行（都裁定过，不等于没问题）' : '合规'}：${warnings.length} 个警告（${tail}）`);
  } else {
    console.log(JSON.stringify({ valid: !fatal, gate, errors, warnings,
      suspects: (doc.suspects || []).length,
      confirmed: (doc.suspects || []).filter(s => s.verdict === 'confirmed').length }, null, 2));
  }
  process.exit(fatal ? 1 : 0);
}

main();
