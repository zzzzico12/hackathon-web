import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className={`${geist.className} min-h-full flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
