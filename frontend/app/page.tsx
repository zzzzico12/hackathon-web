import { Suspense } from "react";
import { fetchHackathons } from "@/lib/api";
import { HackathonCard } from "@/components/HackathonCard";
import { FilterBar } from "@/components/FilterBar";
import type { FilterParams, Status, PrizeBucket } from "@/lib/types";

interface SearchParamsProps {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function Home({ searchParams }: SearchParamsProps) {
  const sp = await searchParams;

  const params: FilterParams = {
    status: (sp.status as Status) ?? "UPCOMING",
    ...(sp.online && { online: sp.online as "true" | "false" }),
    ...(sp.prize && { prize: sp.prize as PrizeBucket }),
    ...(sp.beginner && { beginner: "true" }),
    ...(sp.next_token && { next_token: sp.next_token }),
    limit: 24,
  };

  const data = await fetchHackathons(params).catch(() => ({
    items: [],
    count: 0,
    next_token: null,
  }));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-bold text-gray-900 shrink-0">
            🚀 Hackathon Japan
          </h1>
          <Suspense>
            <FilterBar />
          </Suspense>
        </div>
      </header>

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
              href={`/?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]), next_token: data.next_token })}`}
              className="inline-block px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              さらに読み込む
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
