"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/lib/useAuth";
import { HackathonCard } from "@/components/HackathonCard";
import type { Hackathon } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function getToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export function RecommendedSection() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Hackathon[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/user/recommendations`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.items ?? []);
        setThemes(data.themes ?? []);
      } catch {
        // おすすめ取得失敗は無視してセクション非表示のまま
      } finally {
        setFetched(true);
      }
    })();
  }, [user, authLoading]);

  // 未ログイン・取得前・0件の場合は何も表示しない
  if (!user || !fetched || items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">あなたへのおすすめ</h2>
        {themes.length > 0 && (
          <span className="text-xs text-gray-400">
            {themes.join(" · ")} に興味があるあなたへ
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((h) => (
          <HackathonCard key={h.source_id} hackathon={h} backHref="/" />
        ))}
      </div>
      <div className="mt-4 border-t border-gray-100" />
    </div>
  );
}
