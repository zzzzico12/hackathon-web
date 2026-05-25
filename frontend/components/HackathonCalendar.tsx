import Link from "next/link";
import type { Hackathon } from "@/lib/types";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export function HackathonCalendar({
  items,
  month,
  sp,
  backHref,
}: {
  items: Hackathon[];
  month: string; // "YYYY-MM"
  sp: Record<string, string | undefined>;
  backHref?: string;
}) {
  const [yearStr, monStr] = month.split("-");
  const year = parseInt(yearStr);
  const mon = parseInt(monStr);

  const firstDow = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();

  const prevMon =
    mon === 1
      ? `${year - 1}-12`
      : `${year}-${String(mon - 1).padStart(2, "0")}`;
  const nextMon =
    mon === 12
      ? `${year + 1}-01`
      : `${year}-${String(mon + 1).padStart(2, "0")}`;

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

  // Group items by day number
  const byDay: Record<number, Hackathon[]> = {};
  for (const h of items) {
    if (!h.start_date?.startsWith(month)) continue;
    const day = parseInt(h.start_date.substring(8, 10));
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(h);
  }

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = new Date().toISOString().substring(0, 10);
  const monthHackathons = items.filter((h) => h.start_date?.startsWith(month));

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={buildUrl({ month: prevMon })}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← 前月
        </Link>
        <span className="text-base font-semibold text-gray-800">
          {year}年{mon}月
        </span>
        <Link
          href={buildUrl({ month: nextMon })}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          翌月 →
        </Link>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-px">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1.5 ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-gray-100 rounded-xl overflow-hidden">
        {cells.map((day, idx) => {
          const dow = idx % 7;
          const dayStr = day
            ? `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : null;
          const isToday = dayStr === todayStr;
          const hackathons = day ? (byDay[day] ?? []) : [];

          return (
            <div
              key={idx}
              className="border-r border-b border-gray-100 min-h-[72px] p-1 bg-white"
            >
              {day && (
                <>
                  <div
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      isToday
                        ? "bg-blue-600 text-white"
                        : dow === 0
                        ? "text-red-500"
                        : dow === 6
                        ? "text-blue-500"
                        : "text-gray-600"
                    }`}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {hackathons.map((h) => {
                      const href = backHref
                        ? `/hackathons/${encodeURIComponent(h.source_id)}?back=${encodeURIComponent(backHref)}`
                        : `/hackathons/${encodeURIComponent(h.source_id)}`;
                      return (
                        <Link
                          key={h.source_id}
                          href={href}
                          className="block text-[10px] leading-snug px-1 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 truncate transition-colors"
                          title={h.title}
                        >
                          {h.title}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {monthHackathons.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-10">
          この月のハッカソンはありません
        </p>
      )}
    </div>
  );
}
