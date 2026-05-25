"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";

const ONLINE_OPTIONS = [
  { label: "すべて", value: "" },
  { label: "オンライン", value: "true" },
  { label: "オフライン", value: "false" },
];

const PRIZE_OPTIONS = [
  { label: "すべて", value: "" },
  { label: "賞金あり（〜10万）", value: "SMALL" },
  { label: "賞金あり（10万〜）", value: "LARGE" },
  { label: "賞品なし", value: "NO_PRIZE" },
];

const THEME_OPTIONS = [
  { label: "すべて", value: "" },
  { label: "AI", value: "AI" },
  { label: "Web", value: "Web" },
  { label: "モバイル", value: "モバイル" },
  { label: "ゲーム", value: "ゲーム" },
  { label: "教育", value: "教育" },
  { label: "社会課題", value: "社会課題" },
  { label: "金融", value: "金融" },
  { label: "データ分析", value: "データ分析" },
  { label: "ブロックチェーン", value: "ブロックチェーン" },
  { label: "AR/VR/XR", value: "AR/VR/XR" },
  { label: "ロボット", value: "ロボット" },
];

const SORT_OPTIONS = [
  { label: "開始日（早い順）", value: "" },
  { label: "賞金（多い順）", value: "prize_desc" },
];

export function FilterBar({ activeTab = "hackathons" }: { activeTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("q") ?? ""
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("next_token");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const submitSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      params.delete("next_token");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const current = (key: string, fallback = "") =>
    searchParams.get(key) ?? fallback;

  const activeCount = [
    current("online"),
    current("prize"),
    current("theme"),
    current("beginner"),
    current("q"),
    current("sort"),
  ].filter(Boolean).length;

  const isHackathonTab = activeTab === "hackathons";
  const isPast = current("status") === "PAST";

  const searchForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitSearch(searchInput);
      }}
      className="flex items-center gap-1"
    >
      <input
        type="text"
        placeholder="キーワード検索"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onBlur={() => submitSearch(searchInput)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
      />
    </form>
  );

  const hackathonFilters = (
    <>
      <Select
        label="形式"
        value={current("online")}
        options={ONLINE_OPTIONS}
        onChange={(v) => setParam("online", v)}
      />
      <Select
        label="賞金"
        value={current("prize")}
        options={PRIZE_OPTIONS}
        onChange={(v) => setParam("prize", v)}
      />
      <Select
        label="テーマ"
        value={current("theme")}
        options={THEME_OPTIONS}
        onChange={(v) => setParam("theme", v)}
      />
      <Select
        label="並び順"
        value={current("sort")}
        options={SORT_OPTIONS}
        onChange={(v) => setParam("sort", v)}
      />
      <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded"
          checked={current("beginner") === "true"}
          onChange={(e) => setParam("beginner", e.target.checked ? "true" : "")}
        />
        初心者歓迎のみ
      </label>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status segment — hackathons tab, always visible */}
        {isHackathonTab && (
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium shrink-0">
            <button
              onClick={() => setParam("status", "")}
              className={`px-3 py-1.5 transition-colors ${
                !isPast ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              開催予定
            </button>
            <button
              onClick={() => setParam("status", "PAST")}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                isPast ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              開催済み
            </button>
          </div>
        )}

        {/* Keyword search — all tabs */}
        {searchForm}

        {/* Mobile: toggle button for additional filters */}
        {isHackathonTab && (
          <button
            className="sm:hidden flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            絞り込む
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-blue-600 text-white">
                {activeCount}
              </span>
            )}
            <span className="text-gray-400">{open ? "▲" : "▼"}</span>
          </button>
        )}

        {/* Desktop: inline hackathon filters */}
        {isHackathonTab && (
          <div className="hidden sm:flex flex-wrap gap-3 items-center">
            {hackathonFilters}
          </div>
        )}
      </div>

      {/* Mobile: expanded filter panel */}
      {isHackathonTab && open && (
        <div className="sm:hidden w-full border-t border-gray-100 pt-3 pb-1 flex flex-wrap gap-3">
          {hackathonFilters}
        </div>
      )}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
