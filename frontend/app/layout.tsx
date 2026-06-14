import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AmplifyProvider } from "@/components/AmplifyProvider";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hackathon Japan - 日本のハッカソンまとめ",
  description:
    "日本で開催されるハッカソンを一覧で探せるサイト。オンライン・オフライン、賞金額、テーマ、初心者向けなどで絞り込めます。",
  openGraph: {
    title: "Hackathon Japan",
    description: "日本のハッカソンをまとめて探せる",
    locale: "ja_JP",
    type: "website",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "HackJP",
    "theme-color": "#2563EB",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className={`${geist.className} min-h-full flex flex-col`}>
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
