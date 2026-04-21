# Конструктор плана урока

Одностраничное приложение на Next.js: параметры урока, структура по типу (ФГОС), генерация через OpenRouter, редактирование плана в WYSIWYG (TipTap), экспорт в Word (.docx).

## Требования

- Node.js 20+
- Ключ [OpenRouter](https://openrouter.ai/)
- Для вкладки **«Поиск материалов»** — идентификатор [Programmable Search Engine](https://programmablesearchengine.google.com) (`cx`) в **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** (см. ниже). Серверный [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) для встроенного поиска не обязателен.

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

**Основной режим** — одна форма (запрос, предмет, класс) и кнопка **«Найти»**: строка запроса собирается на клиенте с ограничением **`site:1sept.ru`** (см. `build1septSearchQuery`), затем через [Programmable Search Element](https://developers.google.com/custom-search/docs/element) показывается **выдача со ссылками на этой странице** (блок `searchresults-only` и программный `execute`). Задайте **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** (`cx`) — значение передаётся с сервера, **отдельный `NEXT_PUBLIC_` не обязателен**. Это не Custom Search JSON API: **биллинг в Google Cloud не требуется** для виджета.

В консоли [Programmable Search Engine](https://programmablesearchengine.google.com) в списке сайтов укажите **`1sept.ru`** — так выдача не уйдёт на весь интернет даже при сбое операторов в строке запроса.

Внизу вкладки — необязательная ссылка «тот же поиск в Google», если виджет не загрузился (блокировщики рекламы иногда режут скрипты `cse.google.com`).

Поля «предмет» и «класс» при переключении на вкладку подставляются из формы урока слева (их можно изменить).

### Настройка Google (пошагово)

1. **Programmable Search Engine**  
   - Откройте [programmablesearchengine.google.com](https://programmablesearchengine.google.com) и войдите в аккаунт Google.  
   - Создайте поисковую систему: укажите имя, в разделе сайтов добавьте **`1sept.ru`**.  
   - Откройте **Настройки поисковой системы** и скопируйте **Идентификатор поисковой системы** (Search engine ID) — это **`cx`**.

2. **Переменные окружения**  
   В `.env.local` (и на Render — Environment) задайте:

   - **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** — тот же **`cx`** (без кавычек).  
   - Опционально **`NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** с тем же значением — если по какой-то причине не хотите полагаться на передачу с сервера; для `NEXT_PUBLIC_` значение встраивается в клиент при **сборке**.

3. Перезапустите `npm run dev` или перезапустите сервис на хостинге (главная страница с `force-dynamic` читает `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` при запросе).

Если жёлтое предупреждение не пропало — проверьте имя переменной (`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`), отсутствие лишних пробелов и что в Render переменная добавлена в **Environment** того же сервиса.

### Опционально: серверный поиск (JSON API)

Эндпоинт `POST /api/search-1sept` может возвращать структурированные результаты через [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview). Для этого в `.env` задают **`GOOGLE_CUSTOM_SEARCH_API_KEY`** и **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** (тот же `cx`). Во многих проектах Google требует **привязанный Billing**; без него часто приходит **403** (*This project does not have the access to Custom Search JSON API*). Встроенный виджет на вкладке **не использует** этот API — достаточно `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` из раздела выше.

