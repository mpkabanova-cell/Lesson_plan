# Конструктор плана урока — сценарии, критерии и события (`lpc_*`)

Единый файл разметки для сценария **Lesson Plan Constructor / Конструктор плана урока**.

Счётчик Яндекс Метрики: **108472990**.

Каналы отправки:

- Яндекс Метрика: `ym(108472990, "reachGoal", goal_slug, { [goal_slug]: payload })`;
- `window.dataLayer.push({ event: goal_slug, ...payload })`;
- UX Feedback: отдельные `dataLayer`-триггеры после ключевых успешных действий.

## 1. Нейминг сценариев

| Scenario slug | Название сценария | Назначение | Правило нейминга событий |
|---------------|-------------------|------------|--------------------------|
| `lpc_lesson_plan_constructor` | Конструктор плана урока | Основной пользовательский путь: ввод параметров → генерация → экспорт | Все события начинаются с `lpc_lesson_plan_constructor_` |
| `lpc_goal_suggestion` | Формулировка цели урока | Помощь пользователю в заполнении образовательной цели | Все события начинаются с `lpc_goal_suggestion_` |
| `lpc_result_editing` | Редактирование и улучшение результата | Доработка сгенерированного структурированного плана | Все события начинаются с `lpc_result_editing_` |
| `lpc_workspace_navigation` | Навигация по рабочей области | Переключение вкладок и панели параметров | Все события начинаются с `lpc_workspace_navigation_` |
| `lpc_materials_search` | Поиск материалов к уроку | Подбор внешних материалов и переходы к ним | Все события начинаются с `lpc_materials_search_` |
| `lpc_ux_feedback` | UX Feedback | Триггеры для показа форм обратной связи | Все события начинаются с `lpc_ux_feedback_` |

Правило нейминга целей: `{scenario_slug}_{verb}_{object}`. У каждого сценария свой уникальный slug в начале каждого события.

## 2. Идентификаторы и атрибуция

| Поле | Где используется | Назначение | Статус |
|------|------------------|------------|--------|
| `client_id` | URL `?client_id=` + payload событий | Связка с пользователем из shell «Пространство экспериментов» | Встроено |
| `has_client_id` | payload всех `lpc_*` событий | Флаг наличия `client_id` | Встроено |

Поведение:

- `client_id` читается из query string `?client_id=...`;
- сохраняется в `sessionStorage` под ключом `lpc_client_id`;
- добавляется в payload через `withClientId()`;
- добавляется во внешние ссылки через `appendClientId()` для Google fallback, портала 1sept и результатов поиска.

## 3. Критерии воронки

| Funnel stage | BI-смысл | Критерий | События |
|--------------|----------|----------|---------|
| `init` | Пользователь открыл основной сценарий | Mount рабочей области конструктора | `lpc_lesson_plan_constructor_init` |
| `start` | Пользователь начал основной сценарий | Ввёл/выбрал тему или нажал генерацию | `lpc_lesson_plan_constructor_input_start`, `lpc_lesson_plan_constructor_generate_click` |
| `partial` | Пользователь получил первую ценность | План успешно сгенерирован | `lpc_lesson_plan_constructor_generation_success` |
| `full` | Пользователь забрал готовый результат | Word-файл успешно скачан | `lpc_lesson_plan_constructor_export_docx_success` |
| `quality` | Пользователь улучшает результат | Перегенерация, исправление поля, применение приёма | `lpc_result_editing_stage_regenerate`, `lpc_result_editing_stage_field_regenerate`, `lpc_result_editing_technique_apply` |
| `materials` | Пользователь подбирает дополнительные материалы | Поиск или переход по внешнему материалу | `lpc_materials_search_submit`, `lpc_materials_search_result_click` |
| `feedback` | Можно запросить обратную связь | Успех генерации или экспорта | `lpc_ux_feedback_generation_success`, `lpc_ux_feedback_export_success` |

Канонический полный успех основного сценария: `lpc_lesson_plan_constructor_export_docx_success`.

