"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type Section = "FAV" | "PLAN" | "APPLIED";

const SECTION_LABELS: Record<Section, { icon: string; label: string }> = {
  FAV: { icon: "❤", label: "お気に入り" },
  PLAN: { icon: "📅", label: "参加予定" },
  APPLIED: { icon: "✅", label: "応募済み" },
};

export default function MyPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const userData = useUserData(!!user);
  const [hackathons, setHackathons] = useState<Record<string, Hackathon>>({});

  useEffect(() => {
    if (!user || userData.loading) return;
    const allIds = new Set([
      ...userData.FAV,
      ...userData.PLAN,
      ...userData.APPLIED,
      ...userData.NOTES.keys(),
    ]);
    const missing = [...allIds].filter((id) => !hackathons[id]);
    if (!missing.length) return;

    Promise.all(missing.map((id) => fetchHackathonById(id).then((h) => ({ id, h })))).then(
      (results) => {
        setHackathons((prev) => {
          const next = { ...prev };
          for (const { id, h } of results) if (h) next[id] = h;
          return next;
        });
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userData.loading, userData.FAV.size, userData.PLAN.size, userData.APPLIED.size]);

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
        <div className="text-center space-y-4">
          <p className="text-gray-600">マイページはログインが必要です</p>
          <button
            onClick={signIn}
            className="px-6 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Googleでログイン
          </button>
        </div>
      </main>
    );
  }

  const noteEntries = [...userData.NOTES.entries()].filter(([, body]) => body);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← 一覧に戻る
          </Link>
          <h1 className="text-lg font-bold text-gray-900">マイページ</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-10">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["FAV", "PLAN", "APPLIED"] as Section[]).map((t) => (
            <div key={t} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{userData[t].size}</p>
              <p className="text-xs text-gray-500 mt-1">
                {SECTION_LABELS[t].icon} {SECTION_LABELS[t].label}
              </p>
            </div>
          ))}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{noteEntries.length}</p>
            <p className="text-xs text-gray-500 mt-1">📝 メモ</p>
          </div>
        </div>

        {/* Sections */}
        {(["PLAN", "FAV", "APPLIED"] as Section[]).map((type) => {
          const ids = [...userData[type]];
          if (!ids.length) return null;
          const { icon, label } = SECTION_LABELS[type];
          return (
            <section key={type}>
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                {icon} {label}
                <span className="ml-2 text-sm text-gray-400 font-normal">{ids.length}件</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ids.map((id) =>
                  hackathons[id] ? (
                    <HackathonCard key={id} hackathon={hackathons[id]} />
                  ) : (
                    <div key={id} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-32" />
                  )
                )}
              </div>
            </section>
          );
        })}

        {/* Notes */}
        {noteEntries.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">📝 メモ</h2>
            <div className="space-y-3">
              {noteEntries.map(([id, body]) => (
                <div key={id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-sm font-medium text-gray-900">
                    {hackathons[id]?.title ?? id}
                  </p>
                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-line line-clamp-3">{body}</p>
                  <Link href={`/hackathons/${encodeURIComponent(id)}`} className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                    詳細を見る →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
