#!/usr/bin/env node
/**
 * 事实核查的回归：枚举不许漏，交付门必须拦得住。
 *
 * 用法：node evals/run.mjs
 *
 * 注意这里能自动验的是**机械**那一半：核对地图漏不漏、门拦不拦得住。
 * 「子代理有没有真的抓到漂移」是语义那一半，靠人工抽查（见 development-plan 的 B2 人工关）。
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ENUM = join(ROOT, 'scripts', 'enumerate-surface.mjs');
const VALIDATE = join(ROOT, 'scripts', 'validate-fact-audit.mjs');
const sha = b => createHash('sha256').update(b).digest('hex');

let failed = 0;
// 断言条数自己数，不靠文档复述（文档复述过的数字已经漂过）。
let assertions = 0;
const ok = m => { assertions++; console.log(`  ✓ ${m}`); };
const bad = m => { failed++; assertions++; console.log(`  ✗ ${m}`); };
const run = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* 非 JSON 输出 */ }
  return { code: r.status, out: parsed, stderr: r.stderr };
};
const codes = r => (r.out?.errors || []).map(e => e.code);

const dir = mkdtempSync(join(tmpdir(), 'factcheck-'));
const tmp = (name, content) => { const p = join(dir, name); writeFileSync(p, content, 'utf8'); return p; };

// ---------- 样例 ----------
const SOURCE_MD = `# 消费者调研

样本 120 人，其中 78 人表示愿意复购。

2024 年销量 1020 台，同比增长 12%。

受访者原话：“价格是我唯一犹豫的地方。”
`;
const CLEAN_MD = `# 复购研究结论

120 位受访者里，78 人表示愿意复购（占 65%）。

2024 年销量 1020 台，同比增长 12%。

一位受访者说：“价格是我唯一犹豫的地方。”
`;
const DRIFT_MD = `# 复购研究结论

1. 样本规模：120 位受访者里，78 人表示愿意复购（占 78%）。

2. 2024 年销量 1200 台，同比增长 12%。

3. 一定会有更多消费者愿意复购。

据调研，八成消费者认为价格是首要问题。
`;

const srcPath = tmp('source.md', SOURCE_MD);
const cleanPath = tmp('clean.md', CLEAN_MD);
const driftPath = tmp('drift.md', DRIFT_MD);
void srcPath;

// 一份来源索引（含一条盲区，用来验「盲区必须带过来」）
const sourceIndex = {
  contract_version: 'source-index/2.0.0',
  source_root: '.',
  index_sha256: null,
  sources: [{
    source_id: 'src-survey',
    origin: { path: 'source.md', sha256: sha(Buffer.from(SOURCE_MD)) },
    kind: 'document',
    role: '消费者调研原始记录',
    audit_layer: { mode: 'source_file', path: null, sha256: null, derived_from_sha256: null, snapshot_sha256: null, method: null, anchor_marks: null },
    coverage: { status: 'partial', scope: '只读了正文，附录未读', reason: null, impact_if_incomplete: '附录里的分渠道数据无法核对', counts: null },
    anchors: [{ kind: 'section', value: '消费者调研' }],
  }],
  blind_spots: [{ source_id: 'src-survey', scope: '附录', reason: '未纳入本轮阅读', impact: '分渠道结论无法核对' }],
};
const srcIdxPath = tmp('source-index.json', JSON.stringify(sourceIndex, null, 2));

const auditFor = (artifactPath, over = {}) => ({
  contract_version: 'fact-audit/1.0.0',
  artifact: { path: artifactPath.split('/').pop(), sha256: sha(readFileSync(artifactPath)) },
  source_index: { path: 'source-index.json', index_sha256: null, read_at: '2026-09-26' },
  checker: 'evals/run.mjs',
  checked_at: '2026-09-26',
  blind_spots: [{ source_id: 'src-survey', scope: '附录', reason: '未纳入本轮阅读', impact: '分渠道结论无法核对' }],
  suspects: [],
  ...over,
});

console.log('事实核查 · 回归');

// ---------- 1. 核对地图不许漏 ----------
console.log('\n[枚举：核对地图不许漏]');
{
  const r = run(ENUM, [driftPath]);
  const surfaces = (r.out?.candidates || []).map(c => c.surface);
  const mustCatch = ['120', '78', '2024', '1200', '12', '八成'];
  const missed = mustCatch.filter(s => !surfaces.includes(s));
  if (r.code === 0 && missed.length === 0) ok(`抓全了 ${mustCatch.length} 个：${mustCatch.join(' / ')}`);
  else bad(`漏了：${JSON.stringify(missed)}（抓到 ${JSON.stringify(surfaces)}）`);

  // 行首序号不是事实
  const ordinals = (r.out?.candidates || []).filter(c => c.matched.includes('number') && c.surface === '1' && /^\s*1\.\s+样本规模/.test(c.context));
  if (ordinals.length === 0) ok('行首列表序号不算事实');
  else bad(`把列表序号当成了事实：${JSON.stringify(ordinals)}`);

  // 干净成品：同样不漏
  const r2 = run(ENUM, [cleanPath]);
  const s2 = (r2.out?.candidates || []).map(c => c.surface);
  const miss2 = ['120', '78', '65', '1020', '12'].filter(x => !s2.includes(x));
  if (miss2.length === 0) ok('干净成品也抓全（120 / 78 / 65 / 1020 / 12）');
  else bad(`干净成品漏了：${JSON.stringify(miss2)}`);
}

