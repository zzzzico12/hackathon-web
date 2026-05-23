import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchHackathon, formatDate, formatPrize } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const h = await fetchHackathon(decodeURIComponent(id)).catch(() => null);
  if (!h) return { title: "Not Found" };
  return {
    title: `${h.title} | Hackathon Japan`,
    description: h.description ?? `${h.title} の詳細情報`,
    openGraph: {
      title: h.title,
      description: h.description ?? undefined,
      url: `https://hackathon.zzzzico.click/hackathons/${id}`,
    },
  };
}

export default async function HackathonDetail({ params }: Props) {
  const { id } = await params;
  const sourceId = decodeURIComponent(id);

  const h = await fetchHackathon(sourceId).catch(() => null);
  if (!h) notFound();

  const dateRange = h.end_date
    ? `${formatDate(h.start_date)} 〜 ${formatDate(h.end_date)}`
    : formatDate(h.start_date);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: h.title,
    description: h.description ?? undefined,
    startDate: h.start_date,
    endDate: h.end_date || undefined,
    url: h.source_url || `https://hackathon.zzzzico.click/hackathons/${id}`,
    eventStatus:
      h.status === "UPCOMING"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventPostponed",
    eventAttendanceMode: h.is_online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: h.is_online
      ? { "@type": "VirtualLocation", url: h.source_url }
      : { "@type": "Place", name: h.location ?? "会場未定" },
    ...(h.prize_amount > 0 && {
      offers: {
        "@type": "Offer",
        price: h.prize_amount,
        priceCurrency: "JPY",
      },
    }),
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← 一覧に戻る
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                {h.source_name}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  h.status === "UPCOMING"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {h.status === "UPCOMING" ? "開催予定" : "開催済み"}
              </span>
              {h.is_beginner_friendly && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                  初心者歓迎
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{h.title}</h1>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <InfoRow label="開催日" value={dateRange} />
            {h.entry_deadline && (
              <InfoRow label="応募締切" value={formatDate(h.entry_deadline)} />
            )}
            <InfoRow
              label="形式"
              value={h.is_online ? "🌐 オンライン" : `📍 ${h.location ?? "会場未定"}`}
            />
            <InfoRow label="賞金・賞品" value={formatPrize(h.prize_amount)} />
          </dl>

          {h.themes.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">テーマ</p>
              <div className="flex flex-wrap gap-2">
                {h.themes.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {h.description && (
            <div>
              <p className="text-xs text-gray-500 mb-2">概要</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {h.description}
              </p>
            </div>
          )}

          {h.source_url && (
            <a
              href={h.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full text-center px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              公式サイトで詳細を見る →
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
    </div>
  );
}
