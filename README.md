# Конструктор плана урока

Одностраничное приложение на Next.js: параметры урока, структура по типу (ФГОС), генерация через OpenRouter, редактирование плана в WYSIWYG (TipTap), экспорт в Word (.docx).

## Требования

- Node.js 20+
- Ключ [OpenRouter](https://openrouter.ai/)

## Запуск

```bash
cp .env.example .env
# Укажите OPENROUTER_API_KEY и при необходимости OPENROUTER_MODEL

npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

После деплоя на хостинг, если интерфейс «не обновился» (нет кнопки «Предложить цель» и двух блоков промптов), сделайте жёсткое обновление страницы (Ctrl+Shift+R / ⌘+Shift+R) или откройте сайт в режиме инкогнито. Для главной страницы включён заголовок `Cache-Control: no-store`, чтобы реже ловить старый HTML из кэша CDN.

## Переменные окружения

См. [.env.example](.env.example).

## Методическая база (KONSTRUKTOR_UROKA)

При генерации плана к системному промпту из интерфейса **на сервере добавляется** текст из [`src/lib/knowledge/konstruktorUroka.md`](src/lib/knowledge/konstruktorUroka.md). В репозитории лежит заготовка; её можно **заменить полным текстом** из PDF.

**Предметная база (информатика 7–9):** если в параметрах урока выбраны предмет **«Информатика»** и класс **7, 8 или 9**, после блока методики дополнительно подмешивается [`src/lib/knowledge/informatika_7_9.md`](src/lib/knowledge/informatika_7_9.md) (замените содержимое своей рабочей программой). Для классов 10–11 или других предметов этот файл не используется. Имя основного файла методики в репозитории — **`konstruktorUroka.md`** (регистр букв важен на Linux-серверах).

### Обновить базу из PDF

1. Скопируйте `KONSTRUKTOR_UROKA.pdf` в [`docs/KONSTRUKTOR_UROKA.pdf`](docs/README.md).
2. Выполните:

```bash
npm run extract:knowledge
```

Скрипт использует `pdf-parse` и перезапишет `src/lib/knowledge/konstruktorUroka.md`. Либо отредактируйте `.md` вручную.

### Длинный документ

При необходимости ограничьте размер блока методики переменной **`LESSON_METHODOLOGY_MAX_CHARS`** (см. `.env.example`).

## Генерация: два системных промпта в интерфейсе

- **Системный промпт: план** — уходит в `POST /api/generate` как `systemPrompt`. На сервере к нему добавляется **полный** текст методики из `konstruktorUroka.md` (`buildSystemPromptForGeneration`); при «Информатика» и классе 7–9 — ещё и `informatika_7_9.md`.
- **Системный промпт: образовательные результаты** — используется для кнопки «Предложить формулировку» и `POST /api/generate-goal`. К нему на сервере добавляется **только раздел** «Целеполагание и результат» из `konstruktorUroka.md` (`buildGoalSystemPromptForGeneration`); при «Информатика» и классе 7–9 — также `informatika_7_9.md`.

Тело `POST /api/generate-goal`: `{ "systemPrompt", "subject", "grade", "topic", "lessonType" }`. Ответ: `{ "goal": "..." }`.

