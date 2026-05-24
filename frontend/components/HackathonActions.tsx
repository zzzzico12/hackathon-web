"use client";

import { useState } from "react";
import { Heart, CalendarDays, CheckCircle2, FileText, CalendarPlus } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { useUserData } from "@/lib/useUserData";
import { ActionButton } from "@/components/ActionButton";
import { NoteModal } from "@/components/NoteModal";
import type { Hackathon } from "@/lib/types";

interface Props {
  hackathon: Hackathon;
}

export function HackathonActions({ hackathon: h }: Props) {
  const { user, signIn } = useAuth();
  const ud = useUserData(!!user);
  const [showNote, setShowNote] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const requireAuth = (fn: () => void) => {
    if (!user) setShowLoginPrompt(true);
    else fn();
  };

  const handleCalendar = () => {
    const dtstart = h.start_date.replace(/-/g, "");
    const end = h.end_date ?? h.start_date;
    const d = new Date(end);
    d.setDate(d.getDate() + 1);
    const dtend = d.toISOString().slice(0, 10).replace(/-/g, "");
    const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hackathon Japan//JP",
      "BEGIN:VEVENT",
      `UID:${h.source_id}@hackathon.zzzzico.click`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${esc(h.title)}`,
      h.description ? `DESCRIPTION:${esc(h.description.slice(0, 200))}` : "",
      h.is_online ? "LOCATION:オンライン" : h.location ? `LOCATION:${esc(h.location)}` : "",
      h.source_url ? `URL:${h.source_url}` : "",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${h.source_id}.ics`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          active={ud.FAV.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("FAV", h.source_id))}
          icon={<Heart size={13} className={ud.FAV.has(h.source_id) ? "fill-red-500 text-red-500" : ""} />}
          label="お気に入り"
          activeLabel="お気に入り済み"
          activeClass="bg-red-50 text-red-600 border-red-200"
        />
        <ActionButton
          active={ud.PLAN.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("PLAN", h.source_id))}
          icon={<CalendarDays size={13} />}
          label="参加予定"
          activeLabel="参加予定済み"
          activeClass="bg-blue-50 text-blue-700 border-blue-200"
        />
        <ActionButton
          active={ud.APPLIED.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("APPLIED", h.source_id))}
          icon={<CheckCircle2 size={13} />}
          label="応募済み"
          activeClass="bg-emerald-50 text-emerald-700 border-emerald-200"
        />
        <ActionButton
          active={ud.NOTES.has(h.source_id)}
          onClick={() => requireAuth(() => setShowNote(true))}
          icon={<FileText size={13} />}
          label="メモ"
          activeLabel="メモあり"
          activeClass="bg-amber-50 text-amber-700 border-amber-200"
        />
        <button
          onClick={handleCalendar}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 font-medium hover:bg-gray-50 transition-colors"
        >
          <CalendarPlus size={13} />
          <span>カレンダー追加</span>
        </button>
      </div>

      {showNote && (
        <NoteModal
          sourceId={h.source_id}
          initialBody={ud.NOTES.get(h.source_id) ?? ""}
          onSave={(body) => ud.saveNote(h.source_id, body)}
          onClose={() => setShowNote(false)}
        />
      )}

      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-gray-900">ログインが必要です</p>
            <p className="text-sm text-gray-500">
              お気に入り・参加予定などの機能はGoogleアカウントでログインしてご利用ください。
            </p>
            <button
              onClick={signIn}
              className="w-full px-4 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Googleでログイン
            </button>
            <button
              onClick={() => setShowLoginPrompt(false)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </>
  );
}
