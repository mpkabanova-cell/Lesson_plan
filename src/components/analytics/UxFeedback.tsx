"use client";

import Script from "next/script";

const DEFAULT_UXFB_WIDGET_ID = "nqn3hkbdzgrmumcqls7y36k1";

function getWidgetId(): string {
  return process.env.NEXT_PUBLIC_UXFB_WIDGET_ID?.trim() || DEFAULT_UXFB_WIDGET_ID;
}

function isAnalyticsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

export function UxFeedback() {
  if (!isAnalyticsEnabled()) return null;

  const widgetId = getWidgetId();

  return (
    <Script id="uxfeedback-init" strategy="afterInteractive">
      {`
        (function(w, d, u, h, s) {
          w._uxsSettings = { id: '${widgetId}' };
          h = d.getElementsByTagName('head')[0];
          s = d.createElement('script');
          s.async = 1;
          s.src = u;
          h.appendChild(s);
        })(window, document, 'https://cdn.uxfeedback.ru/widget.js');
      `}
    </Script>
  );
}
