# Конструктор плана урока

Одностраничное приложение на Next.js: параметры урока, структура по типу (ФГОС), генерация через OpenRouter, редактирование плана в WYSIWYG (TipTap), экспорт в Word и PDF.

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

## Экспорт PDF

PDF строится через Puppeteer (Chromium). На сервере без дисплея могут понадобиться флаги `--no-sandbox` (уже указаны в коде) и установленные системные зависимости Chromium.

## Переменные окружения

См. [.env.example](.env.example).
