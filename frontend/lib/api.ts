import type { FilterParams, Hackathon, HackathonListResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export async function fetchHackathons(
  params: FilterParams = {}
): Promise<HackathonListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });

  const res = await fetch(`${API_BASE}/hackathons?${qs}`, {
    next: { revalidate: 60 }, // 1分キャッシュ
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchHackathon(sourceId: string): Promise<Hackathon> {
  const res = await fetch(
    `${API_BASE}/hackathons/${encodeURIComponent(sourceId)}`,
    { next: { revalidate: 60 * 10 } }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "未定";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatPrize(amount: number): string {
  if (!amount || amount <= 0) return "賞品なし";
  return `¥${amount.toLocaleString("ja-JP")}`;
}