// ---------- 2. 交付门 ----------
console.log('\n[交付门：必须拦得住]');
{
  const p = tmp('a-pending.json', JSON.stringify(auditFor(driftPath, {
    suspects: [{ id: 's1', surface: '占 78%', kind: 'miscalc', class: 'derived', verdict: 'pending' }],
  }), null, 2));
  const r = run(VALIDATE, [p, '--gate']);
  if (r.code !== 0 && codes(r).includes('pending_verdict')) ok('未裁定 → pending_verdict');
  else bad(`未裁定没拦住：${JSON.stringify(codes(r))}`);

  const rDraft = run(VALIDATE, [p]);
  if (rDraft.code === 0) ok('草稿模式允许未裁定（只有警告）');
  else bad(`草稿模式不该拦：${JSON.stringify(codes(rDraft))}`);

  const p2 = tmp('a-nonote.json', JSON.stringify(auditFor(driftPath, {
    suspects: [{ id: 's1', surface: '1200 台', kind: 'drifting', class: 'quoted', verdict: 'confirmed' }],
  }), null, 2));
  const r2 = run(VALIDATE, [p2, '--gate']);
  if (r2.code !== 0 && codes(r2).includes('confirmed_without_note')) ok('判为要改却没写改什么 → confirmed_without_note');
  else bad(`没写 note 没拦住：${JSON.stringify(codes(r2))}`);

  const p3 = tmp('a-caveat.json', JSON.stringify(auditFor(driftPath, {
    suspects: [{ id: 's1', surface: '八成消费者', kind: 'unsourced', class: 'quoted', verdict: 'accepted_with_caveat', note: '待补来源', decided_by: 'agent' }],
  }), null, 2));
  const r3 = run(VALIDATE, [p3, '--gate']);
  if (r3.code !== 0 && codes(r3).includes('caveat_not_human')) ok('机器替人接受带保留的事实 → caveat_not_human');
  else bad(`机器代替人接受没拦住：${JSON.stringify(codes(r3))}`);

  const p4 = tmp('a-ok.json', JSON.stringify(auditFor(driftPath, {
    suspects: [
      { id: 's1', surface: '占 78%', kind: 'miscalc', class: 'derived', verdict: 'confirmed', note: '改成 65%（78/120）', decided_by: 'agent',
        check: { numerator: '78', denominator: '120', recomputed: '65%', agrees: false } },
      { id: 's2', surface: '八成消费者', kind: 'unsourced', class: 'quoted', verdict: 'accepted_with_caveat', note: '作者同意保留，但要求补来源', decided_by: 'human' },
    ],
  }), null, 2));
  const r4 = run(VALIDATE, [p4, '--gate']);
  if (r4.code === 0) ok('全部裁定过 → 放行');
  else bad(`该放行却没放行：${JSON.stringify(codes(r4))} ${JSON.stringify(r4.out?.errors)}`);
}

// ---------- 3. 一致性与盲区 ----------
console.log('\n[一致性与盲区]');
{
  const auditPath = tmp('a-stale.json', JSON.stringify(auditFor(cleanPath, { suspects: [] }), null, 2));
  writeFileSync(cleanPath, CLEAN_MD + '\n改了一行。', 'utf8');   // 核查之后成品被改
  const r = run(VALIDATE, [auditPath, '--gate']);
  if (r.code !== 0 && codes(r).includes('artifact_changed')) ok('成品在核查之后被改过 → artifact_changed');
  else bad(`成品改动没被拦住：${JSON.stringify(codes(r))}`);

  const a2 = tmp('a-noblind.json', JSON.stringify(auditFor(cleanPath, { suspects: [], blind_spots: [] }), null, 2));
  const r2 = run(VALIDATE, [a2, '--gate']);
  if (r2.code !== 0 && codes(r2).includes('blind_spot_not_carried')) ok('来源索引的盲区没抄过来 → blind_spot_not_carried');
  else bad(`盲区丢失没被拦住：${JSON.stringify(codes(r2))}`);
}

console.log('\n[续检接口]');
{
  const datePath = tmp('date.md', '研究于2025年发布。\n');
  const map = run(ENUM, [datePath]);
  if (map.out?.candidates.find(c => c.surface === '2025')?.class_hint === 'quoted') ok('事实年份不排除为非事实');
  else bad('事实年份被误排除');
  for (const [field, code] of [['artifact', 'artifact_absent'], ['source_index', 'source_index_absent']]) {
    const document = auditFor(datePath);
    document[field].path = 'missing-file';
    const result = run(VALIDATE, [tmp(`missing-${field}.json`, JSON.stringify(document)), '--gate']);
    if (result.code !== 0 && codes(result).includes(code)) ok(`${field} 缺失不能通过交付门`);
    else bad(`${field} 缺失被放过`);
  }
  const changedBlind = auditFor(datePath);
  changedBlind.blind_spots[0].source_id = 'src-other';
  changedBlind.blind_spots[0].impact = '不同影响';
  const result = run(VALIDATE, [tmp('changed-blind.json', JSON.stringify(changedBlind)), '--gate']);
  if (result.code !== 0 && codes(result).includes('blind_spot_not_carried')) ok('盲区来源身份与影响必须保留');
  else bad('相同范围掩盖了盲区来源变化');
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${assertions} 条断言，${failed} 条失败` : `\n全部通过（${assertions} 条断言）`);
process.exit(failed ? 1 : 0);
