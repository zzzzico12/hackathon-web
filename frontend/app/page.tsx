import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchHackathons } from "@/lib/api";
import { HackathonCard } from "@/components/HackathonCard";
import { HackathonCalendar } from "@/components/HackathonCalendar";
import { FilterBar } from "@/components/FilterBar";
import { TabBar, type TabKey } from "@/components/TabBar";
import { BoardGlobalTab } from "@/components/BoardGlobalTab";
import type { FilterParams, PrizeBucket } from "@/lib/types";

export const metadata: Metadata = {
  title: "Hackathon Japan | 日本のハッカソンまとめ",
  description: "日本で開催されるハッカソンを自動収集。賞金・テーマ・オンライン/オフライン・初心者向けで絞り込み可能。",
  openGraph: {
    title: "Hackathon Japan",
    description: "日本のハッカソン情報まとめサイト",
    url: "https://hackathon.zzzzico.click",
  },
};

interface SearchParamsProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function Home({ searchParams }: SearchParamsProps) {
  const sp = await searchParams;
  const rawTab = sp.tab ?? "hackathons";
  const activeTab: TabKey =
    rawTab === "reports" || rawTab === "team" ? rawTab : "hackathons";

  const status = sp.status === "PAST" ? "PAST" : "UPCOMING";
  const view = sp.view === "calendar" ? "calendar" : "list";

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = sp.month ?? defaultMonth;

  const params: FilterParams = {
    status,
    ...(sp.online && { online: sp.online as "true" | "false" }),
    ...(sp.prize && { prize: sp.prize as PrizeBucket }),
    ...(sp.beginner && { beginner: "true" }),
    ...(sp.theme && { theme: sp.theme }),
    ...(sp.q && { q: sp.q }),
    ...(sp.sort && { sort: sp.sort as "date_asc" | "prize_desc" }),
    ...(sp.next_token && { next_token: sp.next_token }),
    limit: view === "calendar" ? 100 : 24,
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">
            🚀 Hackathon Japan
          </h1>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <Suspense>
            <FilterBar activeTab={activeTab} />
          </Suspense>
        </div>
        <Suspense>
          <TabBar activeTab={activeTab} />
        </Suspense>
      </header>

      {activeTab === "hackathons" ? (
        <HackathonTab params={params} sp={sp} view={view} month={month} />
      ) : (
        <BoardGlobalTab tab={activeTab} q={sp.q} />
      )}
    </main>
  );
}

function formatDataUpdatedAt(items: { updated_at?: string }[]): string | null {
  const dates = items.map((i) => i.updated_at).filter(Boolean) as string[];
  if (dates.length === 0) return null;
  const latest = new Date(dates.reduce((a, b) => (a > b ? a : b)));
  return (
    latest.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "narrow",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " 更新"
  );
}

async function HackathonTab({
  params,
  sp,
  view,
  month,
}: {
  params: FilterParams;
  sp: Record<string, string | undefined>;
  view: "list" | "calendar";
  month: string;
}) {
  const data = await fetchHackathons(params).catch(() => ({
    items: [],
    count: 0,
    next_token: null,
  }));

  const updatedAt = formatDataUpdatedAt(data.items);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
    );
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== undefined && v !== "") p.set(k, v);
      else p.delete(k);
    });
    p.delete("next_token");
    return `/?${p.toString()}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{data.count} 件表示</p>
          {updatedAt && (
            <p className="text-xs text-gray-400">データ: {updatedAt}</p>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <Link
            href={buildUrl({ view: undefined })}
            className={`px-3 py-1.5 transition-colors ${
              view === "list"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            リスト
          </Link>
          <Link
            href={buildUrl({ view: "calendar" })}
            className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
              view === "calendar"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            カレンダー
          </Link>
        </div>
      </div>

      {view === "calendar" ? (
        <HackathonCalendar items={data.items} month={month} sp={sp} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              該当するハッカソンが見つかりませんでした
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.items.map((h) => (
                <HackathonCard key={h.source_id} hackathon={h} />
              ))}
            </div>
          )}

          {data.next_token && data.items.length > 0 && (
            <div className="mt-8 text-center">
              <a
                href={`/?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(sp).filter(([, v]) => v !== undefined) as [
                      string,
                      string,
                    ][]
                  ),
                  next_token: data.next_token,
                })}`}
                className="inline-block px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                さらに読み込む
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
