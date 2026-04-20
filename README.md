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

## Переменные окружения

См. [.env.example](.env.example).

## Методическая база (KONSTRUKTOR_UROKA)

При генерации плана к системному промпту из интерфейса **на сервере добавляется** текст из [`src/lib/knowledge/konstruktorUroka.md`](src/lib/knowledge/konstruktorUroka.md). В репозитории лежит заготовка; её можно **заменить полным текстом** из PDF.

### Обновить базу из PDF

1. Скопируйте `KONSTRUKTOR_UROKA.pdf` в [`docs/KONSTRUKTOR_UROKA.pdf`](docs/README.md).
2. Выполните:

```bash
npm run extract:knowledge
```

Скрипт использует `pdf-parse` и перезапишет `src/lib/knowledge/konstruktorUroka.md`. Либо отредактируйте `.md` вручную.

### Длинный документ

При необходимости ограничьте размер блока методики переменной **`LESSON_METHODOLOGY_MAX_CHARS`** (см. `.env.example`).

