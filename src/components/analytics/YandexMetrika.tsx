"use client";

import Script from "next/script";
import { METRIKA_COUNTER_ID } from "@/lib/analytics/metrika";

function getCounterId(): number {
  const raw = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  if (!raw) return METRIKA_COUNTER_ID;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : METRIKA_COUNTER_ID;
}

function isAnalyticsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

export function YandexMetrika() {
  if (!isAnalyticsEnabled()) return null;

  const counterId = getCounterId();

  return (
    <>
      <Script id="yandex-metrika-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
          ym(${counterId}, "init", {
            clickmap:true,
            trackLinks:true,
            accurateTrackBounce:true,
            webvisor:true
          });
        `}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${counterId}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
