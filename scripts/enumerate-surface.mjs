#!/usr/bin/env node
/**
 * 枚举核对地图：从成品里抓出「会被读者当事实的东西」。
 *
 * 用法：node enumerate-surface.mjs <成品> [--out <file>] [--text]
 *
 * 它**只管枚举，不做判断**。宁可多列：漏一个数字的代价是"这条永远没人查"，
 * 多列一个的代价只是模型多看一眼。列表序号（行首的 `1.` `2)`）不算事实，排除。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 数字：抓全部，不挑单位 —— 漏比噪贵
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
// 引号里的原话（中英引号都认）
const QUOTED = /[“"「『]([^”"」』\n]{4,})[”"」』]/g;
// 语气强度词：漂移常发生在这里（"可能"→"会"）
const STRONG = /(全部|全都|所有|一定|必然|唯一|首个|最[高低大快多好强]|从不|绝不|普遍|大多数|多数|主流|几乎|统统|无一|人人|100\s*[%％])/g;
// 方案数字 / 衍生数字的上下文线索（只是线索，裁定权在模型）
const PLANNED = /(预算|排期|目标|计划|预期|KPI|里程碑|投入|承诺)/;
const DERIVED = /(增长|提升|下降|降低|占比|达到|翻[倍番]|同比|环比|增幅|降幅|平均|合计|总共|合计)/;
const LIST_ORDINAL = /^\s*\d+[.、)]\s/;
// 中文数字与成数：八成 / 三成 / 百分之八十 / 十几万 —— 阿拉伯数字之外最常见的一条漏网
const CJK_NUM = /(百分之[一二三四五六七八九十百零]+|[一二三四五六七八九十百千万亿几]+\s*(?:成|分之[一二三四五六七八九十]+|倍|万|亿))/g;

function main() {
  const argv = process.argv.slice(2);
  const text = argv.includes('--text');
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  const file = argv.find(a => !a.startsWith('--') && a !== outPath);
  if (!file) {
    console.error('用法：node enumerate-surface.mjs <成品> [--out <file>] [--text]');
    process.exit(2);
  }
  const abs = resolve(file);
  if (!existsSync(abs)) {
    console.error(`找不到成品：${abs}`);
    process.exit(2);
  }
  const raw = readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const candidates = [];
  let seq = 0;

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (line.trim() === '') return;
    const seen = new Set();
    const push = (surface, matched, classHint) => {
      // 去重键要把引号/空白抹掉：同一个词被两条规则各抓一次时（带引号与不带）应合成一处
      const key = `${lineNo}|${surface.replace(/[「」“”"'【】\[\]\s]/g, '')}`;
      if (seen.has(key)) return;
      seen.add(key);
      seq += 1;
      candidates.push({
        id: `c${seq}`,
        surface,
        location: { line: lineNo },
        matched: [matched],
        class_hint: classHint,
        context: line.trim(),
      });
    };

    // 1. 数字。只跳过**行首那个序号本身**，不跳过同一行里的其它数字
    const ordinal = line.match(LIST_ORDINAL);
    const ordinalEnd = ordinal ? ordinal[0].length : -1;
    for (const m of line.matchAll(NUMBER)) {
      if (ordinalEnd >= 0 && m.index < ordinalEnd) continue;
      // 判 class 要看这个数字**周围**的话，不是整行 —— 整行会让同一行的年份被"同比"污染成 derived
      const win = line.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
      const isYear = /^(19|20)\d{2}$/.test(m[0]);
      const classHint = isYear ? 'quoted'
        : PLANNED.test(win) ? 'planned'
        : DERIVED.test(win) ? 'derived'
        : 'quoted';
      push(m[0], 'number', classHint);
    }
    // 2. 引号里的原话
    for (const m of line.matchAll(QUOTED)) push(m[1], 'quoted-text', 'quoted');
    // 3. 语气强度词
    for (const m of line.matchAll(STRONG)) push(m[1], 'strength', null);
    // 4. 中文数字与成数
    for (const m of line.matchAll(CJK_NUM)) push(m[1], 'cjk-number', PLANNED.test(line) ? 'planned' : DERIVED.test(line) ? 'derived' : 'quoted');
  });

  const report = {
    artifact: { path: abs, sha256: createHash('sha256').update(raw).digest('hex'), lines: lines.length },
    counts: { candidates: candidates.length, with_class: candidates.filter(c => c.class_hint).length },
    candidates,
  };

  if (text) {
    console.log(`${abs}`);
    console.log(`${lines.length} 行，${candidates.length} 个候选`);
    for (const c of candidates) {
      console.log(`  行 ${String(c.location.line).padStart(4)}  [${c.matched[0]}${c.class_hint ? '/' + c.class_hint : ''}]  ${c.surface}`);
    }
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (outPath) {
    writeFileSync(resolve(outPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
    if (text) console.log(`已写入 ${resolve(outPath)}`);
  }
}

main();
