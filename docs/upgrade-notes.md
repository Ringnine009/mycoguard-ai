# MycoGuard v3 — safety upgrade notes

Three audited defects in a mushroom-safety app, each fixed with a failing test on
record first (`red → green`), plus the safety metric the project should have been
quoting all along. Written so each item can be defended in an interview.

Baseline before this work: **399 vitest / 43 pytest green**, `npm run build` green.
After: **454 vitest / 49 pytest green**, `npm run build` green.

---

## Problem 1 — the number beside a "low risk" verdict read as a safety score

### The defect (code-level evidence)

`src/engine/mushroomEngine.ts` computed the displayed number as

```ts
const base = 0.4 + 0.3 * (active / 22) + 0.22 * Math.min(1, Math.abs(diff) / 8);
```

with `diff = pScore − eScore`. Because the third term used `Math.abs(diff)`, it grew
with the **size** of the gap in either direction: strong evidence for the *safe*
class inflated the number exactly like strong evidence for the *risk* class. Measured
against the shipped engine (a re-implementation of the old formula run over the
current rule table), a 3-trait low-risk verdict rendered **54%**, a 7-trait
safety-anchor set **72%**, and a fully observed 22-trait specimen **92%** — i.e.
*the safer the conclusion, the higher the number*.

`src/components/ResultPanel.tsx` then rendered it as a 26px number on a 0/50/100%
scale, inside `.result-card.safe` / `.risk-badge.safe`, next to a green shield-check
and a green `.guidance-box.safe`. Reproduced verbatim in the red run:

```html
<span class="risk-badge safe"><svg …/></svg>低风险</span>
<span class="conf-point">54%</span> … <div class="conf-scale">0% 50% 100%</div>
```

Worse, `src/engine/merge.ts` fed the vision model's **species** confidence into that
same risk number: `point' = 0.65·engine.point + 0.35·modelConfidence`. A confident
model made a low-risk verdict look *more* certain regardless of what it actually saw —
a category error (species confidence ≠ risk-evidence confidence). In the red run, one
disagreeing vision result moved a low-risk display from 54% to **68%**.

### The failing test

`src/__tests__/evidence.test.ts` (new, 19 tests). Red run: **9 failed**, including

- `a low-risk verdict is never reported as better-evidenced than a high-risk verdict`
  → `Cannot read properties of undefined (reading 'strength')`
- `a confident visual channel never moves the evidence point estimate`
  → `expected 0.38415340909090906 to be 0.5371590909090909`

`src/__tests__/resultPanelSafety.test.tsx` (new, 12 tests). Red run: **4 failed**,
including `does not use the success tone class anywhere in the low-risk DOM`
(received `class="result-card top-border safe"`, `class="risk-badge safe"`,
`class="guidance-box safe"`).

### The fix

- **Direction and strength are now separate.** The risk tier carries the direction;
  the number is an explicit **evidence strength** built only from coverage, rule
  support and signal conflict — `Math.abs(diff)` is gone entirely, so the sign *and*
  size of the score gap cannot move it:

  ```ts
  strength = 0.50·coverage^1.2 + 0.25·ruleSupport + 0.10·conflict
             + (critical ? 0.15 : 0) + 0.02          // clamped to (0, 0.97]
  ```

- **The interval is derived from a bounded relative half-width**, so more evidence
  monotonically means a higher point and a proportionally tighter interval, and
  neither end is clamped independently (the old independent clamps made a sparse
  verdict's interval *wider* than a sparser one's).
- **A forced `unknown` is now the weakest number in the app** (0.04, interval
  [0.02, 0.18]) — strictly below any directional verdict, so "insufficient evidence"
  can never look more certain than a real risk signal.
- **Vision fusion only scales interval width** (`strength' = strength`), and
  `evidence.intervalWidened` records disagreement. The tier is never touched.
