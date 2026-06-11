# Интервью сквозь время — сценарии и события

Счётчик Яндекс Метрики: **108472990**.

Все цели должны отправляться в Яндекс Метрику через `ym(..., "reachGoal", ...)` и дублироваться в custom event collector `POST /api/events` с тем же `event_type`.

## Идентификаторы атрибуции

| Поле | Где используется | Сторона | Назначение |
|------|------------------|---------|------------|
| `client_id` | URL `?client_id=` + события | учитель | Yandex Metrika ClientID учителя при копировании ссылки |
| `link_id` | URL `?link_id=` + события | учитель / ученик | UUID v4 на каждое копирование; связывает рассылку учителя с действиями учеников |
| `visitor_id` | `sessionStorage` (`ez_itt_visitor_{link_id}`) + события | ученик | UUID ученической сессии для конкретной ссылки |
| `name` | URL `?name=` | учитель → PDF | Имя ученика в PDF; на сервер в событиях не передаётся |

Формат ссылки:

```text
/interview/{persona_id}?link_id={uuid}&client_id={ym_client_id}&name={имя}
```

`name` добавляется только при копировании варианта «Ссылка с именем».

## Сценарий 1. Учитель копирует ссылку

### Цель сценария

Учитель создаёт отслеживаемую ссылку для ученика. Дальнейшие ученические действия связываются с этой рассылкой через `link_id` и `teacher_client_id`.

### Воронка

| Этап | Событие | Условие |
|------|---------|---------|
| Инициация | `itt_link_copied` | Учитель копирует ссылку |
| Частичное | Есть хотя бы одно ученическое событие с тем же `link_id` | Ученик открыл или начал сценарий |
| Полное | `itt_reflection_submitted` с тем же `link_id` | Хотя бы один ученик отправил наблюдения |

### События

| Событие | Триггер | Payload |
|---------|---------|---------|
| `itt_link_copied` | Скопирована ссылка для ученика | `link_id`, `client_id`, `persona_id`, `with_name` |

Пример:

```javascript
ym(108472990, "reachGoal", "itt_link_copied", {
  itt_link_copied: {
    link_id: "...",
    client_id: "...",
    persona_id: "...",
    with_name: false
  }
});
```

## Сценарий 2. Ученик проходит интервью

### Цель сценария

Ученик открывает ссылку, знакомится с брифом, проходит чат-интервью, заполняет наблюдения и при необходимости скачивает PDF.

### Воронка

| Этап | Событие | Условие |
|------|---------|---------|
| Инициация | `itt_link_opened` | Ученик открыл ссылку |
| Старт | `itt_chat_started` | Ученик начал интервью |
| Прогресс | `itt_message_sent` | Ученик отправляет сообщения |
| Частичное | `itt_chat_completed` | Диалог завершён, переход к наблюдениям |
| Полное | `itt_reflection_submitted` | Наблюдения отправлены |
| Дополнительная вовлечённость | `itt_pdf_downloaded` | Ученик скачал PDF |

### Общие поля ученических событий

Если ученик пришёл по ссылке с `link_id`, в событиях передаются:

| Поле | Источник |
|------|----------|
| `link_id` | query string |
| `teacher_client_id` | query string `client_id` |
| `visitor_id` | `sessionStorage` |
| `persona_id` | route param |
| `with_name_hint` | `true`, если в URL есть `?name=`, без передачи самого имени |

Старые ссылки без `link_id` продолжают работать: в событиях `link_id: null`, `teacher_client_id` и `visitor_id` могут отсутствовать.

### События

| Событие | Триггер | Payload |
|---------|---------|---------|
| `itt_link_opened` | Открыта ученическая ссылка | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |
| `itt_brief_viewed` | Просмотрен бриф перед интервью | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |
| `itt_chat_started` | Начато интервью | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |
| `itt_message_sent` | Отправлено сообщение ученика | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id`, `message_index`, `messages_remaining` |
| `itt_chat_completed` | Завершён диалог, переход к наблюдениям | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |
| `itt_reflection_started` | Открыта форма наблюдений | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |
| `itt_reflection_submitted` | Отправлены наблюдения | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id`, `reflection_length` |
| `itt_pdf_downloaded` | Скачан PDF | `link_id`, `visitor_id`, `teacher_client_id`, `persona_id` |

Пример ученического события:

```javascript
ym(108472990, "reachGoal", "itt_message_sent", {
  itt_message_sent: {
    link_id: "...",
    visitor_id: "...",
    teacher_client_id: "...",
    persona_id: "...",
    message_index: 1,
    messages_remaining: 5
  }
});
```

## Перевёрнутая воронка учителя

Обычная воронка «один пользователь → один финал» здесь не подходит: одна учительская ссылка (`link_id`) может породить много ученических сессий (`visitor_id`).

```text
Учитель: itt_link_copied (link_id, client_id)
    ↓
Ученики: itt_link_opened → itt_chat_started → itt_reflection_submitted
```

Успех для учителя: есть хотя бы одно событие `itt_reflection_submitted` с тем же `link_id`, что в `itt_link_copied`, и с тем же `teacher_client_id`.

`itt_pdf_downloaded` — дополнительный сигнал вовлечённости, но не обязательный критерий полного прохождения.

## SQL для custom collector

```sql
WITH copies AS (
  SELECT
    metadata->>'link_id' AS link_id,
    metadata->>'client_id' AS teacher_client_id,
    created_at
  FROM events
  WHERE event_type = 'itt_link_copied'
    AND metadata->>'link_id' IS NOT NULL
),
completions AS (
  SELECT DISTINCT metadata->>'link_id' AS link_id
  FROM events
  WHERE event_type = 'itt_reflection_submitted'
    AND metadata->>'link_id' IS NOT NULL
)
SELECT c.link_id, c.teacher_client_id, c.created_at
FROM copies c
INNER JOIN completions f ON f.link_id = c.link_id;
```

## Анализ отвала в диалоге

Отвал внутри интервью считать по `itt_message_sent`:

- группировать по `link_id`;
- внутри `link_id` группировать по `visitor_id`;
- смотреть распределение `message_index` и `messages_remaining`.

## Не внедрено, но предложено

| Идея | Зачем |
|------|-------|
| `itt_chat_abandoned` при уходе со страницы в незавершённом чате | Оценка отвала; лучше вводить с порогом, например после двух сообщений |
| Сегмент Метрики «учитель с активацией» | `itt_link_copied` + EXISTS `itt_reflection_submitted` с тем же `teacher_client_id` |
