# 🍄 MycoGuard — Mushroom Safety Assistant

**Offline-first, uncertainty-quantified mushroom risk assessment.**

MycoGuard is a production-style, open-source project that turns a course-work
mushroom classifier into a multi-modal safety assistant:

- a **fully offline rule engine** (distilled from the UCI Mushrooms dataset via
  Random Forest analysis) that grades risk into **low / medium / high /
  unknown** — never "edible" / "poisonous";
- **confidence intervals** instead of single-point scores (calibrated to never
  claim certainty, capped at 97%);
- a **photo identification mode** (Qwen-VL, proxied through a tiny FastAPI
  backend) that fills in visual trait observations — and degrades gracefully
  to pure-offline mode when the backend is unavailable;
- a small **safety-knowledge Q&A** (curated public-commonsense entries,
  keyword retrieval, optional DeepSeek fluency enhancement);
- a **prominent disclaimer** on every result page: *for reference only, not
  dietary advice*.

> ⚠️ **DISCLAIMER**: MycoGuard is an educational/engineering project. Its
> output is a statistical risk *indication*, never an identification or
> edibility verdict. Never eat a wild mushroom based on this tool. Consult a
> mycologist or a professional institution.

---

## Why it exists

Wild-mushroom poisoning is a real public-health problem (thousands of cases
and dozens of deaths every year in China alone). Most apps over-claim: a
photo + a confident "safe to eat" verdict is how people get hurt. MycoGuard
takes the opposite stance — **quantify the uncertainty, state the risk level,
and never claim certainty**. The original course project already had a solid
offline rule engine + real-time SVG morphology rendering; this rewrite adds
multi-modal photo analysis, proper uncertainty quantification, a compliant
risk language, a proxy backend, tests, and documentation, so the result is
something you could actually put on GitHub.

---

## Features

