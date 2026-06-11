# Конструктор плана урока — событийная разметка (`lpc_*`)

Счётчик: **108472990**. Каждое событие дублируется в `window.dataLayer`.

## Идентификаторы

| Поле | Где | Назначение |
|------|-----|------------|
| `client_id` | URL `?client_id=` + payload событий | ClientID из shell «Пространство экспериментов» |
| `has_client_id` | payload событий | `true`, если `client_id` доступен |

Внешние ссылки (Google fallback, портал 1sept, результаты поиска) дополняются `?client_id=...` через `appendClientId()`.

## Воронка сценария

| Этап | Событие |
|------|---------|
| Инициация | `lpc_scenario_init` |
| Старт | `lpc_scenario_input_start` или `lpc_generate_click` |
| Частичное | `lpc_generation_success` |
| Полное | `lpc_export_docx_success` |

## События

| Событие | Триггер | Код | Воронка |
|---------|---------|-----|---------|
| Инициация сценария | mount workspace | `trackLpcScenarioInit()` | init |
| Старт ввода темы | blur поля «Тема» (1 раз) или chip | `trackLpcScenarioInputStart(...)` | start |
| Клик по chip темы | клик по подсказке | `trackLpcTopicSuggestionClick(...)` | start |
| Предложить цель | кнопка «Помочь сформулировать» | `trackLpcGoalSuggestClick(...)` | start |
| Цель получена | успех suggest goal | `trackLpcGoalSuggestSuccess(...)` | start |
| Переключение этапа | checkbox структуры урока | `trackLpcStageToggle(...)` | — |
| Генерация плана | «Сгенерировать план урока» | `trackLpcGenerateClick(...)` | start |
| План готов | успешная генерация | `trackLpcGenerationSuccess(...)` | partial |
| Ошибка генерации | catch generate | `trackLpcGenerationError(...)` | — |
| Режим просмотра | Блоки / Документ | `trackLpcViewModeSelect(...)` | — |
| Вкладка workspace | План / Материалы | `trackLpcWorkspaceTabSelect(...)` | — |
| Панель параметров | сворачивание/разворачивание | `trackLpcParamsPanelToggle(...)` | — |
| Экспорт Word (клик) | «Скачать Word» | `trackLpcExportDocxClick(...)` | — |
| Экспорт Word (успех) | файл скачан | `trackLpcExportDocxSuccess(...)` | full |
| Перегенерация этапа | modal «Перегенерировать этап» | `trackLpcStageRegenerate(...)` | quality |
| Перегенерация поля | fix/regenerate field | `trackLpcStageFieldRegenerate(...)` | quality |
| Применение приёма | technique picker | `trackLpcTechniqueApply(...)` | quality |
| Поиск материалов | submit поиска | `trackLpcMaterialsSearch(...)` | — |
| Клик по результату | ссылка материала | `trackLpcMaterialsResultClick(...)` | — |
| Google fallback | «Открыть поиск в Google» | `trackLpcMaterialsFallbackGoogle(...)` | — |
| Портал 1sept | «Перейти на портал» | `trackLpcMaterialsPortalClick()` | — |

## UX Feedback (dataLayer)

| Событие | Триггер |
|---------|---------|
| `uxfb_trigger_generation_success` | после `lpc_generation_success` |
| `uxfb_trigger_export_success` | после `lpc_export_docx_success` |

## Пример кода

```typescript
import { trackLpcGenerateClick } from "@/lib/analytics/lpcEvents";

trackLpcGenerateClick({
  subject: "Математика",
  grade: "5",
  lessonType: "new_knowledge",
  duration: 45,
  topicLength: 12,
  goalLength: 80,
  selectedStagesCount: 8,
});
```

Внутри вызывается:

```javascript
ym(108472990, "reachGoal", "lpc_generate_click", {
  lpc_generate_click: { subject: "Математика", grade: "5", ... }
});
window.dataLayer.push({ event: "lpc_generate_click", subject: "Математика", ... });
```

## Файлы реализации

- `src/lib/analytics/metrika.ts` — wrapper `trackEvent`
- `src/lib/analytics/lpcEvents.ts` — typed helpers
- `src/lib/analytics/clientId.ts` — cross-domain `client_id`
- `src/components/analytics/YandexMetrika.tsx` — счётчик
- `src/components/analytics/UxFeedback.tsx` — UXFB widget
