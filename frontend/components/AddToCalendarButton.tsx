"use client";

import type { Hackathon } from "@/lib/types";

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeIcs(str: string): string {
  return str.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

export function AddToCalendarButton({ hackathon: h }: { hackathon: Hackathon }) {
  const handleClick = () => {
    const dtstart = toIcsDate(h.start_date);
    const dtend = h.end_date ? addOneDay(h.end_date) : addOneDay(h.start_date);
    const uid = `${h.source_id}@hackathon.zzzzico.click`;
    const location = h.is_online ? "オンライン" : (h.location ?? "");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hackathon Japan//JP",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcs(h.title)}`,
      h.description ? `DESCRIPTION:${escapeIcs(h.description.slice(0, 200))}` : "",
      location ? `LOCATION:${escapeIcs(location)}` : "",
      h.source_url ? `URL:${h.source_url}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${h.source_id}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 font-medium hover:bg-gray-50 transition-colors"
    >
      <span>📆</span>
      <span>カレンダー追加</span>
    </button>
  );
}
