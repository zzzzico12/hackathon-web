import Link from "next/link";
import type { Hackathon } from "@/lib/types";
import { formatDate, formatPrize } from "@/lib/api";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";

interface Props {
  hackathon: Hackathon;
}

export function HackathonCard({ hackathon: h }: Props) {
  const sourceId = encodeURIComponent(h.source_id);

  return (
    <Link
      href={`/hackathons/${sourceId}`}
      className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">
          {h.title}
        </h2>
        <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {h.source_name}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
        <span>📅 {formatDate(h.start_date)}</span>
        {h.entry_deadline && (
          <span>⏰ 締切 {formatDate(h.entry_deadline)}</span>
        )}
        <span>{h.is_online ? "🌐 オンライン" : `📍 ${h.location ?? "会場未定"}`}</span>
        {h.entry_deadline && <DeadlineCountdown entryDeadline={h.entry_deadline} />}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {h.prize_amount > 0 && (
          <Badge color="yellow">🏆 {formatPrize(h.prize_amount)}</Badge>
        )}
        {h.is_beginner_friendly && <Badge color="green">初心者歓迎</Badge>}
        {h.themes.slice(0, 3).map((t) => (
          <Badge key={t} color="gray">{t}</Badge>
        ))}
      </div>

      {h.description && (
        <p className="mt-3 text-xs text-gray-500 line-clamp-2">{h.description}</p>
      )}
    </Link>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "yellow" | "green" | "gray" | "blue";
}) {
  const styles = {
    yellow: "bg-yellow-50 text-yellow-700",
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}
