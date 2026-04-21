export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type MaterialsSearchStatus = "idle" | "loading" | "success" | "empty" | "error";
