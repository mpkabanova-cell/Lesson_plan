import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { UxFeedback } from "@/components/analytics/UxFeedback";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Конструктор плана урока",
  description: "Генерация структурированного плана урока с опорой на ФГОС",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans antialiased`}>
        {children}
        <YandexMetrika />
        <UxFeedback />
      </body>
    </html>
  );
}
