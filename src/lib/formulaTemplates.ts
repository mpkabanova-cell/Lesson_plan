/** Шаблоны LaTeX для конструктора: пользователь заменяет буквы-заглушки, не пишет команды с нуля. */

export type FormulaTemplate = {
  /** Крупный символ в кнопке */
  symbol: string;
  /** Подпись на русском */
  label: string;
  /** LaTeX для KaTeX (обратный слэш одинарный — как в строке для рендера) */
  latex: string;
};

export const FORMULA_TEMPLATES: FormulaTemplate[] = [
  { symbol: "a/b", label: "Дробь", latex: "\\frac{a}{b}" },
  { symbol: "xⁿ", label: "Степень", latex: "x^{n}" },
  { symbol: "xᵢ", label: "Индекс", latex: "x_{i}" },
  { symbol: "√x", label: "Корень", latex: "\\sqrt{x}" },
  { symbol: "ⁿ√x", label: "Корень n-й", latex: "\\sqrt[n]{x}" },
  { symbol: "∫", label: "Интеграл", latex: "\\int_{a}^{b} f(x)\\,dx" },
  { symbol: "Σ", label: "Сумма", latex: "\\sum_{i=1}^{n} a_i" },
  { symbol: "lim", label: "Предел", latex: "\\lim_{x \\to 0} f(x)" },
  { symbol: "Π", label: "Произведение", latex: "\\prod_{i=1}^{n} a_i" },
  { symbol: "∞", label: "Бесконечность", latex: "\\infty" },
  { symbol: "±", label: "Плюс-минус", latex: "\\pm" },
  { symbol: "≠", label: "Не равно", latex: "\\neq" },
  { symbol: "≤", label: "Меньше или равно", latex: "\\leq" },
  { symbol: "≥", label: "Больше или равно", latex: "\\geq" },
  { symbol: "α", label: "Альфа", latex: "\\alpha" },
  { symbol: "β", label: "Бета", latex: "\\beta" },
  { symbol: "γ", label: "Гамма", latex: "\\gamma" },
  { symbol: "Δ", label: "Дельта", latex: "\\Delta" },
  { symbol: "π", label: "Пи", latex: "\\pi" },
  { symbol: "sin", label: "Синус", latex: "\\sin x" },
  { symbol: "cos", label: "Косинус", latex: "\\cos x" },
  { symbol: "tan", label: "Тангенс", latex: "\\tan x" },
  { symbol: "log", label: "Логарифм", latex: "\\log_{a} x" },
  { symbol: "ln", label: "Натур. лог.", latex: "\\ln x" },
];
