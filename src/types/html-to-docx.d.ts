declare module "html-to-docx" {
  type DocumentOptions = Record<string, unknown>;

  function HTMLtoDOCX(
    html: string,
    headerHTMLString: string | null,
    documentOptions?: DocumentOptions,
    footerHTMLString?: string | null,
  ): Promise<Buffer | ArrayBuffer>;

  export default HTMLtoDOCX;
}
