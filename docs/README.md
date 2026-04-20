# Методические материалы

## KONSTRUKTOR_UROKA.pdf

Положите файл **`KONSTRUKTOR_UROKA.pdf`** в эту папку (`docs/KONSTRUKTOR_UROKA.pdf`), затем из корня проекта выполните:

```bash
npm run extract:knowledge
```

Текст будет извлечён в [`src/lib/knowledge/konstruktorUroka.md`](../src/lib/knowledge/konstruktorUroka.md) и подставится в системный промпт при генерации плана (см. корневой README).

Если PDF нет, используется уже закоммиченное содержимое `konstruktorUroka.md` (заготовка или предыдущее извлечение).
