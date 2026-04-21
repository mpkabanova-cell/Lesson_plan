import LessonPlanWorkspace from "@/components/LessonPlanWorkspace";

/** Читаем cx на сервере при каждом запросе — переменная из панели хостинга подхватывается без обязательной пересборки. */
export const dynamic = "force-dynamic";

/** Идентификатор CSE (cx): с сервера, без обязательного NEXT_PUBLIC_ — тот же, что для JSON API. */
function getProgrammableSearchCx(): string | undefined {
  const pub = process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim();
  const serverOnly = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim();
  return pub || serverOnly || undefined;
}

export default function Home() {
  return <LessonPlanWorkspace googleProgrammableSearchCx={getProgrammableSearchCx()} />;
}
