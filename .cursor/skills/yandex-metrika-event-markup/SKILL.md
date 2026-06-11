---
name: yandex-metrika-event-markup
description: Проектирует, документирует и внедряет универсальную событийную разметку через Яндекс Метрику и dataLayer. Use when user asks to define key product events, build event taxonomy, instrument UI actions, map scenarios to funnel stages, or prepare analytics documentation in Markdown/Confluence.
---

# Yandex Metrika Event Markup

## Goal

Create robust event instrumentation for any product interface:

- define key product and scenario events;
- generate clear event contracts;
- implement `ym(..., 'reachGoal', ...)` + `dataLayer.push(...)`;
- keep taxonomy stable for BI funnels;
- produce delivery-ready documentation.

## Input methodology (universal)

When specific project docs are available, use them as context. When they are not available, infer event model using this order:

1. product goal and success metrics;
2. primary user journeys (entry -> activation -> value -> share/export/return);
3. interface affordances (buttons, tabs, forms, modals, search, export);
4. scenario-specific key actions that indicate partial and full completion;
5. required identifiers and cross-domain transitions.

If user provides only a product URL, independently inspect interface behavior, propose event taxonomy, and return implementation-ready markup.

## Required output

### A) If user asks to implement instrumentation in code

Produce:

1. Event contract table: `ui_action -> goal_slug -> params -> scenario_slug -> funnel_stage`.
2. Code changes with event dispatch wrappers.
3. Validation checklist (event fire, payload, BI consistency).
4. Short change log by files.

### B) If user asks to prepare a markup document

Offer and execute one of two branches:

1. `*.md` document in repository/workspace;
2. Confluence page (only if Confluence integration/connection is available).

For both branches include mandatory table with columns:

- `Событие (название + описание триггера)`
- `Скриншот с указанием функционала`
- `Код отправки события`

## Event design patterns (instead of fixed metric list)

Always split event taxonomy into two groups:

1. **Global product events** (shared shell): onboarding, navigation, search, CTA clicks, help/rules, cross-scenario actions.
2. **Scenario events** (feature-specific): events tied to one scenario/use case (can be many, dynamic over time).

For each scenario define:

- initiation criteria;
- partial completion criteria;
- full completion criteria;
- optional quality/feedback trigger.

## Naming and payload conventions

- use stable `snake_case` goal names;
- avoid renaming published goals without migration plan;
- include payload only for meaningful dimensions (selected item, file type, tab, query, etc.);
- do not send empty/undefined/null values.

Recommended naming template:

`<scenario_or_shell>_<verb>_<object>`

Examples:

- `onboarding_pass`
- `select_navigation`
- `active_search_form`
- `worksheet_download_file`

## Implementation rules

### 1) Mandatory wrapper: Yandex Metrika + dataLayer

Every event dispatch must send both:

1. Yandex Metrika goal (`ym(..., 'reachGoal', ...)`)
2. `window.dataLayer.push(...)` event for tag manager/data routing

Use this baseline pattern:

```html
<script>
window.dataLayer = window.dataLayer || [];

function sendActiveSearch(query) {
  ym(108472990,'reachGoal','active_search_form', {
    active_search_form: {
      search_query: query
    }
  });

  window.dataLayer.push({
    event: 'active_search_form',
    search_query: query
  });
}
</script>
```

Adapt function name, goal slug, and payload keys per event contract.

### 2) Counter and call shape

Default counter for this product context: `108472990`.

Call signature:

```javascript
ym(108472990, "reachGoal", goalSlug, payload)
```

### 3) Cross-domain identity linkage

For transitions from main domain `ap-experiment-zone.onrender.com` to external tools/domains, append:

- `client_id=<yandex_clientid>` (use `?` or `&` depending on URL)

### 4) Analytics compatibility guardrails

- keep one canonical `goal_slug` per action;
- keep scenario prefixes consistent;
- preserve backward compatibility for active dashboards where possible;
- avoid counting debug/service traffic in validation.

## How to infer key events from interface

When user gives an interface link:

1. map key UI regions and user intents;
2. identify trigger actions with business meaning (not every click);
3. mark events as global or scenario-specific;
4. define payload keys that explain context;
5. propose partial/full completion logic per scenario;
6. return event table with screenshot references and send-code snippets.

## Validation checklist

- each key action has exactly one primary goal;
- event payload fields are deterministic and non-empty;
- each event has both `ym` and `dataLayer` dispatch;
- cross-domain links include `client_id` where needed;
- smoke test confirms events in network/hits;
- BI reconciliation checks unique users/events by day and scenario stages.

## Delivery template

Return final result in this structure:

1. Event taxonomy (`global` + `scenario`).
2. Event contract table (with screenshots and code).
3. Instrumentation details (`ym` + `dataLayer` wrappers).
4. Cross-domain identity handling.
5. Validation results and known gaps.

## Project-specific: Lesson Plan Constructor (`lpc_*`)

See [`docs/analytics/lpc-event-markup.md`](../../../docs/analytics/lpc-event-markup.md) for the full event contract of this repository.

Implementation entry points:

- [`src/lib/analytics/metrika.ts`](../../../src/lib/analytics/metrika.ts)
- [`src/lib/analytics/lpcEvents.ts`](../../../src/lib/analytics/lpcEvents.ts)
