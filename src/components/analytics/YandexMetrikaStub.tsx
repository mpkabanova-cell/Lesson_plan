import Script from "next/script";

function isAnalyticsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

/** Injects ym queue stub before React hydration so early reachGoal calls are queued. */
export function YandexMetrikaStub() {
  if (!isAnalyticsEnabled()) return null;

  return (
    <Script id="yandex-metrika-stub" strategy="beforeInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
        })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
      `}
    </Script>
  );
}
