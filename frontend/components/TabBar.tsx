"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

const TABS = [
  { key: "hackathons", label: "ハッカソン" },
  { key: "reports",    label: "参加レポート" },
  { key: "team",       label: "チーム募集" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function TabBar({ activeTab }: { activeTab: TabKey }) {
  const searchParams = useSearchParams();

  return (
    <div className="max-w-5xl mx-auto px-4 flex gap-0 border-b border-gray-100">
      {TABS.map(({ key, label }) => {
        const params = new URLSearchParams(searchParams.toString());
        if (key === "hackathons") {
          params.delete("tab");
        } else {
          params.set("tab", key);
        }
        params.delete("next_token");
        const active = activeTab === key;
        return (
          <Link
            key={key}
            href={`/?${params.toString()}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
