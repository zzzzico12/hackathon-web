"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star, Users, ChevronRight, LogIn } from "lucide-react";
import type { TabKey } from "@/components/TabBar";
import { useAuth } from "@/lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

interface BoardItem {
  hackathon_source_id: string;
  SK: string;
  board_type: "REPORT" | "TEAM";
  display_name: string;
  hackathon_title: string;
  body: string;
  created_at: string;
  rating?: number;
  skills?: string[];
  wants?: string[];
  contact?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m || 1}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= n ? "fill-amber-400 text-amber-400" : "text-gray-200"}
        />
      ))}
    </span>
  );
}

function SkillBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}

const SKILL_LABELS: Record<string, string> = {
  engineer: "エンジニア",
  designer: "デザイナー",
  pm: "PM・企画",
  data: "データ分析",
  other: "その他",
};

function ReportCard({ item }: { item: BoardItem }) {
  return (
    <Link
      href={`/hackathons/${encodeURIComponent(item.hackathon_source_id)}`}
      className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-blue-600 group-hover:underline truncate">
          {item.hackathon_title || item.hackathon_source_id}
        </p>
        <ChevronRight size={14} className="text-gray-300 shrink-0 mt-0.5" />
      </div>
      {item.rating != null && (
        <div className="mb-2">
          <Stars n={item.rating} />
        </div>
      )}
      <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed">{item.body}</p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">{item.display_name || "匿名"}</span>
        <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
      </div>
    </Link>
  );
}

function TeamCard({ item }: { item: BoardItem }) {
  return (
    <Link
      href={`/hackathons/${encodeURIComponent(item.hackathon_source_id)}`}
      className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow group"
    >
      <p className="text-xs font-semibold text-blue-600 group-hover:underline truncate mb-3">
        {item.hackathon_title || item.hackathon_source_id}
      </p>
      {(item.skills?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          <span className="text-xs text-gray-400 mr-1">提供:</span>
          {item.skills!.map((s) => (
            <SkillBadge key={s} label={SKILL_LABELS[s] ?? s} color="bg-blue-50 text-blue-700" />
          ))}
        </div>
      )}
      {(item.wants?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <span className="text-xs text-gray-400 mr-1">求む:</span>
          {item.wants!.map((s) => (
            <SkillBadge key={s} label={SKILL_LABELS[s] ?? s} color="bg-purple-50 text-purple-700" />
          ))}
        </div>
      )}
      <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">{item.body}</p>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-400">{item.display_name || "匿名"}</span>
        <div className="flex items-center gap-2">
          {item.contact && (
            <span className="text-xs text-gray-400">{item.contact}</span>
          )}
          <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

export function BoardGlobalTab({ tab, q }: { tab: TabKey; q?: string }) {
  const { user, loading: authLoading, signIn } = useAuth();
  const [items, setItems] = useState<BoardItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchItems = useCallback(
    async (lastKeyParam?: string) => {
      const params = new URLSearchParams({ tab, ...(q ? { q } : {}) });
      if (lastKeyParam) params.set("last_key", lastKeyParam);
      const res = await fetch(`${API}/board?${params}`).catch(() => null);
      if (!res || !res.ok) return { items: [], last_key: null };
      return res.json() as Promise<{ items: BoardItem[]; last_key: string | null }>;
    },
    [tab, q]
  );

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    setItems([]);
    setLastKey(null);
    fetchItems().then(({ items, last_key }) => {
      setItems(items);
      setLastKey(last_key);
      setDataLoading(false);
    });
  }, [fetchItems, user]);

  const loadMore = async () => {
    if (!lastKey) return;
    setLoadingMore(true);
    const { items: more, last_key } = await fetchItems(lastKey);
    setItems((prev) => [...prev, ...more]);
    setLastKey(last_key);
    setLoadingMore(false);
  };

  const isReports = tab === "reports";

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-36" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <LogIn size={24} className="text-blue-400" />
        </div>
        <p className="text-gray-700 font-medium mb-2">
          {isReports ? "参加レポート" : "チーム募集"}の閲覧にはログインが必要です
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Googleアカウントで簡単に登録できます
        </p>
        <button
          onClick={signIn}
          className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Googleでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {dataLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-36" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            {isReports ? <Star size={22} className="text-gray-300" /> : <Users size={22} className="text-gray-300" />}
          </div>
          <p className="text-sm">
            {q
              ? `「${q}」に一致する${isReports ? "参加レポート" : "チーム募集"}が見つかりませんでした`
              : isReports
              ? "まだ参加レポートがありません"
              : "まだチーム募集がありません"}
          </p>
          <p className="text-xs mt-1 text-gray-400">
            ハッカソンの詳細ページから{isReports ? "レポートを投稿" : "募集を投稿"}できます
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{items.length}件{lastKey ? "以上" : ""}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) =>
              isReports ? (
                <ReportCard key={item.SK} item={item} />
              ) : (
                <TeamCard key={item.SK} item={item} />
              )
            )}
          </div>
          {lastKey && (
            <div className="mt-8 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loadingMore ? "読み込み中..." : "さらに読み込む"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