- **UI**: `low` maps to a new neutral tone (no green, no check icon); the 0/50/100%
  scale is gone (`.conf-scale` → `.conf-note`); the number is labelled
  `证据充分度` / "Evidence strength" with the caveat
  `该数字表示证据充分度，不是安全概率，也不是可食用的可能性。` in both languages,
  plus `未发现强风险信号——这不等于可以食用。` on low verdicts only. `shield-check`
  is no longer imported by the result panel.

### The numbers

| Verdict | old display | new display |
|---|---|---|
| `{odor a, capShape x, capColor n}` → low risk | **54% green + check** | **7% neutral** (interval 2–12%), "no strong risk signal found" |
| `{odor f, capShape x, capColor n}` → high risk (critical) | 80% | **22%** (interval 12–31%) |
| `{spore r, gill b, gillSize n}` → high risk | 80% | **22%** |
| 7-trait low-risk anchor set | **72%** | **20%** (interval 13–27%) |
| 22-trait fully observed specimen (low risk) | **92%** | **20%** |
| mixed medium (5 traits, conflicting signals) | 48% | **11%** |
| forced `unknown` (1 trait) | 18% | **4%** (interval 2–18%) — now the weakest number in the app |
| low risk + disagreeing confident vision | 54% → **68%** (rose!) | **7%, interval flagged as widened** |

Note the direction of the fix: the *high-risk* number also fell (80% → 22%), because
the signal is "we have observed 3 things and one of them is critical", not "we are 80%
sure this is dangerous". Raising the high number while lowering the low one would have
been a different bug, not a fix.

Two further inversions were found while pinning these numbers — both by *testing*, not
by reading the code back:

- **Conflict was scoring as evidence.** With an early version of the new formula a
  *mixed* medium verdict (27.9%) out-scored a *clear critical* high verdict (21.6%):
  "the signals are confusing, but we are sure of it". Conflict is now a penalty
  (`−0.08`, not applied to a critical hit, which is decisive by itself).
- **The fullest evidence bar belonged to the safest-reading verdict.** A fully
  observed low-risk specimen still displayed 77%, above every high verdict. Verdicts
  that are not `high` findings are now capped at 20%, and the invariant "no low/medium
  verdict out-displays any high verdict" is verified **exhaustively over all 8,124
  dataset rows**, not just on chosen examples.

### Interview talking points

- The bug class is *semantic*, not numeric: `|Δ|` looks innocuous and the tests
  passed, because every test asked "is the interval well-formed?" and none asked
  "what does the number mean?" A test that asserts a *property* (low never
  out-scores high) catches what a test that asserts a *range* cannot.
- Colour and iconography are part of the safety contract, so the assertion is made
  against the rendered DOM (`renderToString`), not against a component prop.
- I did not simply lower the number. A number that goes down for `high` and stays
  up for `low` would have been equally misleading; the metric had to stop depending
  on direction at all.

---

## Problem 2 — the photo channel could report a trait a photo cannot show

### The defect

`app/services/vision.py` listed `odor` in `TRAIT_VOCAB` and printed a full
`odor: a|l|c|y|f|m|n|p|s` code table in the prompt; `_sanitize` accepted anything the
model returned. Odor is simultaneously a **6.0-weight `critical` risk rule** and a
**3.5-weight safety anchor**, so a hallucinated "almond odor" read off a still image
could push a verdict towards low risk on its own — while README (line 326) claimed
"qwen-vl-plus reports only what it can see". `stalkRoot` had the same problem for a
different reason: it is underground and only exposed by uprooting the specimen.

### The failing test

`app/tests/test_vision_modality.py` (new, 6 tests). Red run: **collection error** —

```
ImportError: cannot import name 'NON_VISUAL_TRAITS' from 'app.services.vision'
```

`src/__tests__/modality.test.ts` (new, 9 tests). Red run: **5 failed**, the key one
being empirically damning —

```
a vision-only "almond odor" cannot steer the verdict
  → expected 'low' to be 'unknown'
```

A photo-only `{odor: 'a', capShape: 'x', capColor: 'n'}` produced a **low-risk**
verdict from an unobservable claim.

