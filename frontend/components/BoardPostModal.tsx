"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

const SKILLS = [
  { id: "engineer", label: "エンジニア" },
  { id: "designer", label: "デザイナー" },
  { id: "pm", label: "PM・企画" },
  { id: "data", label: "データ分析" },
  { id: "other", label: "その他" },
];

async function getToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export interface BoardItem {
  hackathon_source_id: string;
  SK: string;
  board_type: "TEAM" | "REPORT" | "REPLY";
  parent_sk?: string;
  display_name: string;
  body: string;
  created_at: string;
  rating?: number;
  skills?: string[];
  wants?: string[];
  contact?: string;
}

function SkillSelector({
  label, selected, onToggle, activeClass,
}: {
  label: string;
  selected: string[];
  onToggle: (id: string) => void;
  activeClass: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {SKILLS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
              selected.includes(s.id)
                ? activeClass
                : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BoardPostModal({
  type,
  sourceId,
  hackathonTitle,
  displayName,
  onClose,
  onSuccess,
}: {
  type: "TEAM" | "REPORT";
  sourceId: string;
  hackathonTitle: string;
  displayName: string | null;
  onClose: () => void;
  onSuccess: (item: BoardItem) => void;
}) {
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [skills, setSkills] = useState<string[]>([]);
  const [wants, setWants] = useState<string[]>([]);
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);

  const handleSubmit = async () => {
    if (!body.trim()) {
      setError("内容を入力してください");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = {
        type,
        body: body.trim(),
        display_name: displayName ?? "匿名",
        hackathon_title: hackathonTitle,
      };
      if (type === "REPORT" && rating > 0) payload.rating = rating;
      if (type === "TEAM") {
        payload.skills = skills;
        payload.wants = wants;
        if (contact.trim()) payload.contact = contact.trim();
      }

      const res = await fetch(
        `${API}/hackathons/${encodeURIComponent(sourceId)}/board`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        setError("投稿に失敗しました");
        setSubmitting(false);
        return;
      }
      const { SK } = await res.json();
      onSuccess({
        hackathon_source_id: sourceId,
        SK,
        board_type: type,
        display_name: displayName ?? "匿名",
        body: body.trim(),
        created_at: new Date().toISOString(),
        ...(type === "REPORT" && rating > 0 ? { rating } : {}),
        ...(type === "TEAM" ? { skills, wants, contact: contact.trim() } : {}),
      });
    } catch {
      setError("エラーが発生しました");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {type === "TEAM" ? "チーム募集を投稿" : "参加レポートを投稿"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {type === "REPORT" && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">評価（任意）</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  className="focus:outline-none"
                >
                  <Star
                    size={26}
                    className={
                      n <= (hoverRating || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-200 hover:text-gray-300"
                    }
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {type === "TEAM" && (
          <>
            <SkillSelector
              label="提供できるスキル"
              selected={skills}
              onToggle={(id) => toggle(id, skills, setSkills)}
              activeClass="bg-blue-600 text-white border-blue-600"
            />
            <SkillSelector
              label="求めるスキル"
              selected={wants}
              onToggle={(id) => toggle(id, wants, setWants)}
              activeClass="bg-purple-600 text-white border-purple-600"
            />
          </>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            type === "TEAM"
              ? "自己紹介や参加の目的など..."
              : "ハッカソンの感想や参加報告..."
          }
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {type === "TEAM" && (
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="連絡先（Twitter/Discord など、任意）"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="w-full py-2.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {submitting ? "投稿中..." : "投稿する"}
        </button>
      </div>
    </div>
  );
}