Канонический частичный успех основного сценария: `lpc_lesson_plan_constructor_generation_success`.

## 4. Сценарии и критерии

### 4.1. `lpc_lesson_plan_constructor` — Конструктор плана урока

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_lesson_plan_constructor_init` | Пользователь открыл рабочую область конструктора |
| Старт | `lpc_lesson_plan_constructor_input_start` или `lpc_lesson_plan_constructor_generate_click` | Пользователь ввёл/выбрал тему или нажал генерацию |
| Частичное прохождение | `lpc_lesson_plan_constructor_generation_success` | План успешно создан и показан пользователю |
| Полное прохождение | `lpc_lesson_plan_constructor_export_docx_success` | Пользователь скачал готовый план в Word |

События сценария:

| goal_slug | Триггер |
|-----------|---------|
| `lpc_lesson_plan_constructor_init` | Mount `LessonPlanWorkspace` |
| `lpc_lesson_plan_constructor_input_start` | Blur поля «Тема» с непустым значением; также выбор chip |
| `lpc_lesson_plan_constructor_topic_suggestion_click` | Клик по подсказке темы |
| `lpc_lesson_plan_constructor_stage_toggle` | Checkbox этапа урока |
| `lpc_lesson_plan_constructor_generate_click` | Кнопка «Сгенерировать план урока» |
| `lpc_lesson_plan_constructor_generation_success` | План успешно создан и загружен в редактор |
| `lpc_lesson_plan_constructor_generation_error` | Ошибка генерации |
| `lpc_lesson_plan_constructor_export_docx_click` | Клик «Скачать Word» |
| `lpc_lesson_plan_constructor_export_docx_success` | Word-файл скачан |

### 4.2. `lpc_goal_suggestion` — Формулировка цели урока

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_goal_suggestion_click` | Пользователь нажал кнопку помощи с целью |
| Полное прохождение | `lpc_goal_suggestion_success` | Формулировка цели успешно получена и подставлена |

События сценария:

| goal_slug | Триггер |
|-----------|---------|
| `lpc_goal_suggestion_click` | Кнопка «Помочь сформулировать» |
| `lpc_goal_suggestion_success` | Цель успешно получена |

### 4.3. `lpc_result_editing` — Редактирование и улучшение результата

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_result_editing_view_mode_select` | Пользователь начал работу с результатом через режим просмотра |
| Частичное прохождение | `lpc_result_editing_stage_field_regenerate` или `lpc_result_editing_technique_apply` | Пользователь улучшил отдельное поле или применил приём |
| Полное прохождение | `lpc_result_editing_stage_regenerate` | Пользователь полностью перегенерировал этап |

События сценария:

| goal_slug | Триггер |
|-----------|---------|
| `lpc_result_editing_view_mode_select` | Переключатель «Блоки / Документ» |
| `lpc_result_editing_stage_regenerate` | Успешная перегенерация этапа |
| `lpc_result_editing_stage_field_regenerate` | Успешное исправление или перегенерация поля |
| `lpc_result_editing_technique_apply` | Успешное применение методического приёма |

### 4.4. `lpc_workspace_navigation` — Навигация по рабочей области

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_workspace_navigation_tab_select` или `lpc_workspace_navigation_params_panel_toggle` | Пользователь переключил вкладку или панель |
| Полное прохождение | Не применяется | Навигационный сценарий не имеет «успеха», используется как поведенческий сигнал |

События сценария:

| goal_slug | Триггер |
|-----------|---------|
| `lpc_workspace_navigation_tab_select` | Вкладка «План урока / Поиск материалов» |
| `lpc_workspace_navigation_params_panel_toggle` | Сворачивание/разворачивание панели параметров |

