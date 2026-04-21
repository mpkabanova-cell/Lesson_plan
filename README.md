# Конструктор плана урока

Одностраничное приложение на Next.js: параметры урока, структура по типу (ФГОС), генерация через OpenRouter, редактирование плана в WYSIWYG (TipTap), экспорт в Word (.docx).

## Требования

- Node.js 20+
- Ключ [OpenRouter](https://openrouter.ai/)
- Для вкладки **«Поиск материалов»** — идентификатор [Programmable Search Engine](https://programmablesearchengine.google.com) (`cx`) в переменной **`NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** (см. ниже). Серверный [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) не обязателен.

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

## Поиск материалов (1sept.ru)

В правой колонке доступны вкладки **«Редактор урока»** и **«Поиск материалов»**.

**Основной режим** — встроенный [Programmable Search Element](https://developers.google.com/custom-search/docs/element): строка поиска и выдача Google прямо на странице. Для этого нужен только **идентификатор поисковой системы** (`cx`) из [Programmable Search Engine](https://programmablesearchengine.google.com), в переменной окружения **`NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID`**. Это не Custom Search JSON API: **биллинг в Google Cloud не требуется** для этого сценария.

Ниже на той же вкладке — форма с подстановкой предмета и класса из урока и кнопка **«Открыть в Google (site:1sept.ru)»**: тот же запрос открывается в новой вкладке (ограничение `site:1sept.ru` формируется в URL).

Поля «предмет» и «класс» при переключении на вкладку подставляются из формы урока слева (их можно изменить).

### Настройка Google (пошагово)

1. **Programmable Search Engine**  
   - Откройте [programmablesearchengine.google.com](https://programmablesearchengine.google.com) и войдите в аккаунт Google.  
   - Создайте поисковую систему: укажите имя, в разделе сайтов добавьте **`1sept.ru`**.  
   - Откройте **Настройки поисковой системы** и скопируйте **Идентификатор поисковой системы** (Search engine ID) — это **`cx`**.

2. **Переменные окружения**  
   В `.env.local` (и на Render — Environment) задайте:

   - **`NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** — тот же **`cx`** (без кавычек).  
     На хостинге переменные с префиксом `NEXT_PUBLIC_` подставляются **на этапе сборки** — после добавления переменной сделайте **новый deploy**.

3. Перезапустите `npm run dev` или redeploy на хостинге.

Если встроенный блок не появился — проверьте, что `NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID` задан до сборки и что нет опечатки в `cx`.

### Опционально: серверный поиск (JSON API)

Эндпоинт `POST /api/search-1sept` может возвращать структурированные результаты через [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview). Для этого в `.env` задают **`GOOGLE_CUSTOM_SEARCH_API_KEY`** и **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** (тот же `cx`). Во многих проектах Google требует **привязанный Billing**; без него часто приходит **403** (*This project does not have the access to Custom Search JSON API*). Текущий интерфейс вкладки **не зависит** от этого API — достаточно `NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID` из раздела выше.