| Capability | Where | Notes |
|---|---|---|
| 22-trait manual selector | `src/` frontend | core + advanced groups |
| Real-time SVG morphology renderer | `src/components/MushroomCanvas.tsx` | v4 product-illustration: gradients, lighting, per-trait textures (scales/grooves/fibres/gloss), ring & volva structures, 400 ms morph animation |
| Offline rule engine | `src/engine/mushroomEngine.ts` | weights distilled from UCI data |
| Uncertainty grading | engine | low / medium / high / **unknown** (forced when input < 3 traits) |
| Confidence **interval** | engine + UI | `(0, 0.97]`, never 100% |
| Photo identification | `app/` FastAPI → qwen-vl-plus | base64 proxied; keys never in the browser |
| Photo flow UX | frontend | live stages (preparing → analyzing → traits extracted), **"vision" badges** on vision-derived traits, dual-channel pipeline strip, bundled **sample photos** (`samples/`, try without a camera) |
| Offline-first degradation | `src/services/backend.ts` + `/api/health` | manual analysis works with no backend; photo/chat degrade to a clear message |
| Safety-knowledge chat | `app/services/chat.py` | rule-first, optional DeepSeek |
| Tests | vitest (98) + pytest (43) | see [Testing](#testing) |
| Secret hygiene | `scripts/scan_secrets.py` | pre-commit scan; `.env` never committed |

---

## Screenshots

![Manual trait mode with the v4 illustrated SVG renderer](docs/screenshots/screenshot-1-landing.png)
![High-risk result: confidence interval, rule hits, offline expert narrative, disclaimer](docs/screenshots/screenshot-2-high-risk-result.png)
![Photo identification mode with sample-photo entry](docs/screenshots/screenshot-3-photo-mode.png)
![Bundled sample photo loaded into the photo mode](docs/screenshots/screenshot-4-photo-sample.png)

Regenerate with `node scripts/capture_screenshots.mjs` (needs the backend
running and `npm i -D playwright`; uses your installed Edge/Chrome).

---

## Architecture

```
┌─────────────────────────────── Browser (React 19 + TS + Vite) ───────────────────────────────┐
│  Trait selectors ──► SVG renderer ◄── vision traits (gap-filling)                            │
│        │                              ▲                                                      │
│        ▼                              │ evaluateVision(manual ∪ vision)                     │
│  Offline rule engine (risk + confidence interval)  ── same engine for both modes             │
│        │                                                                                     │
│        └──► services/backend.ts  (probe /api/health, upload, chat)  ◄── offline fallback     │
└───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                │ HTTP (no credentials in JS)
┌───────────────▼─────────────────────────── FastAPI proxy (app/) ─────────────────────────────┐
│  GET  /api/health    → {vision, chat} capability probe                                       │
│  POST /api/analyze   → validate + downscale image → qwen-vl-plus (OpenAI-compat) → sanitize  │
│  POST /api/chat      → KB keyword retrieval → optional DeepSeek grounding                    │
│  Keys: env vars or parent projects/.env (BOM-safe parser, redacted repr)                     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Offline-first**: the rule engine, SVG renderer, trait selectors, and the
entire analysis UI work with **zero backend** — a fully static page. The
backend only adds photo identification and the safety-knowledge chat; the
chat's "rule mode" (backend running **without** a `DEEPSEEK_API_KEY`) answers
directly from the built-in knowledge base without any LLM call.

---

## Quick start

### 1. Offline mode (frontend only — no keys, no backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

Use the **性状鉴定 (manual traits)** tab. Pick ≥ 3 traits and click
**开始分析**. The status badge shows *纯离线模式 · 规则引擎*.

> Note: manual trait analysis and the SVG renderer work fully offline.
> The **knowledge chat needs the FastAPI backend** (it calls `/api/chat`);
> with the backend down it shows a friendly error. Photo identification needs
> the backend too (see step 2).

### 2. Full stack (photo identification + AI chat)

```bash
# Backend
python -m venv .venv
.venv\Scripts\activate           # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt  # full toolchain (backend + analysis + tests)
# provide keys via env vars or the parent projects/.env (never committed):
#   DASHSCOPE_API_KEY, DEEPSEEK_API_KEY
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# Frontend (second terminal)
npm install
npm run dev           # vite proxies /api → http://127.0.0.1:8000
```

Production-style single server: `npm run build` then the backend serves the
built `dist/` at `http://localhost:8000`.

---

## API reference

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| `GET` | `/api/health` | — | `{status, version, vision, chat}` |
| `POST` | `/api/analyze` | multipart `file` (jpeg/png/webp ≤ 8 MB) | `{status, species_guess, confidence, traits, notes, warnings}` |
| `POST` | `/api/chat` | `{"question": "..."}` | `{answer, mode: rule\|llm\|fallback, source?, matched}` |

Errors: `413` too large · `415` not an image · `503` vision not configured
(offline) · `502` upstream LLM failure.

---

## Uncertainty quantification (how the engine thinks)

1. **Four-tier risk language.** Every verdict is one of
   `low / medium / high / unknown`. The words "edible" / "poisonous" never
   appear in engine output (unit-tested).
2. **Forced unknown.** Fewer than **3** traits — or 3+ traits with **no
   discriminative power** — forces `unknown` with a low-confidence interval,
   even if a dangerous signal was observed. Insufficient evidence *is* a
   safety signal.
3. **Confidence interval.** Confidence = `base(0.40) + richness(0.30·n/22) +
   logic-certainty(0.22·min(1,|Δscore|/8))`, clamped to `(0, 0.97]`; interval
   width shrinks as evidence accumulates; critical signals raise the floor
   to 0.80 but never to certainty.
4. **Explainability.** Every verdict lists the rules that fired, with
   severity (`info / warning / critical`) and plain-language details, plus a
   deterministic **offline expert narrative** (no API needed) that names the
   observed traits and signals — a strict upgrade of the old Gemini call.
5. **Statistical grounding (real numbers).** Weights v2 come from running
   `scripts/analyze_dataset.py` on the actual 8,124-row UCI dataset
   (`distilled_rules.json` is committed):
   - Random Forest held-out accuracy **100.00%** (test n=1625) — an honest
     property of this *teaching* dataset, not a claim about field capability.
   - Gini importance top-5: `odor 0.161 · gill-color 0.112 · gill-size 0.111 ·
     spore-print-color 0.093 · ring-type 0.070`.
   - 100%-purity branches: odors `c f m p s y` → poisonous (n=36…2160) and
     `a l` → edible (n=400 each); spore-print `r` → poisonous (n=72);
     gill-color `b` → poisonous (n=1728) / `e o` → edible; ring-type `l` →
     poisonous (n=1296); population `a n` → edible (n=384/400); stalk-root
     `r` → edible (n=192) — each mirrored as a rule with its support count.
   - Fixes found by the data: `gill-color` and `ring-type` were top-5 traits
     but had **zero weight** in the original engine; both now contribute.
   These are **dataset associations, not biological laws**.
6. **Dual-channel confidence fusion (photo mode).** The vision model's
   self-reported confidence is treated as the *visual channel's reliability*
   and fused into the final interval:
   `point' = 0.65·engine + 0.35·model`; agreement
   `|engine.point − model|` `< 0.12 → agree (interval ×0.85)`,
   `0.12–0.30 → partial (×1.0)`, `> 0.30 → disagree (×1.2)`; a confident
   model can never rescue an "unknown" verdict. The result page shows a
   consistency chip (`一致 / 部分一致 / 存在分歧 / 未提供有效信息`).
7. **One-click example scenarios.** Five teaching presets (大青褶伞 → high,
   鸡油菌形态 → low, 毒蝇伞外观 → unknown, 混合信号 → medium, 信息不足 → unknown)
   fill the trait form in one click — no 22-dropdown barrier for demos.

### Risk levels

| Level | Meaning | Guidance flavor |
|---|---|---|
| `low` | observed traits statistically lean safe | still *not* a dietary recommendation |
| `medium` | mixed / conflicting signals | add key traits or ask an expert |
| `high` | strong risk signals fired | do **not** eat; treat as worst case |
| `unknown` | insufficient evidence | do **not** eat; gather more data |

---

## Testing

```bash
npx vitest run          # frontend (98 tests): engine grading, forced-unknown,
                        # confidence intervals, data-grounded rules, scenarios,
                        # confidence fusion, expert narrative, no-absolute-
                        # language, disclaimer presence, constants integrity,
                        # backend client (mocked fetch), presentation helpers
.venv\Scripts\python -m pytest app/tests -q
                        # backend (40 tests): settings/BOM parsing, KB retrieval,
                        # chat rule/llm/fallback, vision parse+sanitize, API
                        # layer with injected fakes (no network)
.venv\Scripts\python scripts/scan_secrets.py   # pre-commit credential scan
```

All LLM calls in tests are mocked (httpx `MockTransport` / injected fakes) —
the suite runs offline and costs nothing.

---

## Project structure

```
mycoguard/
├── app/                      # FastAPI proxy backend
│   ├── main.py               # routes: /api/health /api/analyze /api/chat
│   ├── config.py             # env / parent-.env loading, redacted repr
│   ├── services/
│   │   ├── llm_client.py     # OpenAI-compatible client (transport-injectable)
│   │   ├── vision.py         # image prep + qwen-vl-plus parse/sanitize
│   │   ├── knowledge.py      # keyword retrieval over curated KB
│   │   └── chat.py           # rule-first answer, optional LLM grounding
│   ├── knowledge/entries.py  # 26 curated public-commonsense entries
│   └── tests/                # pytest (40 tests)
├── src/                      # React 19 + TS + Vite frontend
│   ├── engine/               # mushroomEngine.ts, merge.ts (fusion),
│   │                         # scenarios.ts, expert.ts, presentation.ts
│   ├── services/backend.ts   # health probe, upload, chat (offline-safe)
│   ├── components/           # canvas, trait panel, scenario chips, photo
│   │                         # capture, result, chat, disclaimer, icons
│   ├── styles/global.css     # light design system (mobile-ready)
│   └── __tests__/            # vitest (98 tests)
├── samples/                  # bundled demo photos for the "试用样例" button
├── scripts/
│   ├── analyze_dataset.py    # UCI RF distillation (evidence script)
│   └── scan_secrets.py       # pre-commit secret scanner
├── distilled_rules.json      # generated evidence (committed)
├── .env.example  ·  LICENSE (MIT)  ·  README.md
```

---

## Credits & data sources

- **Dataset**: [UCI Machine Learning Repository — Mushroom
  (agaricus-lepiota)](https://archive.ics.uci.edu/dataset/73/secondary+mushroom+dataset),
  8,124 samples; the Random Forest distillation idea and the original course
  project it upgrades belong to the author.
- **Rule weights**: derived by `scripts/analyze_dataset.py` (RF feature
  importances + 100%-purity branch scan).
- **Knowledge base**: curated from public commonsense guidance — 中国疾控中心
  (China CDC) mushroom-poisoning prevention material, US CDC, North American
  Mycological Association (NAMA), and Wikipedia. Educational summaries only;
  per-entry sources are recorded in `app/knowledge/entries.py`.
- **Models**: [Qwen-VL](https://github.com/QwenLM/Qwen2.5-VL) (阿里云百炼,
  vision) and [DeepSeek](https://github.com/deepseek-ai/DeepSeek-V3) (chat
  fluency), both consumed via OpenAI-compatible endpoints. Keys stay server-side.

---

## 中文摘要

**MycoGuard 蘑菇安全识别助手**：把课程作业（UCI 蘑菇数据集的随机森林分类器）
升级为多模态安全助手。

- **离线优先**：22 性状选择器 + SVG 实时形态渲染 + 规则引擎纯前端离线可用；
  后端只是可选的"在线增强"。
- **不确定性量化**：风险分级为 **低 / 中 / 高 / 无法判断**，置信度以**区间**
  展示且永不超过 97%；输入不足 3 项性状时强制「无法判断」。全站与结果页均有
  **免责横幅**（仅供参考，不构成食用建议）。
- **拍照识别**：上传照片 → FastAPI 代理 → **qwen-vl-plus**（OpenAI 兼容格式，
  密钥只留在后端）；后端不可用时自动降级为纯离线模式。
- **安全知识问答**：内置 26 条精编常识知识库（来源逐条标注），关键词检索 +
  可选 DeepSeek 润色，控制规模不做完整 RAG。
- **合规**：删除 Gemini 依赖与"准确率 100%"等绝对化表述；`.env` 不入库；
  `scripts/scan_secrets.py` 提交前扫描密钥；TechSpec/README 已重写为合规版本。
- **数据背书**：`scripts/analyze_dataset.py` 已在真实 UCI 数据集（8,124 行）上
  跑通并提交 `distilled_rules.json`（留出集准确率 100.00%、Gini 重要性、100%
  纯度分支）；引擎权重 v2 按真实数据校准（修复了原引擎 gill-color / ring-type
  零权重缺口）。
- **易用性**：5 个一键示例场景（大青褶伞→高、鸡油菌形态→低、毒蝇伞外观→无法
  判断、混合信号→中、信息不足→无法判断）；拍照模式置信度融合（视觉 model
  confidence 参与最终区间 + 双通道一致性指示）；离线结果页提供确定性"专家解读"
  （严格不弱于原版 Gemini 解释文本）。
- **演示强化（v4）**：SVG 蘑菇渲染升级为"产品级插画"（径向/线性渐变光影、菌盖
  鳞片/凹槽/纤维/高光纹理、菌环与菌托结构、性状变化 400ms 过渡动画）；拍照识别
  展示完整过程状态（上传中 → 视觉分析中 → 性状已提取）、表单"vision"徽章标记
  视觉来源性状、结果页"视觉 → 性状 → 规则引擎 → 融合置信度"双通道链路图；
  `samples/` 内置样例照片，"试用样例"一键体验（无需相机）。
- **测试**：vitest 98 项 + pytest 43 项（LLM 全部 mock，离线可跑）。

**快速开始**：`npm install && npm run dev`（纯离线）；后端
`pip install -r app/requirements.txt && uvicorn app.main:app --port 8000`，
配好 `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` 即启用拍照识别与 AI 问答。

---

## Known limitations

- **Dataset bias.** The UCI Mushrooms dataset is a curated teaching set
  (poisonous/edible roughly balanced) — it does **not** reflect real-world
  species distributions or local flora. The 100.00% held-out accuracy is a
  property of that easy dataset, not a field-identification guarantee.
- **Weights encode dataset statistics, not mycology.** Rules like "buff gill
  color → high risk" come from purity branches in this dataset; a real
  mushroom may differ. Every verdict is a statistical prior, not evidence.
- **Vision is observational, not forensic.** qwen-vl-plus reports only what
  it can see; it cannot reliably distinguish look-alike species, and a bad
  photo yields `unknown` (by design).
- **No field validation.** The distilled weights were not re-validated on
  independent field samples.
- **KB is educational-scale.** The knowledge base is a curated handful of
  entries (keyword retrieval, not full RAG) — fine for FAQ-style safety
  questions, not a mycological reference.
- **Chat LLM is optional.** Without `DEEPSEEK_API_KEY`, chat answers from the
  knowledge base directly (rule mode).

## License

[MIT](./LICENSE). MycoGuard is an educational project — see the disclaimer
above; it is **not** a foraging or medical tool.