### 4.5. `lpc_materials_search` — Поиск материалов к уроку

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_materials_search_submit` | Пользователь запустил поиск материалов |
| Частичное прохождение | `lpc_materials_search_submit` с `results_count > 0` | Поиск вернул материалы |
| Полное прохождение | `lpc_materials_search_result_click` | Пользователь перешёл к найденному материалу |
| Альтернативное завершение | `lpc_materials_search_fallback_google_click` или `lpc_materials_search_portal_click` | Пользователь ушёл в ручной поиск |

События сценария:

| goal_slug | Триггер |
|-----------|---------|
| `lpc_materials_search_submit` | Успешное завершение поиска материалов, включая 0 результатов |
| `lpc_materials_search_result_click` | Клик по найденному материалу |
| `lpc_materials_search_fallback_google_click` | Клик «Открыть поиск в Google» |
| `lpc_materials_search_portal_click` | Клик «Перейти на портал» |

### 4.6. `lpc_ux_feedback` — UX Feedback

| Критерий | Событие | Условие |
|----------|---------|---------|
| Инициация | `lpc_ux_feedback_generation_success` или `lpc_ux_feedback_export_success` | Код отправил dataLayer-триггер для формы |
| Полное прохождение | Не фиксируется в этом репозитории | Отправка формы настраивается на стороне UXFB |

События сценария:

| dataLayer event | Триггер |
|-----------------|---------|
| `lpc_ux_feedback_generation_success` | После успешной генерации плана |
| `lpc_ux_feedback_export_success` | После успешного скачивания Word |

## 5. События и payload

| Scenario slug | Funnel stage | goal_slug / event | Триггер | Payload | Реализация | Статус сверки |
|---------------|--------------|-------------------|---------|---------|------------|---------------|
| `lpc_lesson_plan_constructor` | `init` | `lpc_lesson_plan_constructor_init` | Mount `LessonPlanWorkspace` | `scenario_slug`, `client_id?`, `has_client_id` | `trackLpcScenarioInit()` | OK |
| `lpc_lesson_plan_constructor` | `start` | `lpc_lesson_plan_constructor_input_start` | Blur поля «Тема» с непустым значением; также выбор chip | `scenario_slug`, `input_source`, `topic_length`, `subject`, `grade`, `lesson_type`, `client_id?`, `has_client_id` | `trackLpcScenarioInputStart(...)` | OK |
| `lpc_lesson_plan_constructor` | `start` | `lpc_lesson_plan_constructor_topic_suggestion_click` | Клик по подсказке темы | `scenario_slug`, `topic`, `subject`, `grade`, `client_id?`, `has_client_id` | `trackLpcTopicSuggestionClick(...)` | OK |
| `lpc_goal_suggestion` | `init/full` | `lpc_goal_suggestion_click` | Кнопка «Помочь сформулировать» | `scenario_slug`, `subject`, `grade`, `lesson_type`, `client_id?`, `has_client_id` | `trackLpcGoalSuggestClick(...)` | OK |
| `lpc_goal_suggestion` | `full` | `lpc_goal_suggestion_success` | Цель успешно получена | `scenario_slug`, `subject`, `grade`, `goal_length`, `client_id?`, `has_client_id` | `trackLpcGoalSuggestSuccess(...)` | OK |
| `lpc_lesson_plan_constructor` | `start` | `lpc_lesson_plan_constructor_stage_toggle` | Checkbox этапа урока | `scenario_slug`, `stage_id`, `enabled`, `selected_stages_count`, `client_id?`, `has_client_id` | `trackLpcStageToggle(...)` | OK |
| `lpc_lesson_plan_constructor` | `start` | `lpc_lesson_plan_constructor_generate_click` | Кнопка «Сгенерировать план урока» | `scenario_slug`, `subject`, `grade`, `lesson_type`, `duration`, `topic_length`, `goal_length`, `selected_stages_count`, `client_id?`, `has_client_id` | `trackLpcGenerateClick(...)` | OK |
| `lpc_lesson_plan_constructor` | `partial` | `lpc_lesson_plan_constructor_generation_success` | План успешно создан и загружен в редактор | `scenario_slug`, `subject`, `grade`, `lesson_type`, `generation_version`, `stages_count`, `duration_ms`, `client_id?`, `has_client_id` | `trackLpcGenerationSuccess(...)` | OK |
| `lpc_lesson_plan_constructor` | `error` | `lpc_lesson_plan_constructor_generation_error` | Ошибка генерации | `scenario_slug`, `subject`, `grade`, `error_message`, `client_id?`, `has_client_id` | `trackLpcGenerationError(...)` | OK |
| `lpc_result_editing` | `init` | `lpc_result_editing_view_mode_select` | Переключатель «Блоки / Документ» | `scenario_slug`, `view_mode`, `client_id?`, `has_client_id` | `trackLpcViewModeSelect(...)` | OK |
| `lpc_workspace_navigation` | `navigation` | `lpc_workspace_navigation_tab_select` | Вкладка «План урока / Поиск материалов» | `scenario_slug`, `tab`, `client_id?`, `has_client_id` | `trackLpcWorkspaceTabSelect(...)` | OK |
| `lpc_workspace_navigation` | `navigation` | `lpc_workspace_navigation_params_panel_toggle` | Сворачивание/разворачивание панели параметров | `scenario_slug`, `collapsed`, `client_id?`, `has_client_id` | `trackLpcParamsPanelToggle(...)` | OK |
| `lpc_lesson_plan_constructor` | `full_candidate` | `lpc_lesson_plan_constructor_export_docx_click` | Клик «Скачать Word» | `scenario_slug`, `export_source`, `subject`, `grade`, `client_id?`, `has_client_id` | `trackLpcExportDocxClick(...)` | OK |
| `lpc_lesson_plan_constructor` | `full` | `lpc_lesson_plan_constructor_export_docx_success` | Word-файл скачан | `scenario_slug`, `export_source`, `title_length`, `client_id?`, `has_client_id` | `trackLpcExportDocxSuccess(...)` | OK |
| `lpc_result_editing` | `full` | `lpc_result_editing_stage_regenerate` | Успешная перегенерация этапа | `scenario_slug`, `stage_id`, `stage_index`, `client_id?`, `has_client_id` | `trackLpcStageRegenerate(...)` | OK |
| `lpc_result_editing` | `partial` | `lpc_result_editing_stage_field_regenerate` | Успешное исправление или перегенерация поля | `scenario_slug`, `stage_id`, `field`, `mode`, `client_id?`, `has_client_id` | `trackLpcStageFieldRegenerate(...)` | OK |
| `lpc_result_editing` | `partial` | `lpc_result_editing_technique_apply` | Успешное применение методического приёма | `scenario_slug`, `stage_id`, `technique_id`, `technique_name`, `client_id?`, `has_client_id` | `trackLpcTechniqueApply(...)` | OK |
| `lpc_materials_search` | `init/partial` | `lpc_materials_search_submit` | Успешное завершение поиска материалов, включая 0 результатов | `scenario_slug`, `query_length`, `subject`, `grade`, `results_count`, `client_id?`, `has_client_id` | `trackLpcMaterialsSearch(...)` | OK |
| `lpc_materials_search` | `full` | `lpc_materials_search_result_click` | Клик по найденному материалу | `scenario_slug`, `url_host`, `result_index`, `subject`, `grade`, `client_id?`, `has_client_id` | `trackLpcMaterialsResultClick(...)` | OK |
| `lpc_materials_search` | `alternative_full` | `lpc_materials_search_fallback_google_click` | Клик «Открыть поиск в Google» | `scenario_slug`, `query_length`, `client_id?`, `has_client_id` | `trackLpcMaterialsFallbackGoogle(...)` | OK |
| `lpc_materials_search` | `alternative_full` | `lpc_materials_search_portal_click` | Клик «Перейти на портал» | `scenario_slug`, `client_id?`, `has_client_id` | `trackLpcMaterialsPortalClick()` | OK |
| `lpc_ux_feedback` | `init` | `lpc_ux_feedback_generation_success` | После `lpc_lesson_plan_constructor_generation_success` | `scenario_slug`, `subject`, `grade`, `generation_version`, `client_id?`, `has_client_id` | `trackUxfbTrigger(...)` | OK |
| `lpc_ux_feedback` | `init` | `lpc_ux_feedback_export_success` | После `lpc_lesson_plan_constructor_export_docx_success` | `scenario_slug`, `export_source`, `client_id?`, `has_client_id` | `trackUxfbTrigger(...)` | OK |

## 6. Паттерн отправки

Пример вызова:

```typescript
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

