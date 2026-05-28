"use client";

import { useState } from "react";
import { HackathonCard } from "@/components/HackathonCard";
import type { Hackathon, FilterParams } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

interface Props {
  initialItems: Hackathon[];
  initialNextToken: string | null;
  backHref: string;
  filterParams: FilterParams;
}

export function HackathonListClient({
  initialItems,
  initialNextToken,
  backHref,
  filterParams,
}: Props) {
  const [items, setItems] = useState<Hackathon[]>(initialItems);
  const [nextToken, setNextToken] = useState<string | null>(initialNextToken);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!nextToken || loading) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      const p = { ...filterParams, next_token: nextToken };
      Object.entries(p).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      const res = await fetch(`${API_BASE}/hackathons?${qs}`).catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setNextToken(data.next_token);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        該当するハッカソンが見つかりませんでした
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((h) => (
          <HackathonCard key={h.source_id} hackathon={h} backHref={backHref} />
        ))}
      </div>

      {nextToken && (
        <div className="mt-8 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-block px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? "読み込み中..." : "さらに読み込む"}
          </button>
        </div>
      )}
    </>
  );
}
