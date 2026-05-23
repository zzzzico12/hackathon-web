"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

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

const STATUS_OPTIONS = [
  { label: "開催予定", value: "UPCOMING" },
  { label: "過去", value: "PAST" },
  { label: "すべて", value: "ALL" },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("next_token"); // フィルタ変更時はページリセット
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const current = (key: string, fallback = "") =>
    searchParams.get(key) ?? fallback;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Select
        label="開催状況"
        value={current("status", "UPCOMING")}
        options={STATUS_OPTIONS}
        onChange={(v) => setParam("status", v)}
      />
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
      <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded"
          checked={current("beginner") === "true"}
          onChange={(e) => setParam("beginner", e.target.checked ? "true" : "")}
        />
        初心者歓迎のみ
      </label>
    </div>
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