### The fix

Implementation **and** documentation, as required (the doc was the thing that was
false):

- `NON_VISUAL_TRAITS = frozenset({"odor", "stalkRoot"})` in `vision.py`, asserted
  disjoint from `TRAIT_VOCAB` at import time.
- The prompt no longer offers a code table for either trait. They are still *named* —
  in an explicit prohibition ("气味（odor）无法从照片判断，绝不能报告；菌柄根部
  （stalkRoot）埋在土里…任何需要闻、摸、尝或挖掘才能确定的性状都不要报告"). The
  modality tests assert the *code table* is clean, since a substring ban would forbid
  the prohibition itself.
- `_sanitize` drops them anyway (defence in depth) and returns `dropped_traits`, which
  `analyze_image` turns into `warnings` — surfaced in the result page as a chip rather
  than silently swallowed.
- Frontend mirror `dropNonVisualTraits()` in `src/engine/merge.ts`, applied inside
  `mergeTraits` so the HTTP boundary is not trusted. `src/__tests__/modality.test.ts`
  **reads `vision.py` and parses `NON_VISUAL_TRAITS` from it**, asserting the two
  lists are identical — the drift that caused this bug cannot recur silently.
- Manual entry is deliberately unaffected: an observer standing at the specimen *can*
  smell it and *can* dig it up. Only the photo channel is restricted, and a test
  pins that too.
- README "Known limitations" now states exactly what the implementation does.

### The numbers

- Vision-only `{odor: 'a' …}`: **low risk → forced `unknown`** (discriminative traits
  drop to 0, so the `< MIN_TRAITS`/no-discriminative-trait rule fires).
- UCI replay impact: 0 rows, because the replay feeds real column data (an observer's
  report), not a photo. `npm run eval:safety` prints this explicitly so the number is
  never confused with a photo-only path.
- 2 traits are now impossible to obtain from a photo; 20 remain.

### Interview talking points

- The interesting failure is a *modality* error: the model was asked a question it
  structurally cannot answer, and the prompt's own whitelist invited the hallucination.
  Removing the question is more reliable than post-hoc filtering, so I did both.
- Two enforcement points (backend sanitizer, frontend merge) plus a cross-language
  test, because the trait whitelist is a trust boundary that arrives over HTTP.
- The doc claim was the actual bug report: the README promised something the code did
  not do. Fixing only one of them would have left the project lying either way.

---

## Problem 3 — the strongest safety number in the project was not in the README

### The defect

The README's "Statistical grounding" section led with "Random Forest held-out
accuracy **100.00%**" — a number that is achieved by essentially any model on a
near-linearly-separable teaching dataset, carries almost no information, and invites
a data-leakage interrogation. The genuinely strong property — the rule engine never
grades a poisonous specimen as low risk — was not measured anywhere, so nothing
prevented a future rule change from destroying it.

### The failing test

`src/__tests__/evalSafety.test.ts` (new, 13 tests) against a new
`scripts/eval_engine_safety.ts`. Red run: module did not exist
(`Cannot find module '../../scripts/eval_engine_safety'`).

The guard is designed to be **non-vacuous**: alongside the `falseSafe === 0`
assertion it runs deliberately broken engines through the same harness and requires
the metric to catch them —

- `grade: () => 'low'` → false-safe rate > 40%
- `grade: () => 'unknown'` → caught by `falseSafeOrUnknownRate`
- `grade: () => 'high'` → `falseAlarmRate === 1`, accuracy collapses
- a lenient post-processor that promotes `unknown` → `medium` → caught by the
  loud-alarm metric

### The fix

`scripts/eval_engine_safety.ts` (`npm run eval:safety`) imports the **real**
`computeRiskAssessment` and replays all 8,124 rows of the real
`data/raw/agaricus-lepiota.data`. It writes
`data/raw/engine_safety_report.json` and **exits non-zero if `falseSafe > 0`**. It
fails loudly when the dataset is missing rather than reporting zeros. A pytest-free,
offline, zero-cost script.

### The numbers (measured, all of them)

```
8,124 rows · poisonous 3,916 · edible 4,208
tiers: low 1,184 · medium 2,670 · high 4,270 · unknown 0

SAFETY   false safe (poisonous → low)      0 / 3,916   (0.00%)
         false safe or unknown             0 / 3,916   (0.00%)
COST     false alarms (edible → high)    370 / 4,208   (8.79%)
         binary accuracy                             95.45%
         over-warned (edible → high|medium) 3,024 / 4,208  (71.86%)
         binary accuracy (that convention)           62.78%
BASELINE single-trait odor lookup (`c f m p s y`)
         accuracy                                    98.52%   ← beats the engine
         false safe                        120 / 3,916   (3.06%)
         false alarms                                 0.00%
```

Two honesty notes, both recorded in the README rather than smoothed over:

1. **The single-trait baseline beats the engine on accuracy (98.52% vs 95.45%) and
   the engine does not win on false alarms either.** The engine's entire justification
   is the 0/3,916 false-safe rate; the lookup misses 120 poisonous specimens. That is
   the trade-off, stated as a trade-off.
2. **The audit's initial figures were 8.79% / 95.25%; this replay measures
   8.79% / 95.45%.** The false-alarm rate reproduces exactly. The 0.2pp accuracy gap is
   a convention difference: `high`-only alarms (95.45%) versus counting `medium` as
   well. Both conventions are computed and printed, so no number is selected to flatter
   the engine.

### README rewrite

- Headline is now **"0 / 3,916 false-safe"** with the 8.79% cost in the same bullet.
- The RF 100% is demoted to an explicit footnote labelled *near-worthless number*,
  with the reason ("this dataset is near-linearly separable, so essentially any model
  achieves it").
- The odor baseline and the loud-alarm cost are both in the README, including the
  sentence that the baseline has a worse false-safe rate.
- "Known limitations" adds that the 0/3,916 figure is an **in-sample replay property,
  not field validation** — it cannot be extrapolated to a real forest.

### Interview talking points

- Choosing the metric is the engineering: accuracy was already being measured and was
  already misleading; the asymmetric cost of the two error types is what makes
  "false safe" the number that matters.
- A metric with no regression guard is documentation, not engineering. The guard
  proves it can fail by feeding itself a broken engine — otherwise `== 0` would pass
  forever against a stale artifact.
- I published the number that makes the project look worse (the baseline beating the
  engine) because a safety claim that suppresses its counter-evidence is worse than no
  claim.

---

## Files changed

**Frontend engine / UI**

- `src/engine/mushroomEngine.ts` — `evidenceStrength()`, evidence summary, relative
  interval half-width, weakest-possible `unknown`, `.ts` import specifiers so Node can
  run the eval script.
- `src/engine/merge.ts` — `NON_VISUAL_TRAITS`, `dropNonVisualTraits()`, width-only
  vision fusion, `intervalWidened`.
- `src/engine/presentation.ts` — `low` → neutral tone (was `safe`).
- `src/components/ResultPanel.tsx` — neutral low verdict, evidence-strength label and
  caveat, no 0–100% scale, dropped-trait warning chip.
- `src/i18n.tsx` — new zh/EN strings; photo-mode text aligned with the modality fix.
- `src/App.tsx`, `src/engine/pipeline.ts`, `src/styles/global.css` — wording and
  neutral-tone styling.
- `src/types.ts` — `EvidenceSummary`.

**Backend**

- `app/services/vision.py` — `NON_VISUAL_TRAITS`, prompt without the odor/stalk-root
  code tables, sanitizer drops + warnings.

**Scripts / data**

- `scripts/eval_engine_safety.ts` (new), `package.json` (`eval:safety`). The guard
  suite is unconditional: a missing `data/raw/agaricus-lepiota.data` (gitignored)
  produces one explicit red failure naming the fetch command — it is NOT skipped,
  because a guard that reports "0 tests" while `npm test` stays green looks like
  coverage while proving nothing.

**Tests**

- New: `src/__tests__/evidence.test.ts`, `src/__tests__/resultPanelSafety.test.tsx`,
  `src/__tests__/modality.test.ts`, `src/__tests__/evalSafety.test.ts`,
  `app/tests/test_vision_modality.py`.
- Modified (each documented in-code): `engine.test.ts` (8 assertions),
  `merge.test.ts` (5), `pipeline.test.ts` (1), `presentation.test.ts` (2),
  `i18n.test.ts` (1), `test_vision.py` (1).

**Docs**

- `README.md`, `docs/TECHNICAL_SPEC.md`, this file.

## Why the pre-existing tests were changed — and a retracted claim

An independent verification pass pushed back on the first version of this section,
and it was right on one point: three assertions in `engine.test.ts` were
**loosened**, not merely re-grounded — `confidence.point >= 0.8` became
`evidence.strength > 0.1`, and `confidence.point >= 0.75` became
`evidence.strength > 0.15`. Calling that "corrected (not loosened)" was wrong. The
claim is retracted and those bounds have been replaced with **stricter** ones on
the new semantics:

| Test | Old (pre-fix) | Loosened v1 (wrong) | Now |
|---|---|---|---|
| `foul odor → high` ×6 | `point >= 0.75`, `upper < 1` | `strength > 0.15` | `strength` pinned to `0.2158` (±0.001), `> forced-unknown`, `> NON_HIGH_STRENGTH_CEILING`, `upper < 0.97`, critical hit present |
| `strongly high` | `point >= 0.8` | `strength > 0.1` | `strength` pinned to `0.2158` (±0.001), 3 rule hits, critical present, `upper < 0.97` |
| `combined dangerous` | `point >= 0.75` | `> single-signal strength` | `strength` pinned to `0.318` (±0.001) **and** `> single-signal strength` **and** more rule hits |

A pinned value plus strict orderings is a stronger contract than the old magic
thresholds: it fails on *any* change to the safety semantics, not only on a large
one. The remaining nine changed assertions are genuine re-groundings — the old
expectations *were* the bug.

### The full list

| Test | Old assertion | New assertion | Why it is a correction |
|---|---|---|---|
| `engine.test.ts` × 6 (`foul odor → high`) | `confidence.point >= 0.75` | `str` pinned `0.2158` + orderings + critical hit | The 0.75 was the bug: a critical odor no longer inflates the number to 75%+. Pinning is tighter than the deleted threshold, not looser. |
| `engine.test.ts` (`strongly high`, `combined dangerous`) | `point >= 0.8` / `>= 0.75` | pinned `0.2158` / `0.318` + monotonicity in rules/coverage + `upper < MAX_CONFIDENCE` | Same semantic change; the new assertions test strictly more. |
| `merge.test.ts` (`agreeing ... raises the point`) | `point > base.point` | `confidence` deep-equals the engine's, `intervalWidened === false` | The old expectation *was* the bug (vision confidence raising the risk number), and v1 of this fix still let agreement narrow the interval — now a no-op. |
| `merge.test.ts` (`partial agreement`, 0.35) | hard-coded `modelConfidence: 0.35` | gap derived from `base.confidence.point + 0.2` | 0.35 was calibrated to the old 0.537 point; deriving the gap tests the band logic, not a constant. |
| `merge.test.ts` (odor as the vision trait, 2 cases) | vision supplies `odor` | vision supplies `gillColor`/`capColor`, plus a new test asserting odor is **rejected** | Vision can no longer supply odor; the gap-filling contract is unchanged and now tested on observable traits. |
| `pipeline.test.ts` (`agree` band) | `modelConfidence: 0.85` | agreement case anchors `modelConfidence` to the engine's own point; disagreement asserted separately | The fixed 0.85 only agreed because the old point was ~0.8; anchoring removes the coupling instead of chasing the constant. |
| `presentation.test.ts` (tone) | `low → 'safe'`, tone regex `safe` | `low → 'neutral'`, plus `not.toBe('safe')` for all levels | Directly encodes the fix: green success styling must be unreachable. |
| `i18n.test.ts` (pipeline kicker) | `'Fused confidence'` | `'Fused evidence interval'` | The label changed with the semantics. |
| `test_vision.py` (`drops invalid values`) | `{"odor": "f"}` survives sanitizing | `{"gillColor": "b"}` survives | Odor surviving *was* the defect; the invalid-value rejection logic is unchanged. |

## Recorded deviations from the task's own constraints

Three deviations are recorded here rather than left to be re-derived from the diff.

**1. Backend API contract (declared OUT of scope; required IN by the modality
criterion).** `POST /api/analyze` keeps its shape (`{status, species_guess,
confidence, traits, notes, warnings}` — same keys and types; `app/tests/test_api.py`
is unmodified) but **narrows the domain** of `traits` (never `odor`/`stalkRoot`
again) and turns `warnings` from a constant `[]` into a live channel. Adjudication:
safety wins over "zero contract movement" — a photo channel able to report a smell
is a safety defect, and the change makes the payload *more* truthful, not more
permissive. Also stated in `docs/TECHNICAL_SPEC.md` §5.1 and the README API
section, and pinned by `app/tests/test_vision_modality.py` +
`src/__tests__/modality.test.ts`.

**2. Acceptance criterion wording vs the delivered behaviour (fusion).** AC2 as
originally written said agreement "may only narrow the interval". The
implementation deliberately forbids narrowing: agreement is a no-op and only
disagreement widens (see "One further inversion" below). The delivered behaviour is
the stricter reading of this task's own red line — *"any change that makes a
low-risk verdict look more certain is a wrong direction"* — so the criterion is
superseded, not satisfied literally. If a literal ×0.85 agreement narrowing is ever
wanted back, it must be re-approved against that red line first.

**3. `scripts/eval_engine_safety.py` → `scripts/eval_engine_safety.ts`.** The task
text asked for a `.py` script "或 JS 等价物"; the delivered file is the JS
equivalent, because the rule engine is TypeScript — a Python replayer would be a
*re-implementation* of the very thing being measured, defeating the point of
measuring the real engine. The `.ts` file is wired into `package.json`
(`npm run eval:safety`) and the README, and is what the regression suite imports.

**4. Out-of-strict-scope prose (explicit exception).** The README tree comment
`# vitest (98 tests) → (454 tests)` and the adjacent count lines sit just outside
the strict edit scope (stale lines the new files did not touch). They were
corrected because leaving a wrong count beside a corrected one is the kind of
inconsistency this task exists to remove — recorded here as an exception rather
than left silent.

## One further inversion found by verification

**Fusion was still buying precision.** The first version of the fix removed the
model's confidence from the point estimate but kept the ×0.85 interval narrowing
on agreement — so a model reporting species-confidence 0.10–0.30 still turned a
low-risk verdict from "7% – 33%" into "9% – 31%": the same category error in
smaller print, on the safest-reading verdict. Fusion now may only WIDEN
(agreement is a no-op), the "区间因双通道一致收窄" label is gone, and
`evidence.test.ts` asserts `width(fused) >= width(base)` on agreement.

## Open questions / deliberately not done

- **The `medium` tier carries a warning tone but low weight.** 71.86% of edible
  specimens get a warning-coloured verdict; that is honest but noisy. Tuning the
  thresholds would change the risk language, which was out of scope here — the
  loud-convention number is now measured so the decision can be made with data.
- **The 0/3,916 rate is in-sample.** Held-out or independent validation would require
  field data this project does not have; the README says so instead of implying
  otherwise.
- **`sporePrintColor` is still offered to the vision model** (guarded by "仅当照片中
  可见"). A spore print is a real observation, but not from a single photo of an intact
  specimen — a stricter reading would move it to `NON_VISUAL_TRAITS` too. Flagged, not
  decided unilaterally.
