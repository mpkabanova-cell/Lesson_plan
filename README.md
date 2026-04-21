# Конструктор плана урока

Одностраничное приложение на Next.js: параметры урока, структура по типу (ФГОС), генерация через OpenRouter, редактирование плана в WYSIWYG (TipTap), экспорт в Word (.docx).

## Требования

- Node.js 20+
- Ключ [OpenRouter](https://openrouter.ai/)
- Для вкладки **«Поиск материалов»** (поиск по [1sept.ru](https://1sept.ru) через Google) — ключи [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) (см. ниже)

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

В правой колонке доступны вкладки **«Редактор урока»** и **«Поиск материалов»**. Поиск выполняется на сервере через [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview); ключи не попадают в браузер.

Эндпоинт: `POST /api/search-1sept`, тело: `{ "query": string, "subject"?: string, "grade"?: string }`. Ответ: `{ "results": [{ "title", "url", "snippet" }] }`.

К запросу на сервере добавляется ограничение `site:1sept.ru`. Поля «предмет» и «класс» на вкладке поиска при открытии подставляются из формы урока слева (их можно изменить перед поиском).

### Настройка Google (пошагово)

1. **Programmable Search Engine**  
   - Откройте [programmablesearchengine.google.com](https://programmablesearchengine.google.com) и войдите в аккаунт Google.  
   - Создайте поисковую систему: укажите имя, в разделе сайтов добавьте **`1sept.ru`** (при необходимости включите поиск по всему вебу и ограничьте в настройках — для выдачи только с нужного домена достаточно корректно задать сайты в CSE).  
   - После создания откройте **Настройки поисковой системы** и скопируйте **Идентификатор поисковой системы** (Search engine ID) — это значение **`cx`** для API.

2. **Custom Search API в Google Cloud**  
   - В [Google Cloud Console](https://console.cloud.google.com/) создайте проект или выберите существующий.  
   - Включите API **Custom Search API** (APIs & Services → Library → «Custom Search API» → Enable).  
   - Создайте учётные данные: **API key** (APIs & Services → Credentials). Рекомендуется ограничить ключ только Custom Search API.

3. **Переменные окружения**  
   В `.env` (и на Render — Environment) задайте:

   - **`GOOGLE_CUSTOM_SEARCH_API_KEY`** — API key из шага 2.  
   - **`GOOGLE_CUSTOM_SEARCH_ENGINE_ID`** — идентификатор поисковой системы (`cx`) из шага 1.

4. Перезапустите `npm run dev` или redeploy на хостинге.

Бесплатная квота Custom Search API ограничена (до 100 запросов в сутки на бесплатном плане — уточняйте в актуальной документации Google). При превышении лимита API вернёт ошибку; в интерфейсе отобразится сообщение об ошибке поиска.

### Кратко для начинающих: куда вписать ключи локально

1. В корне проекта создайте файл **`.env.local`** (его Git **не** сохраняет в репозиторий — так и должно быть, чтобы ключи не утекли).
2. Добавьте две строки (без кавычек вокруг значений, без пробелов вокруг `=`):

   - `GOOGLE_CUSTOM_SEARCH_API_KEY=` — ключ из Google Cloud → Credentials → API key.
   - `GOOGLE_CUSTOM_SEARCH_ENGINE_ID=` — **Search engine ID** (`cx`) из настроек Programmable Search Engine.

3. Сохраните файл и **полностью перезапустите** `npm run dev` (остановите терминал и запустите снова).
4. Откройте вкладку **«Поиск материалов»**, введите запрос, нажмите **«Найти»**.

Если в браузере или в ответе сервера видите **«Поиск не настроен на сервере: задайте GOOGLE_CUSTOM_SEARCH_API_KEY и GOOGLE_CUSTOM_SEARCH_ENGINE_ID»** — переменные не подхватились: проверьте имя файла (`.env.local`), опечатки в именах переменных и перезапуск dev-сервера.

Если при проверке API приходит **403** с текстом вроде *«This project does not have the access to Custom Search JSON API»* — в [Google Cloud Console](https://console.cloud.google.com/) выберите **тот же проект**, к которому привязан ваш API key, откройте [Custom Search API](https://console.cloud.google.com/apis/library/customsearch.googleapis.com) и нажмите **Enable** (Включить). Без этого поиск работать не будет.

