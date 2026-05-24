import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchHackathons } from "@/lib/api";
import { HackathonCard } from "@/components/HackathonCard";
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

  const params: FilterParams = {
    status: "UPCOMING",
    ...(sp.online && { online: sp.online as "true" | "false" }),
    ...(sp.prize && { prize: sp.prize as PrizeBucket }),
    ...(sp.beginner && { beginner: "true" }),
    ...(sp.theme && { theme: sp.theme }),
    ...(sp.q && { q: sp.q }),
    ...(sp.sort && { sort: sp.sort as "date_asc" | "prize_desc" }),
    ...(sp.next_token && { next_token: sp.next_token }),
    limit: 24,
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
        <HackathonTab params={params} sp={sp} />
      ) : (
        <BoardGlobalTab tab={activeTab} q={sp.q} />
      )}
    </main>
  );
}

async function HackathonTab({
  params,
  sp,
}: {
  params: FilterParams;
  sp: Record<string, string | undefined>;
}) {
  const data = await fetchHackathons(params).catch(() => ({
    items: [],
    count: 0,
    next_token: null,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <p className="text-sm text-gray-500 mb-4">{data.count} 件表示</p>

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

      {data.next_token && (
        <div className="mt-8 text-center">
          <a
            href={`/?${new URLSearchParams({
              ...Object.fromEntries(
                Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
              ),
              next_token: data.next_token,
            })}`}
            className="inline-block px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            さらに読み込む
          </a>
        </div>
      )}
    </div>
  );
}
