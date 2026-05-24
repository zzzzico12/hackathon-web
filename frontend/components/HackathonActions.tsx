"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useUserData } from "@/lib/useUserData";
import { ActionButton } from "@/components/ActionButton";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
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
    if (!user) {
      setShowLoginPrompt(true);
    } else {
      fn();
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          active={ud.FAV.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("FAV", h.source_id))}
          icon="❤"
          label="お気に入り"
          activeLabel="お気に入り済み"
          activeClass="bg-red-50 text-red-600 border-red-200"
        />
        <ActionButton
          active={ud.PLAN.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("PLAN", h.source_id))}
          icon="📅"
          label="参加予定"
          activeLabel="参加予定済み"
          activeClass="bg-blue-50 text-blue-700 border-blue-200"
        />
        <ActionButton
          active={ud.APPLIED.has(h.source_id)}
          onClick={() => requireAuth(() => ud.toggle("APPLIED", h.source_id))}
          icon="✅"
          label="応募済み"
          activeLabel="応募済み"
          activeClass="bg-green-50 text-green-700 border-green-200"
        />
        <ActionButton
          active={ud.NOTES.has(h.source_id)}
          onClick={() => requireAuth(() => setShowNote(true))}
          icon="📝"
          label="メモ"
          activeLabel="メモあり"
          activeClass="bg-yellow-50 text-yellow-700 border-yellow-200"
        />
        <AddToCalendarButton hackathon={h} />
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
            <p className="text-base font-semibold text-gray-900">
              ログインが必要です
            </p>
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
