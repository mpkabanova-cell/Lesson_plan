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
