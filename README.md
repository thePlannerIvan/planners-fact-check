# Planners Fact Check

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Contract](https://img.shields.io/badge/contract-fact--audit%2F1.0.0-0f766e)](contracts/fact-audit.schema.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![Runtime](https://img.shields.io/badge/runtime-plain%20Node-6b7280)](references/architecture.md)

事实核查：拿一份成品和它的原始资料，用**最小的代价**回答两件事 —— 成品相对来源**漂移**了吗，加工过程**算错写错**了吗。输出只有可疑项的短清单，**默认通过**；有未裁定的疑点就不许交付。

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

## 它解决什么

成品写完到交付之间，最容易静默出错的不是文笔，而是事实位移：数字被改、限定条件掉了、分母没了、原话被转述却不标注、结论被悄悄加强；或者加工过程本身出错 —— 算错、主体／时间／单位错配、把 A 的数据安到 B 头上。

它**不产出内容**，也**不判断「这个解释成不成立」** —— 那是 claim 审计的事。界线很清楚：**claim 审计问解释，事实核查问事实。**

## 核心工作流

最小代价只要三样，多一样都不要：

1. **能读的来源** —— 读不到就查不了，所以先看 `source-index` 的 `blind_spots[]`，把「没读到的部分」摊在明面上；
2. **一份核对地图** —— 成品里哪些东西会被读者当事实（不是逐数字建账）；
3. **一道不许悄悄放过的门** —— 有未裁定的疑点，就不许交付。

```bash
# 1. 枚举核对地图（从成品里抓出会被当事实的东西）
node scripts/enumerate-surface.mjs <成品> --out work/surface.json

# 2. 模型／子代理对照：读成品 + 来源索引 + surface.json，逐条给裁定
#    写 work/fact-audit.json（契约见 contracts/fact-audit.schema.json）

# 3. 门：未裁定就不许交付
node scripts/validate-fact-audit.mjs work/fact-audit.json --gate
```

三类事实分开，只为裁定方式不同：`quoted` 引用来的**回原文比对**（语义一致即可）；`derived` 算出来的**把分子／分母／口径写出来重算一遍**；`planned` 方案数字不核真伪，只登记「这是方案设定」；`non_factual`（列表序号、页码、型号）不算事实。

**读不到就去把能力找来 —— 不要停在「无法核实」。** 来源是 PDF、扫描件、加密表格或旧版 Office 格式时，允许并且要求你自己去找、去装能完成这一步的工具（`pip install pypdf`、`brew install poppler`、系统自带能力…），并写下用什么方法读的。只有在真的试过仍读不到时才登记成盲区，而且要点名试过什么。

**强制力从哪来（唯一不能省的设计）**：核查必须由**独立上下文**跑 —— 只看「成品 + 来源」，**不看作者的推理过程**。模型自查等于没查。

## 适合 / 不适合

适合：

- 一份写完的稿子／方案／报告，要交付前过一道事实关；
- 数字、引用、表格、衍生公式需要回到来源核对；
- 需要一份**只有可疑项**的短清单，而不是几百条全量确认；
- 作为别的 Skill 的交付前门（独立上下文子代理调用）。

不适合：

- 想让它判断解释、论证或叙事是否成立（那是 claim 审计）；
- 想让它逐数字建账、逐条独立归属核对 —— 长上下文能整段对照后，逐条确认的边际收益远小于成本；
- 来源完全读不到、也不允许装抽取工具 —— 那只能得到一份盲区清单，得不到核查结论。

## 安装

通用 Skills CLI：

```bash
npx skills add https://github.com/thePlannerIvan/planners-fact-check --skill planners-fact-check
```

也可直接放入 Codex 或 Claude 的 Skill 目录：

```bash
git clone https://github.com/thePlannerIvan/planners-fact-check.git ~/.codex/skills/planners-fact-check
# 或
git clone https://github.com/thePlannerIvan/planners-fact-check.git ~/.claude/skills/planners-fact-check
```

环境要求：**Node.js 20+**，零第三方依赖。**不依赖 DSH** —— 它是普通 CLI；子代理只是「谁来跑它」的实现细节，不影响结果对不对。

```bash
node evals/run.mjs   # 1 组枚举 + 4 条门 + 2 条一致性
```

## 典型 prompt

可以由用户直接用：

```text
查一下这份稿和资料对不对。
核对一下这些数字。
有没有跟原始数据跑偏？
```

也可以被 `planners-bypage`、`planners-proposal-system`、`planners-quali-box`、`planners-quanti-box` 以子代理形式在**独立上下文**里调用。

## 交付门怎么读

**门只回答「都裁定过」，不回答「没问题」。** `--gate` 放行 = 没有 `pending`；如果输出里还有 `confirmed`，那些是**待改项** —— 改完才算可交付。不要把「放行」读成「这份稿没问题」。

`--gate` 在这几种情况下 FAIL：有 `verdict: pending` 的疑点；`verdict: confirmed` 却没写 `note`；`verdict: accepted_with_caveat` 但不是人裁定的（`decided_by` 必须是 `human`）。

## 目录结构

```text
planners-fact-check/
├── SKILL.md
├── GOTCHAS.md
├── contracts/
│   └── fact-audit.schema.json          # 产出契约（fact-audit/1.0.0）
├── scripts/
│   ├── enumerate-surface.mjs           # 从成品枚举「会被当事实的东西」
│   └── validate-fact-audit.mjs         # 唯一校验器 + 交付门
├── evals/
│   └── run.mjs                         # 漂移样例（改数字／去分母／加强结论／无来源）与干净样例
└── references/
    └── architecture.md                 # module 表、缝、与 claim 审计的边界
```

## 品牌与署名边界

来源信息可出现在 Skill 文档、流程 HTML、审阅页面、验证页面和开发者工作面中；**不默认写入最终客户交付物**。疑点清单本身是工作产物，默认不带任何作者品牌字段。

`Planners Fact Check` 与 `阿祖不看 TVC` 用于标识本项目及其来源。开源许可证授予代码使用权，不自动授予项目名或作者名的商标使用权。修改版请标注 fork，不要暗示作者背书。详见 [TRADEMARK.md](TRADEMARK.md)。

## 开源协议和商业入口

本项目以 **AGPL-3.0** 发布 —— 可以商业使用；修改版与通过网络提供的服务需公开对应源码。若需要闭源授权、私有部署、企业事实审计流程定制或私有增强模块：

- Email：`Lawyif@163.com`
- Website：[demyth.info](https://demyth.info)

详见 [COMMERCIAL.md](COMMERCIAL.md) · 归属声明见 [NOTICE](NOTICE)。

## 相关项目

- [Planners Source Index](https://github.com/thePlannerIvan/planners-source-index) —— 本模组的输入契约，按 `anchors[]` 回源
- [Planners Review Core](https://github.com/thePlannerIvan/planners-review-core) —— 人工审阅的公共接缝
- [Planners Bypage](https://github.com/thePlannerIvan/planners-bypage) —— 多源资料 → 逐页 PPT 内容包
