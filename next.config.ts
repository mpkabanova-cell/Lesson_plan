import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["html-to-docx"],
  /** Чтобы CDN/браузер не отдавали старый HTML с ссылками на устаревшие чанки после деплоя. */
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
