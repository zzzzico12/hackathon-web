"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trophy, CheckCircle2, FileText, ChevronRight, LogIn } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { useUserData } from "@/lib/useUserData";
import { HackathonCard } from "@/components/HackathonCard";
import type { Hackathon } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function fetchHackathonById(sourceId: string): Promise<Hackathon | null> {
  const res = await fetch(`${API}/hackathons/${encodeURIComponent(sourceId)}`).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}

type Section = "FAV" | "DONE" | "APPLIED";

const SECTIONS: {
  type: Section;
  label: string;
  Icon: React.ElementType;
  statBg: string;
  statText: string;
  headerColor: string;
}[] = [
  {
    type: "FAV",
    label: "お気に入り",
    Icon: Heart,
    statBg: "bg-red-500",
    statText: "text-white",
    headerColor: "text-red-600",
  },
  {
    type: "APPLIED",
    label: "応募済み",
    Icon: CheckCircle2,
    statBg: "bg-emerald-600",
    statText: "text-white",
    headerColor: "text-emerald-700",
  },
  {
    type: "DONE",
    label: "参加済み",
    Icon: Trophy,
    statBg: "bg-purple-600",
    statText: "text-white",
    headerColor: "text-purple-700",
  },
];

export default function MyPage() {
  const { user, name, loading: authLoading, signIn } = useAuth();
  const userData = useUserData(!!user);
  const [hackathons, setHackathons] = useState<Record<string, Hackathon>>({});

  useEffect(() => {
    if (!user || userData.loading) return;
    const allIds = new Set([
      ...userData.FAV,
      ...userData.DONE,
      ...userData.APPLIED,
      ...userData.NOTES.keys(),
    ]);
    const missing = [...allIds].filter((id) => !hackathons[id]);
    if (!missing.length) return;

    Promise.all(
      missing.map((id) => fetchHackathonById(id).then((h) => ({ id, h })))
    ).then((results) => {
      setHackathons((prev) => {
        const next = { ...prev };
        for (const { id, h } of results) if (h) next[id] = h;
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userData.loading, userData.FAV.size, userData.DONE.size, userData.APPLIED.size]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-5 px-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
            <LogIn size={28} className="text-blue-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">マイページ</p>
            <p className="text-sm text-gray-500 mt-1">ログインしてお気に入りや参加予定を管理しましょう</p>
          </div>
          <button
            onClick={signIn}
            className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Googleでログイン
          </button>
          <div>
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
              ← 一覧に戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const noteEntries = [...userData.NOTES.entries()].filter(([, body]) => body);
  const totalItems =
    userData.FAV.size + userData.DONE.size + userData.APPLIED.size + noteEntries.length;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline shrink-0">
            ← 一覧に戻る
          </Link>
          <h1 className="text-lg font-bold text-gray-900">マイページ</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Profile + Stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5">
            <p className="text-white/80 text-sm">ようこそ</p>
            <p className="text-white text-xl font-bold mt-0.5">{name ?? "ユーザー"}</p>
            <p className="text-white/70 text-xs mt-1">登録アイテム {totalItems}件</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100">
            {SECTIONS.map(({ type, label, Icon, statBg }) => (
              <div key={type} className="p-4 text-center">
                <div className={`w-8 h-8 rounded-lg ${statBg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon size={16} className="text-white" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{userData[type].size}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
            <div className="p-4 text-center">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center mx-auto mb-2">
                <FileText size={16} className="text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{noteEntries.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">メモ</p>
            </div>
          </div>
        </div>

        {/* Sections — display order: FAV, APPLIED, DONE */}
        {(["FAV", "APPLIED", "DONE"] as Section[]).map((type) => {
          const { label, Icon, headerColor } = SECTIONS.find((s) => s.type === type)!;
          const ids = [...userData[type]];
          if (!ids.length) return null;
          return (
            <section key={type}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={18} className={headerColor} />
                <h2 className={`text-base font-bold ${headerColor}`}>{label}</h2>
                <span className="ml-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {ids.length}件
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ids.map((id) =>
                  hackathons[id] ? (
                    <HackathonCard key={id} hackathon={hackathons[id]} />
                  ) : (
                    <div
                      key={id}
                      className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-32"
                    />
                  )
                )}
              </div>
            </section>
          );
        })}

        {/* Notes */}
        {noteEntries.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-amber-600" />
              <h2 className="text-base font-bold text-amber-700">メモ</h2>
              <span className="ml-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {noteEntries.length}件
              </span>
            </div>
            <div className="space-y-3">
              {noteEntries.map(([id, body]) => (
                <Link
                  key={id}
                  href={`/hackathons/${encodeURIComponent(id)}`}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {hackathons[id]?.title ?? id}
                    </p>
                    <ChevronRight size={16} className="text-gray-300 shrink-0 mt-0.5 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2 whitespace-pre-line line-clamp-3 leading-relaxed">
                    {body}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {totalItems === 0 && !userData.loading && (
          <div className="text-center py-16 text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">まだ登録されたアイテムがありません</p>
            <p className="text-xs mt-1">ハッカソン詳細ページからお気に入りや参加予定を登録できます</p>
            <Link
              href="/"
              className="inline-block mt-4 px-5 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              ハッカソンを探す
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
