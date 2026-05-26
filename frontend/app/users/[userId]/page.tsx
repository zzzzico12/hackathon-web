import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { User, Star, Trophy, Globe, MapPin } from "lucide-react";
import { formatDate, formatPrize } from "@/lib/api";
import { ShareButton } from "./ShareButton";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

interface Report {
  body: string;
  rating?: number;
}

interface PortfolioHackathon {
  source_id: string;
  title: string;
  start_date: string;
  source_name: string;
  source_url: string;
  themes: string[];
  prize_amount: number;
  is_online: boolean;
  report?: Report;
}

interface Portfolio {
  display_name: string | null;
  avatar_url: string | null;
  hackathons: PortfolioHackathon[];
  themes: string[];
  report_count: number;
}

async function fetchPortfolio(userId: string): Promise<Portfolio | null> {
  try {
    const res = await fetch(`${API}/users/${encodeURIComponent(userId)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const data = await fetchPortfolio(userId);
  if (!data || data.hackathons.length === 0) return { title: "ポートフォリオ | Hackathon Japan" };

  const name = data.display_name ?? "このユーザー";
  const count = data.hackathons.length;
  return {
    title: `${name}のポートフォリオ | Hackathon Japan`,
    description: `${name}は${count}件のハッカソンに参加しました。`,
    openGraph: {
      title: `${name}のハッカソンポートフォリオ`,
      description: `参加済み${count}件 / レポート${data.report_count}件 | ${data.themes.slice(0, 3).join("・")}`,
      url: `https://hackathon.zzzzico.click/users/${userId}`,
    },
  };
}

function StarRow({ n }: { n: number }) {
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

export default async function PortfolioPage({ params }: Props) {
  const { userId } = await params;
  const data = await fetchPortfolio(userId);

  if (!data || data.hackathons.length === 0) notFound();

  const name = data.display_name ?? "匿名ユーザー";
  const pageUrl = `https://hackathon.zzzzico.click/users/${userId}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-4">
            {data.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.avatar_url}
                alt={name}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-100"
                onError={undefined}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center ring-2 ring-gray-100 shrink-0">
                <User size={28} className="text-blue-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900">{name}</h2>
              <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                <span>参加済み <strong className="text-gray-900">{data.hackathons.length}</strong> 件</span>
                <span>レポート <strong className="text-gray-900">{data.report_count}</strong> 件</span>
              </div>
              {data.themes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {data.themes.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <ShareButton name={name} count={data.hackathons.length} url={pageUrl} />
          </div>
        </div>

        {/* Hackathon list */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            参加したハッカソン ({data.hackathons.length})
          </h3>
          <div className="space-y-3">
            {data.hackathons.map((h) => (
              <div key={h.source_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={h.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-semibold text-gray-900 hover:text-blue-600 hover:underline leading-snug line-clamp-2"
                    >
                      {h.title}
                    </a>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>📅 {formatDate(h.start_date)}</span>
                      <span>{h.is_online ? <><Globe size={11} className="inline" /> オンライン</> : <><MapPin size={11} className="inline" /> オフライン</>}</span>
                      {h.prize_amount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Trophy size={11} /> {formatPrize(h.prize_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {h.source_name}
                  </span>
                </div>

                {h.themes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {h.themes.slice(0, 4).map((t) => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {h.report && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {h.report.rating != null && (
                      <div className="mb-1.5">
                        <StarRow n={h.report.rating} />
                      </div>
                    )}
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                      {h.report.body}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
