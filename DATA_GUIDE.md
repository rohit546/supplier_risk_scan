# Data Guide — Understanding the Fixtures, Every Number, the Dimensions & the Weights

This document explains the **starting data** of the system in complete detail: what a "fixture" is, what every single number means, what its valid range is, which direction is good or bad, and how the dimensions and weights work.

Read this alongside `backend/app/data/fixtures.json` (the data itself) and `backend/app/data/generator.py` (the code that uses it).

---

## Table of Contents

1. [What "Fixture" Means](#1-what-fixture-means)
2. [The Shape of One Supplier Entry](#2-the-shape-of-one-supplier-entry)
3. [The Identity Fields (who the supplier is)](#3-the-identity-fields-who-the-supplier-is)
4. [The `raw` Block — Every Metric Explained](#4-the-raw-block--every-metric-explained)
   - [Financial metrics](#41-financial-metrics)
   - [Operational metrics](#42-operational-metrics)
   - [Compliance metrics](#43-compliance-metrics)
   - [Geopolitical metrics](#44-geopolitical-metrics)
   - [ESG metrics](#45-esg-metrics)
5. [The `drift` Block — How Suppliers Change Over Time](#5-the-drift-block--how-suppliers-change-over-time)
6. [The `seed` — Why Data Is Repeatable](#6-the-seed--why-data-is-repeatable)
7. [Master Table — Every Metric, Range & Meaning](#7-master-table--every-metric-range--meaning)
8. [The Five Dimensions](#8-the-five-dimensions)
9. [The Weights — How Dimensions Combine](#9-the-weights--how-dimensions-combine)
10. [A Fully Annotated Real Example](#10-a-fully-annotated-real-example)
11. [The 14 Suppliers at a Glance](#11-the-14-suppliers-at-a-glance)

---

## 1. What "Fixture" Means

A **fixture** is a software-testing word. It means **a fixed, pre-prepared set of data that the program starts with** — like the props on a stage that are set up before the play begins.

In this project there is **no database and no live data feed**. So instead of pulling supplier information from the real world, the system loads a file called `fixtures.json`. That file contains **14 ready-made supplier profiles**. They are "fixed" because:

- They are written down in advance (not random each time).
- Every time you start the system, you get the **exact same 14 suppliers** with the **exact same starting numbers**.

This makes the system predictable and easy to evaluate: anyone who runs it sees identical starting conditions. After startup, the background agent gradually changes these numbers to simulate real life — but the **starting point** always comes from the fixtures.

---

## 2. The Shape of One Supplier Entry

Each supplier in `fixtures.json` is one block with this structure:

```json
{
  "id": "globaltech-mfg",
  "name": "GlobalTech Manufacturing Co",
  "country": "Myanmar",
  "region": "High-Risk Zone — SE Asia",
  "category": "Electronics Assembly",
  "tier": 1,
  "seed": 101,
  "raw": {  ...the actual business metrics... },
  "drift": { ...how those metrics slowly change... }
}
```

There are three groups of information:

1. **Identity fields** — who the supplier is (`id`, `name`, `country`, `region`, `category`, `tier`).
2. **`raw`** — the real business numbers used to calculate risk.
3. **`drift`** — how those numbers trend over time, so the supplier "moves" while the agent runs.

Plus a `seed` number that makes everything repeatable (explained in section 6).

---

## 3. The Identity Fields (who the supplier is)

| Field | Meaning | Example | Notes |
| --- | --- | --- | --- |
| `id` | A unique computer-friendly label | `"globaltech-mfg"` | Used in web addresses and to link alerts to suppliers. Never shown prettily. |
| `name` | The human-readable company name | `"GlobalTech Manufacturing Co"` | What you see on screen. |
| `country` | Where the supplier is based | `"Myanmar"` | **Important:** this also looks up the country's risk score (see geopolitical). |
| `region` | A broader geographic grouping | `"High-Risk Zone — SE Asia"` | For grouping/labels only; not used in scoring. |
| `category` | What the supplier provides | `"Electronics Assembly"` | For labels/filtering only; not used in scoring. |
| `tier` | How critical the supplier is | `1` | **1** = most strategic/critical, **2** = important, **3** = least critical. For context, not scoring. |

**Key point:** Only `country` feeds into the risk math. The others (`region`, `category`, `tier`) are descriptive labels.

---

## 4. The `raw` Block — Every Metric Explained

This is the heart of the data. **"Raw" means the real, untouched business numbers** — not risk scores. The scoring engine turns these into risk scores; the raw numbers themselves are the plain facts about the supplier.

The `raw` block has five sections, one per risk dimension.

### 4.1 Financial metrics

> Answers: *"Is this company financially healthy, or could it run out of money?"*

| Field | Plain meaning | Unit | Valid range | Good vs bad |
| --- | --- | --- | --- | --- |
| `creditScore` | How trustworthy the company is with money (like a personal credit score, but for a business) | points | **300 – 850** | **Higher is better.** 850 = excellent, 300 = nearly bankrupt |
| `dsoDays` | "Days Sales Outstanding" — how many days the company takes to collect money it is owed | days | **20 – 120** | **Lower is better.** Benchmark is ~45 days. High = cash-flow trouble |
| `debtRatio` | How much of the company is funded by debt | fraction 0–1 | **0.05 – 0.95** | **Lower is better.** Above 0.40 starts adding risk |
| `profitMargin` | How much profit they keep per sale | fraction | **-0.10 – 0.30** | **Higher is better.** 0.14 = 14% profit (healthy); negative = losing money |
| `revenueTrend` | Whether sales are growing or shrinking | -1 to +1 | **-1.0 – 1.0** | **Higher is better.** +0.3 = growing; -0.5 = shrinking fast |

**Real example (GlobalTech):** `creditScore: 520` (weak), `dsoDays: 78` (slow to collect — 33 days over benchmark), `debtRatio: 0.58` (heavily indebted), `profitMargin: 0.03` (only 3% profit), `revenueTrend: -0.5` (sales falling fast). → A financially fragile company.

**Real example (Reliable):** `creditScore: 810` (excellent), `dsoDays: 38` (fast), `debtRatio: 0.25` (low debt), `profitMargin: 0.14` (14% — strong), `revenueTrend: +0.3` (growing). → A financially solid company.

### 4.2 Operational metrics

> Answers: *"Can this supplier actually deliver good products on time?"*

| Field | Plain meaning | Unit | Valid range | Good vs bad |
| --- | --- | --- | --- | --- |
| `onTimeDelivery` | Percentage of orders delivered on schedule | % | **60 – 100** | **Higher is better.** Target is 95%. Below that is a problem |
| `defectRate` | Percentage of delivered items that were faulty | % | **0 – 12** | **Lower is better.** The promised limit (SLA) is 2.0%. Above = breach |
| `capacityUtilization` | How much of the factory's total ability is in use | % | **30 – 100** | **Middle is best.** Too high (>92%) = over-stretched; too low (<45%) = struggling |

**Real example (GlobalTech):** `onTimeDelivery: 86%` (9 points below target), `defectRate: 4.5%` (more than double the 2% limit), `capacityUtilization: 94%` (over-stretched). → Delivery and quality are failing.

**Note on capacity:** unlike the others, capacity risk is **U-shaped** — both extremes are bad. A factory running at 94% has no room to absorb a rush order; one running at 40% may be losing business and heading for trouble. The healthy middle is roughly 45–92%.

### 4.3 Compliance metrics

> Answers: *"Is this supplier legally and officially in good standing?"*

| Field | Plain meaning | Unit | Valid range | Good vs bad |
| --- | --- | --- | --- | --- |
| `isoCertified` | Whether they hold a valid ISO 9001 quality certificate | true/false | true or false | **true is good.** false = not formally qualified |
| `certDaysToExpiry` | Days until the certificate expires. **Negative means already expired** | days | **-2000 – 2000** | **Higher is better.** -47 = expired 47 days ago; +320 = valid for 320 days |
| `violations12m` | Number of rule/regulation violations in the last 12 months | count | **0 – 10** | **Lower is better.** 0 = clean; each one adds significant risk |
| `lastAuditDays` | How many days since the supplier was last inspected | days | **0 – 2000** | **Lower is better.** Over ~180 days = "stale", inspection overdue |

**Real example (GlobalTech):** `isoCertified: false`, `certDaysToExpiry: -47` (lapsed over six weeks ago), `violations12m: 3` (multiple breaches), `lastAuditDays: 412` (not checked in more than a year). → Serious compliance gaps.

**Real example (Reliable):** `isoCertified: true`, `certDaysToExpiry: 320` (well in date), `violations12m: 0` (clean), `lastAuditDays: 42` (recently checked). → Fully compliant.

### 4.4 Geopolitical metrics

> Answers: *"Is this supplier's country a safe place to source from?"*

| Field | Plain meaning | Unit | Valid range | Good vs bad |
| --- | --- | --- | --- | --- |
| `tradeRestrictions` | Count of active trade restrictions / tariff exposures affecting this supplier | count | **0 – 6** | **Lower is better.** 0 = open trade; each one adds risk (capped) |

**Important — the country risk is NOT stored in the fixture.** Notice the geopolitical block only contains `tradeRestrictions`. The **country risk score** is looked up automatically from the supplier's `country` using a built-in table in `scoring.py`:

| Country | Risk (0–100) | | Country | Risk (0–100) |
| --- | --- | --- | --- | --- |
| Russia | 95 | | Mexico | 52 |
| Myanmar | 92 | | Brazil | 48 |
| China | 58 | | India | 44 |
| Taiwan | 56 | | Vietnam | 38 |
| Turkey | 55 | | South Korea | 30 |
| United States | 18 | | Poland | 26 |
| United Kingdom | 22 | | Japan | 20 |
| Spain | 18 | | France | 16 |
| Germany | 12 | | Norway | 8 |
| Switzerland | 6 | | *(unlisted)* | 40 (default) |

So GlobalTech in **Myanmar** automatically gets a country base of **92**, while Reliable in **Germany** gets **12**. Higher = riskier.

### 4.5 ESG metrics

> Answers: *"Does this supplier behave responsibly?"* (ESG = Environmental, Social, Governance)

| Field | Plain meaning | Unit | Valid range | Good vs bad |
| --- | --- | --- | --- | --- |
| `environmental` | Environmental responsibility rating (pollution, emissions, waste) | points | **0 – 100** | **Higher is better.** |
| `social` | Social responsibility rating (worker treatment, safety, community) | points | **0 – 100** | **Higher is better.** |
| `governance` | Governance rating (honest, transparent management) | points | **0 – 100** | **Higher is better.** |
| `newsSentiment` | Whether recent news about them is positive or negative | -1 to +1 | **-1.0 – 1.0** | **Higher is better.** +0.7 = good press; -0.6 = bad press |

**Note:** ESG ratings are the **only** scores where higher is better *inside the raw data*. The engine flips them into risk (100 minus the rating), because a high ESG rating means low ESG risk.

**Real example (Brazil AgroFiber):** `environmental: 22` (very poor), `social: 40`, `governance: 44`, `newsSentiment: -0.45` (negative press). → High ESG risk, driven by environmental problems.

---

## 5. The `drift` Block — How Suppliers Change Over Time

If the numbers never changed, the dashboard would be frozen and boring — and the agent would never have anything to alert on. The **`drift` block** fixes that: it describes **the direction each metric trends, per simulated day**.

```json
"drift": {
  "financial.creditScore": -1.2,
  "operational.defectRate": 0.06,
  "esg.newsSentiment": -0.004
}
```

Read this as:

- `"financial.creditScore": -1.2` → each simulated day, the credit score drifts **down by 1.2 points** (getting worse).
- `"operational.defectRate": 0.06` → defect rate creeps **up by 0.06%** per day (getting worse).
- `"esg.newsSentiment": -0.004` → news sentiment slowly turns more negative.

**Why this matters:**

1. **It drives the 30-day history.** The generator takes today's numbers, "rewinds" them 29 days by reversing the drift, then replays them forward — adding small random noise — to build a believable history. (This is why the history is *derived*, never invented.)
2. **It drives the live agent.** While running, the agent applies the same drift so suppliers gradually worsen or improve, eventually crossing alert thresholds.

**Two kinds of drift:**

- **Fixture drift** — written per supplier (above). This is what makes each supplier's story unique (GlobalTech is sliding into crisis; British Chemicals' certificate is counting down to expiry).
- **Time drift** — automatic for everyone, built into the generator:
  - `certDaysToExpiry` always **-1 per day** (certificates always count down)
  - `lastAuditDays` always **+1 per day** (time since audit always grows)

An empty `drift: {}` (like Reliable Components) means the supplier only experiences the automatic time drift — it stays stable. That is why Reliable is the calm, no-alerts baseline.

**Safety rails:** every metric is **clamped** to its valid range (the "Valid range" column in the tables above). A credit score can never drift below 300 or above 850, a defect rate never below 0%, etc. This prevents impossible values.

---

## 6. The `seed` — Why Data Is Repeatable

Each supplier has a `seed` number (101, 102, 103…). This is the starting point for the **random noise** added when simulating history and daily movement.

A "seeded" random generator always produces the **same sequence** of "random" numbers for the same seed. So:

- GlobalTech (seed 101) always gets the **same** 30-day history every time you start the system.
- The wiggles in the trend line are realistic-looking but **reproducible**, not chaotic.

This is what lets two people running the app on different machines see **identical** charts — important for a fair evaluation.

---

## 7. Master Table — Every Metric, Range & Meaning

A single reference for all 16 driftable metrics (ranges come directly from `METRIC_BOUNDS` in `generator.py`):

| Path | Dimension | Unit | Range | Direction | Benchmark / Threshold |
| --- | --- | --- | --- | --- | --- |
| `financial.creditScore` | Financial | points | 300–850 | higher = safer | best 850 |
| `financial.dsoDays` | Financial | days | 20–120 | lower = safer | benchmark 45 |
| `financial.debtRatio` | Financial | fraction | 0.05–0.95 | lower = safer | risk above 0.40 |
| `financial.profitMargin` | Financial | fraction | -0.10–0.30 | higher = safer | risk below 0.10 |
| `financial.revenueTrend` | Financial | -1..1 | -1.0–1.0 | higher = safer | negative = shrinking |
| `operational.onTimeDelivery` | Operational | % | 60–100 | higher = safer | target 95% |
| `operational.defectRate` | Operational | % | 0–12 | lower = safer | SLA 2.0% |
| `operational.capacityUtilization` | Operational | % | 30–100 | middle = safer | risky <45% or >92% |
| `compliance.certDaysToExpiry` | Compliance | days | -2000–2000 | higher = safer | <60 days = warning, <0 = expired |
| `compliance.violations12m` | Compliance | count | 0–10 | lower = safer | 0 ideal |
| `compliance.lastAuditDays` | Compliance | days | 0–2000 | lower = safer | stale above 180 |
| `geopolitical.tradeRestrictions` | Geopolitical | count | 0–6 | lower = safer | 0 ideal |
| `esg.environmental` | ESG | points | 0–100 | higher = safer | — |
| `esg.social` | ESG | points | 0–100 | higher = safer | — |
| `esg.governance` | ESG | points | 0–100 | higher = safer | — |
| `esg.newsSentiment` | ESG | -1..1 | -1.0–1.0 | higher = safer | negative = bad press |

Plus the lookup-only field:

| Field | Dimension | Range | Source |
| --- | --- | --- | --- |
| `countryRisk` | Geopolitical | 0–100 | Looked up from `country` (not stored in fixture) |

---

## 8. The Five Dimensions

Each supplier is judged on five separate angles. Each produces its own 0–100 risk score (higher = riskier), built only from the raw metrics above.

| Dimension | Question it answers | Built from |
| --- | --- | --- |
| **Financial** | Could they run out of money? | creditScore, dsoDays, debtRatio, profitMargin, revenueTrend |
| **Operational** | Can they deliver good products on time? | onTimeDelivery, defectRate, capacityUtilization |
| **Compliance** | Are they legally/officially in good standing? | isoCertified, certDaysToExpiry, violations12m, lastAuditDays |
| **Geopolitical** | Is their country safe to source from? | countryRisk (from country), tradeRestrictions |
| **ESG** | Do they behave responsibly? | environmental, social, governance, newsSentiment |

**Risk bands** (applied to every score):

- **Low** = below 40 (green)
- **Medium** = 40 to 69 (amber)
- **High** = 70 or above (red)

---

## 9. The Weights — How Dimensions Combine

The five dimension scores are combined into **one overall score**. But not all dimensions count equally — some risks hurt the business more than others. The **weights** decide how much each dimension contributes. They are set in `backend/app/config.py` and **add up to exactly 1.0 (100%)**:

| Dimension | Weight | Share | Why this weight |
| --- | --- | --- | --- |
| **Operational** | `0.24` | 24% | Highest — late/defective deliveries hit production the fastest |
| **Financial** | `0.22` | 22% | A bankrupt supplier disappears entirely — very high impact |
| **Compliance** | `0.20` | 20% | Legal/quality lapses can halt regulated programs |
| **Geopolitical** | `0.18` | 18% | Country risk is serious but usually slower-moving |
| **ESG** | `0.16` | 16% | Important and reputational, but typically the slowest-burning |
| **Total** | **1.00** | **100%** | |

### Two-step combination

The overall score is **not** a plain weighted average. It is a **blend** of two ideas, defined in `scoring.py`:

**Step 1 — Weighted average** (each dimension counts by its weight):

```
weighted = financial×0.22 + operational×0.24 + compliance×0.20
         + geopolitical×0.18 + esg×0.16
```

**Step 2 — Worst-dimension blend** (so one catastrophe cannot hide behind four healthy areas):

```
overall = round( 0.65 × weighted  +  0.35 × worst_single_dimension )
```

**Why the blend?** Imagine a supplier that is perfect on four dimensions but has a geopolitical score of 96 (their country is at war). A plain average would dilute that to a mild number — dangerously misleading. By giving the **single worst dimension** a 35% pull, the system reflects how a real risk manager thinks: *"One catastrophic problem is still a catastrophe."*

### Changing the weights

You can re-tune these in `backend/.env` without touching code, e.g.:

```
WEIGHT_FINANCIAL=0.30
WEIGHT_OPERATIONAL=0.30
WEIGHT_COMPLIANCE=0.15
WEIGHT_GEOPOLITICAL=0.15
WEIGHT_ESG=0.10
```

(Keep them summing to 1.0 for the math to stay meaningful.) A procurement team that cares most about financial stability could raise the financial weight; one in a volatile region could raise geopolitical.

---

## 10. A Fully Annotated Real Example

Here is GlobalTech's complete fixture entry with every part labeled:

```jsonc
{
  "id": "globaltech-mfg",                  // unique label (used in URLs)
  "name": "GlobalTech Manufacturing Co",   // shown on screen
  "country": "Myanmar",                    // also sets country risk = 92
  "region": "High-Risk Zone — SE Asia",    // label only
  "category": "Electronics Assembly",      // label only
  "tier": 1,                               // most-critical supplier
  "seed": 101,                             // makes its history repeatable

  "raw": {
    "financial": {
      "creditScore": 520,      // weak (300–850 scale)
      "dsoDays": 78,           // slow to collect (33 days over the 45 benchmark)
      "debtRatio": 0.58,       // heavily indebted (risk starts above 0.40)
      "profitMargin": 0.03,    // only 3% profit — thin cushion
      "revenueTrend": -0.5     // sales shrinking fast
    },
    "operational": {
      "onTimeDelivery": 86.0,  // 9 points below the 95% target
      "defectRate": 4.5,       // more than double the 2% SLA limit
      "capacityUtilization": 94 // over-stretched (>92% is risky)
    },
    "compliance": {
      "isoCertified": false,   // NOT certified
      "certDaysToExpiry": -47, // certificate expired 47 days ago
      "violations12m": 3,      // 3 violations in the last year
      "lastAuditDays": 412     // not inspected in over a year (stale > 180)
    },
    "geopolitical": {
      "tradeRestrictions": 2   // 2 active restrictions (country risk pulled from "Myanmar")
    },
    "esg": {
      "environmental": 55,     // mediocre (0–100, higher better)
      "social": 48,
      "governance": 50,
      "newsSentiment": -0.6    // clearly negative press
    }
  },

  "drift": {
    "financial.creditScore": -1.2,      // credit worsens ~1.2/day
    "financial.dsoDays": 0.5,           // takes longer to collect each day
    "operational.onTimeDelivery": -0.18,// deliveries slipping
    "operational.defectRate": 0.06,     // defects rising
    "esg.newsSentiment": -0.004         // press slowly turning worse
  }
}
```

**What happens to this supplier:** it starts risky (overall ≈ 80) and, because every drift points the wrong way, it **keeps getting worse** as the agent runs — repeatedly crossing thresholds and generating critical alerts. That is exactly the "High Risk" scenario the assessment asked for.

---

### How one dimension score is built (read this first)

Before any math, understand the **pattern every dimension follows**. Raw numbers come in different units — days, percentages, credit points — so you cannot add them directly. The engine does this in three steps:

```
Step A   Compare each raw number to a "safe" benchmark
         (e.g. "45 days to collect money is normal; 78 days is bad")

Step B   Turn how far you are from safe into a 0–100 "sub-risk"
         (0 = perfectly safe, 100 = maximum danger for that metric)

Step C   Blend the sub-risks inside that dimension using internal weights
         (credit matters more than margin inside Financial, etc.)
```

**The mysterious numbers (5.5, 1.8, 200, 500…)** are not random. They are **calibration constants**. Each one answers two questions:

1. **Where is the safe zone?** (the subtracted benchmark — 45 days, 0.40 debt, 95% delivery)
2. **How fast should risk rise when you leave the safe zone?** (the multiplier — 1.8 per day, 200 per debt point)

Think of them like a speedometer: the benchmark is "zero on the dial," and the multiplier is "how many risk-points the needle moves per unit of bad news."

---

### Complete walkthrough — Financial dimension (GlobalTech)

We will build the **Financial score only**, slowly, using GlobalTech's five financial raw numbers. Once you understand this one dimension, the other four follow the same idea.

**GlobalTech financial raw data:**

| Raw field | Value | In plain English |
| --- | --- | --- |
| `creditScore` | 520 | Weak credit (scale runs 300 = bankrupt → 850 = excellent) |
| `dsoDays` | 78 | Takes 78 days to collect money owed (slow) |
| `debtRatio` | 0.58 | 58% of the company is funded by debt (high) |
| `profitMargin` | 0.03 | Keeps only 3% profit per sale (thin) |
| `revenueTrend` | -0.5 | Sales are shrinking noticeably |

**Target output:** one Financial score from 0–100. GlobalTech's answer is **49 (medium)**.

---

#### Sub-risk 1 — Credit score → why divide by 5.5?

**What the raw number means:** Business credit works like personal credit. **850 = best possible, 300 = near bankruptcy.** GlobalTech at **520** is below average — lenders would be nervous.

**The formula:**

```
credit_risk = (850 - creditScore) / 5.5
```

**Why `(850 - score)`?** We flip the scale because **high credit = low risk**. A perfect 850 company should produce **0 risk**, not 850 risk.

**Why divide by 5.5 specifically?** To map the **full real-world range** onto 0–100:

```
Best case:   creditScore = 850  →  (850 - 850) / 5.5 = 0    risk  ✓
Worst case:  creditScore = 300  →  (850 - 300) / 5.5 = 100  risk  ✓
```

The spread from best to worst is **550 points** (850 − 300). To turn 550 into 100, you divide by **550 ÷ 100 = 5.5**. That is the entire reason for 5.5 — it is not arbitrary, it is the scaling factor that fits the credit scale.

**GlobalTech:**

```
(850 - 520) / 5.5 = 330 / 5.5 = 60.0
```

**Read it:** credit alone contributes **60 out of 100** possible danger — clearly weak, but not catastrophic.

---

#### Sub-risk 2 — DSO days → why subtract 45 and multiply by 1.8?

**What the raw number means:** DSO = "Days Sales Outstanding" — how long the supplier waits to get paid after delivering goods. **Lower is better** (cash arrives faster). Industry benchmark is roughly **45 days**.

**The formula:**

```
dso_risk = (dsoDays - 45) × 1.8     (only if result > 0; below 45 days = 0 risk)
```

**Why subtract 45?** That is the **safe zone cutoff**. If DSO is 38 days (like Reliable Components), the supplier is *better* than benchmark → **0 extra risk**. We only penalize being **slower** than 45 days.

**Why multiply by 1.8?** This controls **sensitivity** — how many risk-points each extra day costs:

| DSO days | Days over benchmark | × 1.8 | Risk |
| --- | --- | --- | --- |
| 45 (benchmark) | 0 | 0 | 0 — safe |
| 60 | 15 | 27 | mild concern |
| 78 (GlobalTech) | 33 | **59.4** | serious cash-flow stress |
| 100 | 55 | 99 | near maximum |

So **1.8 means:** "each day slower than 45 adds 1.8 risk points." It was chosen so that being ~55 days late (~100 DSO) reaches maximum danger.

**GlobalTech:**

```
(78 - 45) × 1.8 = 33 × 1.8 = 59.4
```

**Read it:** slow collections are almost as worrying as the weak credit score.

---

#### Sub-risk 3 — Debt ratio → why subtract 0.40 and multiply by 200?

**What the raw number means:** Debt ratio = total debt ÷ total assets. **0.58** means 58% of the company is debt-funded. **Lower is safer.**

**The formula:**

```
debt_risk = (debtRatio - 0.40) × 200     (only if > 0)
```

**Why subtract 0.40?** Up to **40% debt is considered normal** for many manufacturers. Risk only starts above that line.

**Why multiply by 200?** Each **0.01 (one percentage point)** of debt above 40% adds **2 risk points** (because 0.01 × 200 = 2). So:

| Debt ratio | Amount above 0.40 | × 200 | Risk |
| --- | --- | --- | --- |
| 0.25 (Reliable) | below safe line | 0 | 0 |
| 0.58 (GlobalTech) | 0.18 | **36** | moderate |
| 0.90 (extreme) | 0.50 | 100 | maximum |

**GlobalTech:**

```
(0.58 - 0.40) × 200 = 0.18 × 200 = 36.0
```

**Read it:** high debt, but not yet at the ceiling.

---

#### Sub-risk 4 — Profit margin → why subtract 0.10 and multiply by 500?

**What the raw number means:** Profit margin = profit ÷ revenue. **0.03 = 3%** — the company keeps only 3 cents profit per dollar of sales. **Higher is safer**; a healthy manufacturer might run 10–15%.

**The formula:**

```
margin_risk = (0.10 - profitMargin) × 500     (only if > 0)
```

**Why subtract 0.10?** **10% margin is the safe target.** Below that, the company has little cushion to absorb shocks.

**Why multiply by 500?** This is a steep multiplier because thin margins are dangerous:

| Margin | Shortfall below 10% | × 500 | Risk |
| --- | --- | --- | --- |
| 0.14 (14%, Reliable) | below safe line | 0 | 0 |
| 0.03 (3%, GlobalTech) | 0.07 | **35** | moderate |
| 0.00 (break-even) | 0.10 | 50 | high |
| -0.10 (losing money) | 0.20 | 100 | maximum |

**GlobalTech:**

```
(0.10 - 0.03) × 500 = 0.07 × 500 = 35.0
```

**Read it:** only 3% margin — very little room before losses.

---

#### Sub-risk 5 — Revenue trend → why multiply by 80?

**What the raw number means:** A direction score from **-1.0 (shrinking fast) to +1.0 (growing fast)**. GlobalTech at **-0.5** means sales are falling noticeably.

**The formula:**

```
trend_risk = -revenueTrend × 80     (only if trend is negative; positive growth = 0 risk)
```

**Why the minus sign?** Negative trend is bad. We flip it so `-(-0.5)` becomes positive risk.

**Why multiply by 80?** Maps the -1..+1 scale to 0–100 risk:

| Revenue trend | Meaning | Risk |
| --- | --- | --- |
| +0.3 (Reliable) | growing | 0 |
| -0.1 | slight decline | 8 |
| -0.5 (GlobalTech) | significant decline | **40** |
| -1.0 | collapsing | 80 |

**GlobalTech:**

```
-(-0.5) × 80 = 0.5 × 80 = 40.0
```

**Read it:** shrinking sales add real but not maximum financial pressure.

---

#### Step C — Blend the five sub-risks into one Financial score

Now we have five numbers on the **same 0–100 scale**. We combine them with **internal weights** (these weights live *inside* the Financial dimension — different from the cross-dimension weights in section 9):

| Sub-risk | Value | Internal weight | Why this weight |
| --- | --- | --- | --- |
| Credit | 60.0 | **35%** | Most important single financial signal |
| DSO | 59.4 | **20%** | Cash-flow speed matters a lot |
| Debt | 36.0 | **15%** | Important but secondary |
| Margin | 35.0 | **15%** | Important but secondary |
| Trend | 40.0 | **15%** | Important but secondary |

```
Financial = 60.0×0.35 + 59.4×0.20 + 36.0×0.15 + 35.0×0.15 + 40.0×0.15
          = 21.00 + 11.88 +  5.40 +  5.25 +  6.00
          = 49.5  →  49
```

**Financial score = 49 (medium).** Every sub-risk was in the 35–60 range — nothing individually catastrophic, but **nothing healthy either**. That is why the dimension lands in medium, not high.

---

### The other four dimensions — same pattern, different benchmarks

Each dimension repeats Steps A → B → C. Below is what each one measures, its safe zones, and GlobalTech's result. (Formulas match `scoring.py` exactly.)

#### Operational → **79 (high)**

| Metric | Safe zone | Formula logic | GlobalTech raw | Sub-risk |
| --- | --- | --- | --- | --- |
| On-time delivery | ≥ 95% | Each % below 95 costs **9 risk points** | 86% (9% short) | (95−86)×9 = **81** |
| Defect rate | ≤ 2% SLA | Each 1% defect costs **22 risk points** | 4.5% | 4.5×22 = **99** |
| Capacity | 45–92% sweet spot | Above 92%: **8 pts per %** over; below 45%: **2 pts per %** under | 94% (overloaded) | (94−92)×8 = **16** |

**Why ×9 for delivery?** Missing the 95% target by 10 points (85% OTD) should feel very bad (~90 risk). Nine points per missed percent gets you there.

**Why ×22 for defects?** At the 2% SLA limit, risk = 44. At 4.5% (GlobalTech), risk = 99 — more than double the allowed rate is treated as near-catastrophic.

```
Operational = 81×0.40 + 99×0.45 + 16×0.15 = 32.4 + 44.55 + 2.4 = 79
```

Weights inside Operational: **defects 45%** (quality is king), **delivery 40%**, **capacity 15%**.

---

#### Compliance → **72 (high)**

| Metric | Safe zone | Formula logic | GlobalTech raw | Sub-risk |
| --- | --- | --- | --- | --- |
| Certificate | Valid & not expired | Expired: starts at **60 base** + **0.4 per day** expired | expired 47 days ago | 60 + 47×0.4 = **78.8** |
| Violations | 0 per year | Each violation = **28 risk points** | 3 violations | 3×28 = **84** |
| Last audit | ≤ 180 days ago | Each day past 180 = **0.18 risk points** | 412 days ago | (412−180)×0.18 = **41.8** |

**Why start expired certs at 60?** An expired ISO certificate is already a serious compliance failure before counting how long ago it lapsed. The base 60 means "you are already in trouble."

```
Compliance = 78.8×0.50 + 84×0.30 + 41.8×0.20 = 39.4 + 25.2 + 8.4 = 73 → 72
```

Weights inside Compliance: **certificate 50%**, **violations 30%**, **audit recency 20%**.

---

#### Geopolitical → **96 (high) — worst dimension**

| Input | Source | GlobalTech value | How it becomes risk |
| --- | --- | --- | --- |
| Country risk | Looked up from `country: "Myanmar"` | **92 / 100** | Already on 0–100 scale (Myanmar is very high risk) |
| Trade restrictions | `tradeRestrictions: 2` | 2 active restrictions | 2 × 9 = **18** (capped at 40 max) |

```
Geopolitical = 92 × 0.85 + 18 = 78.2 + 18 = 96
```

**Why ×0.85 on country?** Leaves room to add trade-restriction risk on top without always hitting 100. **Why ×9 per restriction?** Each restriction adds meaningful but bounded cost.

---

#### ESG → **63 (medium)**

| Input | Direction | Formula logic | GlobalTech raw | Sub-risk |
| --- | --- | --- | --- | --- |
| E / S / G ratings | Higher = better | Invert: `100 − weighted average` | 55 / 48 / 50 | **48.6** |
| News sentiment | Higher = better | Bad press: `−sentiment × 45` | -0.6 | **27.0** |

ESG ratings are the only raw numbers where **high = good**, so we invert them to risk. Environmental counts 40%, Social 30%, Governance 30%.

```
ESG = 48.6 × 0.75 + 27.0 = 36.5 + 27.0 = 63
```

---

### Combine all five dimensions → Overall score **80**

Dimension scores are done. Now two layers of blending:

**Layer 1 — Cross-dimension weights** (from section 9: Operational 24%, Financial 22%, etc.):

```
Weighted = 49×0.22 + 79×0.24 + 72×0.20 + 96×0.18 + 63×0.16 = 71.5
```

**Layer 2 — Worst-dimension safety net** (35% pull from the single worst score):

```
Overall = round(0.65 × 71.5 + 0.35 × 96) = round(46.5 + 33.6) = 80
```

Without layer 2, a plain average would be **71.8** — understating Myanmar geopolitical risk. Layer 2 pushes it to **80** because one dimension at 96 is too dangerous to dilute.

---

### Final result for GlobalTech

| Dimension | Score | Band | Main reason |
| --- | --- | --- | --- |
| Financial | 49 | Medium | Weak credit + slow cash, but not collapsing |
| Operational | 79 | High | Defects 2× SLA, deliveries 9% below target |
| Compliance | 72 | High | Expired certificate + 3 violations |
| Geopolitical | **96** | High | Myanmar (92) + trade restrictions — **primary driver** |
| ESG | 63 | Medium | Mediocre ratings + bad press |
| **Overall** | **80** | **HIGH** | Worst-dimension blend pulls score above plain average |

Three dimensions are in the danger zone (≥ 70), so GlobalTech raises **multiple critical alerts** — exactly the High-Risk scenario.

---

## 11. The 14 Suppliers at a Glance

The fixtures deliberately span the full risk spectrum, including the three mandated scenarios:

| Supplier | Country | Tier | Profile | Scenario |
| --- | --- | --- | --- | --- |
| **GlobalTech Manufacturing Co** | Myanmar | 1 | Failing on every front, worsening | **HIGH RISK (required)** |
| **Reliable Components Inc** | Germany | 1 | Strong everywhere, stable | **LOW RISK (required)** |
| **Acme Industrial Supplies** | United States | 2 | Medium today, sliding (ESG + news) | **EMERGING RISK (required)** |
| Nordic Steel Forge AS | Norway | 2 | Healthy, slowly improving | Low |
| Shenzhen PCB Works | China | 1 | Moderate; trade-restriction pressure | Medium |
| Iberian Logistics SL | Spain | 3 | Solid logistics provider | Low |
| Tata Polymer Solutions | India | 2 | Decent, mild operational slippage | Medium |
| Alpine Precision GmbH | Switzerland | 1 | Best-in-class across the board | Very low |
| Rio Grande Packaging | Mexico | 3 | Lapsed certificate, thin margins | Medium |
| Kyoto Semiconductor KK | Japan | 1 | Strong, high capacity load | Low |
| British Chemicals Ltd | United Kingdom | 2 | Certificate counting down to expiry | Emerging |
| Brazil AgroFiber SA | Brazil | 3 | Poor ESG, expired cert, worsening | High |
| Hanoi Textile Group | Vietnam | 2 | Acceptable, capacity climbing | Medium |
| Baltic Fasteners Sp. z o.o. | Poland | 3 | Reliable mid-tier supplier | Low |

---

## Summary

- A **fixture** is the fixed starting data the system loads at launch (no database).
- Each supplier has **identity fields** (only `country` affects scoring), a **`raw`** block of real business numbers, and a **`drift`** block describing how those numbers trend over time.
- Every raw metric has a **defined range and a "good" direction**; the engine clamps values to stay realistic.
- **Drift + seed** together produce a repeatable, believable 30-day history and the live changes the agent reacts to.
- The **five dimensions** each score 0–100 from the raw numbers; the **weights** (summing to 1.0) plus a **worst-dimension blend** combine them into the overall risk score.
