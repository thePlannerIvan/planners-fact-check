# Planners Fact Check

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Contract](https://img.shields.io/badge/contract-fact--audit%2F1.0.0-0f766e)](contracts/fact-audit.schema.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)

**用独立的“冷眼旁观者”检查写好的稿子、PPT 或报告：数字算错了吗？引用的原话断章取义了吗？把 A 品牌的数据安到 B 品牌上了吗？**

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

---

## 一句话看懂：它帮你做什么

文章、PPT 或方案写完准备发出之前，最隐蔽、代价最大的错往往不是文笔不好，而是**事实悄无声息地跑偏了**：

- 引用的百分比被“顺手四舍五入”或者丢了分母；
- 原本只有特定人群或特定年份成立的限定条件，改稿改着改着被删掉了；
- 从原始资料算出来的同比增长、差值自己算错了，或者把竞品 A 的指标张冠李戴给了产品 B。

更关键的是：**让写稿的同一个对话自己查自己往往没用**，因为模型还带着刚写完时的脑补惯性。**Planners Fact Check** 在干净的独立上下文里，只拿「成品 + 原始资料」对照核查，**默认只交出一份“可疑点短清单”**，有未处理的疑点就不放行交付：

```text
写完的文稿 / PPT 文案 + 原始参考资料
  → 1. 抓出会被读者当事实的句子（引用 / 衍生计算 / 方案设定 / 非事实）
  → 2. 独立上下文回读原文核对，计算类数字列出分子分母重算一遍
  → 3. 对照盲区账本（明确哪些资料根本没读到，不瞎写“已验证”）
  → 输出：仅含可疑项的 fact-audit 清单 + 交付放行门（--gate）
```

**所属生态位（质检门）**：在工作流里被 [Planners Proposal](https://github.com/thePlannerIvan/Planners-Proposal-System)、[Planners Bypage](https://github.com/thePlannerIvan/planners-bypage) 和 [Planners PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) 按需唤醒做交付前核查；**也完全支持你随时单独调用**，拿一份成稿和几份参考文件当场揪出事实错误。

---

## 它查什么、不查什么（与别的工具边界）

| 你想检查什么 | 该不该用我 | 核心做法 |
| --- | --- | --- |
| 数字、引用、时间、主体、分母、限定条件有没有写错/算错 | **用我 (`planners-fact-check`)** | 4 类事实分治：`quoted` 回原文核对；`derived` 重算核验；`planned` 标记为未来方案设定；`non_factual` 跳过 |
| 错别字、标点、病句、语感、全网新闻真伪查证 | 改用 [`editor`](https://github.com/thePlannerIvan/editor) | `editor` 管语言校对与红绿修订页；`fact-check` 专攻**手稿相对于给定原始资料**是否漂移 |
| 判断“这套商业策略逻辑到底高不高明” | **不适用** | 我只管“事实忠实”，不管“观点好不好” |

### 它怎么保证不自欺欺人？

1. **读不到绝不硬编**：遇到 PDF、扫描件、旧版 `.xls/.doc` 等难读文件，会先尝试寻找并调用解析/OCR 工具；实在读不到，必须诚实登记进 `blind_spots[]`，明说“这一段没读到，下面结论无法背书”。
2. **绿灯不等于“完全没错”**：`--gate` 放行只说明每条疑点都被人类或修正动作裁定过（没有 `pending` 悬而未决）；若里面还标着 `confirmed`（确认有错），必须先把稿件改掉才能最终交付。

---

## 快速开始与安装

### 1. Codex / Claude Code 用户

```bash
npx skills add https://github.com/thePlannerIvan/planners-fact-check --skill planners-fact-check
```

或克隆到本地 Skill 目录：

```bash
git clone https://github.com/thePlannerIvan/planners-fact-check.git ~/.codex/skills/planners-fact-check
# 或
git clone https://github.com/thePlannerIvan/planners-fact-check.git ~/.claude/skills/planners-fact-check
```

DSH 用户若已安装 `planners-proposal`、`planners-bypage` 或 `planners-ppt-hell`，核查会在相应阶段自动衔接；需要独立使用时在对话中点名 `$planners-fact-check` 即可。

### 2. 直接这样问它

```text
用 $planners-fact-check 核对一下这份方案终稿和文件夹里的几份原始报告：
有没有数字算错、口径偷换、或者引用跟原文对不上的地方？只给我列出可疑点。
```

### 真实依赖

- **环境要求**：Node.js 20+，零第三方包。**不依赖 DSH**，可在任何运行时使用。
- **配套契约**：读取 [`planners-source-index`](https://github.com/thePlannerIvan/planners-source-index) 规范的来源索引文件（了解哪些来源已读、哪些是盲区）。

---

<details>
<summary>开发者说明：命令行用法、目录结构与回归测试（普通用户可忽略）</summary>

### 最小 CLI 工作流

```bash
# 1. 从成品抓出会被读者当事实的条目
node scripts/enumerate-surface.mjs <成品文件> --out work/surface.json

# 2. 在独立上下文里回读成品 + source-index.json + surface.json，产出 work/fact-audit.json

# 3. 交付门检查（存在 pending / confirmed 无说明 / 非人类 accepted_with_caveat 即阻断）
node scripts/validate-fact-audit.mjs work/fact-audit.json --gate
```

### 三家自动调用时点（与 `SKILL.md` 对齐）

- `planners-proposal`：在判断与主线成型阶段按需调用
- `planners-bypage`：在完整逐页稿交付审阅前调用
- `planners-ppt-hell`：在修改了页面实质内容之后调用（仅微调视觉排版时不重复触发）

### 自检与目录结构

```bash
node evals/run.mjs
```

```text
planners-fact-check/
├── SKILL.md
├── GOTCHAS.md
├── contracts/
│   └── fact-audit.schema.json          # 产出契约（fact-audit/1.0.0）
├── scripts/
│   ├── enumerate-surface.mjs           # 枚举事实候选面
│   └── validate-fact-audit.mjs         # 唯一校验器 + --gate 交付门
├── evals/
│   └── run.mjs                         # 漂移样例与干净样例回归测试
└── references/
    └── architecture.md                 # 调用缝与边界说明
```

</details>

---

## 品牌边界、开源协议与商业合作

- **许可协议**：以 [AGPL-3.0-only](LICENSE) 发布，可商业使用，修改版或通过网络提供的服务须公开对应源码。
- **署名边界**：可疑清单默认不写入任何作者品牌字段；开源署名见 [NOTICE](NOTICE)，名称使用边界见 [TRADEMARK.md](TRADEMARK.md)。
- **商业支持**：私有部署、企业审计流定制或闭源授权，请联系 `Lawyif@163.com` 或访问 [demyth.info](https://demyth.info)，详见 [COMMERCIAL.md](COMMERCIAL.md)。

## 相关项目

- [Planners Source Index](https://github.com/thePlannerIvan/planners-source-index) —— 输入端来源索引与盲区账本
- [Planners Bypage](https://github.com/thePlannerIvan/planners-bypage) —— 多源资料 → 逐页 PPT 文案
- [Planners Proposal](https://github.com/thePlannerIvan/Planners-Proposal-System) —— 策略共创与 Storyline 工作台
- [Planners PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) —— 可编辑 PPT 与视频静态画面制作
