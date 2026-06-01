/**
 * Programmable Search Element (cse.js) добавляет window.google.search.cse.element.
 * @see https://developers.google.com/custom-search/docs/element
 */
export {};

declare global {
  interface Window {
    google?: {
      search?: {
        cse?: {
          element?: {
            getElement: (gname: string) => { execute: (query: string) => void } | null | undefined;
            /** Рендерит все элементы `.gcse-*` внутри контейнера (нужно после ручного добавления в DOM). */
            go?: (container?: Element | null) => void;
            /** Явный рендер по id контейнера (fallback, если go не зарегистрировал виджет). */
            render?: (config: { div: string; tag: string }) => void;
            getAllElements?: () => Record<string, unknown>;
          };
        };
      };
    };
  }
}
