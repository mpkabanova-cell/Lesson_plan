# Методические материалы

## KONSTRUKTOR_UROKA.pdf

Положите файл **`KONSTRUKTOR_UROKA.pdf`** в эту папку (`docs/KONSTRUKTOR_UROKA.pdf`), затем из корня проекта выполните:

```bash
npm run extract:knowledge
```

Текст будет извлечён в [`src/lib/knowledge/konstruktorUroka.md`](../src/lib/knowledge/konstruktorUroka.md) и подставится в системный промпт при генерации плана (см. корневой README).

Если PDF нет, используется уже закоммиченное содержимое `konstruktorUroka.md` (заготовка или предыдущее извлечение).

## ФРП (федеральные рабочие программы)

PDF положите в [`docs/frp/`](../docs/frp/) (структура по уровням НОО/ООО/СОО — см. [`scripts/frp-config.cjs`](../scripts/frp-config.cjs)). Извлечение и разметка:

```bash
npm run extract:frp
```

Результат: [`src/lib/knowledge/frp/`](../src/lib/knowledge/frp/) (`manifest.json`, `*.md` по предметам, `topics.json`). При генерации плана сервер подбирает фрагмент по предмету, классу и теме урока (`frpResolve.ts` → `frpUsage.ts`) и подмешивает его в системный промпт; для версии 2 краткий контекст ФРП также передаётся планировщику.