Фактическая отправка внутри wrapper:

```javascript
ym(108472990, "reachGoal", "lpc_lesson_plan_constructor_generate_click", {
  lpc_lesson_plan_constructor_generate_click: {
    scenario_slug: "lpc_lesson_plan_constructor",
    subject: "Математика",
    grade: "5",
    lesson_type: "new_knowledge",
    duration: 45,
    topic_length: 12,
    goal_length: 80,
    selected_stages_count: 8,
    has_client_id: false
  }
});

window.dataLayer.push({
  event: "lpc_lesson_plan_constructor_generate_click",
  scenario_slug: "lpc_lesson_plan_constructor",
  subject: "Математика",
  grade: "5",
  lesson_type: "new_knowledge",
  duration: 45,
  topic_length: 12,
  goal_length: 80,
  selected_stages_count: 8,
  has_client_id: false
});
```

Правила payload:

- пустые строки, `null` и `undefined` отфильтровываются в `sanitizePayload()`;
- `scenario_slug` передаётся в каждом событии;
- `client_id` добавляется только если найден в URL или `sessionStorage`;
- `has_client_id` добавляется всегда;
- для ошибок `error_message` обрезается до 200 символов.

## 7. UX Feedback

Виджет UXFB подключён с id `nqn3hkbdzgrmumcqls7y36k1`.

