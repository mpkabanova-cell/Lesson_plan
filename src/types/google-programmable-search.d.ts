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
          };
        };
      };
    };
  }
}