Формы обратной связи должны настраиваться на стороне UXFB по `dataLayer`-событиям:

| dataLayer event | Когда отправляется | Зачем |
|-----------------|--------------------|-------|
| `lpc_ux_feedback_generation_success` | После успешной генерации плана | Спросить качество первого результата |
| `lpc_ux_feedback_export_success` | После успешного скачивания Word | Спросить качество итогового результата |

## 8. Сверка с кодом

Проверено по файлам:

- `src/lib/analytics/lpcEvents.ts`;
- `src/lib/analytics/metrika.ts`;
- `src/lib/analytics/clientId.ts`;
- `src/components/LessonPlanWorkspace.tsx`;
- `src/components/lessonStageConstructor/LessonStageConstructor.tsx`;
- `src/components/materialsSearch/MaterialsSearchTab.tsx`.

Итог сверки:

| Проверка | Результат |
|----------|-----------|
| У каждого сценария есть уникальный `scenario_slug` | OK |
| Каждый `goal_slug` начинается со своего `scenario_slug` | OK |
| У каждого сценария есть собственный набор событий | OK |
| У каждого сценария описаны критерии | OK |
| Есть 21 продуктовая цель `lpc_*` | OK |
| Есть 2 UXFB dataLayer-триггера с префиксом `lpc_ux_feedback_*` | OK |
| Каждый `lpc_*` отправляется через typed helper из `lpcEvents.ts` | OK |
| `ym(..., "reachGoal", ...)` и `dataLayer.push(...)` централизованы в wrapper | OK |
| `client_id` сохраняется и добавляется в payload | OK |
| Внешние ссылки материалов получают `client_id` | OK |
| Критерии `init → start → partial → full` определены | OK |

## 9. Известные ограничения

- Для `lpc_*` сейчас нет `POST /api/events` custom collector: в этом репозитории такой endpoint отсутствует.
- UXFB-формы должны быть настроены в админке UXFB отдельно; код отправляет только триггеры.
- `lpc_materials_search` фиксирует успешное завершение поиска, включая 0 результатов; отдельной цели ошибки поиска пока нет.
