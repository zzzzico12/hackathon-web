"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Users } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/lib/useAuth";
import { BoardPostModal, type BoardItem } from "@/components/BoardPostModal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

type TabType = "team" | "reports";

interface Thread {
  post: BoardItem;
  replies: BoardItem[];
}

const SKILL_LABELS: Record<string, string> = {
  engineer: "エンジニア",
  designer: "デザイナー",
  pm: "PM・企画",
  data: "データ分析",
  other: "その他",
};

async function getToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m || 1}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function StarRow({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={i <= n ? "fill-amber-400 text-amber-400" : "text-gray-200"}
        />
      ))}
    </span>
  );
}

function SkillBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}

function ThreadCard({
  thread,
  tab,
  currentUserId,
  displayName,
  sourceId,
  onDelete,
  onReplyPosted,
}: {
  thread: Thread;
  tab: TabType;
  currentUserId: string | null;
  displayName: string | null;
  sourceId: string;
  onDelete: (sk: string) => void;
  onReplyPosted: (reply: BoardItem) => void;
}) {
  const { post, replies } = thread;
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReplySubmit = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const type = tab === "team" ? "TEAM" : "REPORT";
      const res = await fetch(
        `${API}/hackathons/${encodeURIComponent(sourceId)}/board`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            type,
            body: replyText.trim(),
            parent_sk: post.SK,
            display_name: displayName ?? "匿名",
          }),
        }
      );
      if (res.ok) {
        const { SK } = await res.json();
        onReplyPosted({
          hackathon_source_id: sourceId,
          SK,
          board_type: "REPLY",
          parent_sk: post.SK,
          display_name: displayName ?? "匿名",
          body: replyText.trim(),
          created_at: new Date().toISOString(),
        });
        setReplyText("");
        setShowReply(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canDeletePost = currentUserId && post.SK.endsWith(`#${currentUserId}`);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* Top-level post */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-700">
          {post.display_name || "匿名"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
          {canDeletePost && (
            <button
              onClick={() => onDelete(post.SK)}
              className="text-xs text-gray-300 hover:text-red-400 transition-colors leading-none"
              title="削除"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {tab === "team" && (
        <>
          {(post.skills?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-xs text-gray-400 self-center">提供:</span>
              {post.skills!.map((s) => (
                <SkillBadge key={s} label={SKILL_LABELS[s] ?? s} color="bg-blue-50 text-blue-700" />
              ))}
            </div>
          )}
          {(post.wants?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-xs text-gray-400 self-center">求む:</span>
              {post.wants!.map((s) => (
                <SkillBadge key={s} label={SKILL_LABELS[s] ?? s} color="bg-purple-50 text-purple-700" />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "reports" && post.rating != null && (
        <div className="mb-1.5">
          <StarRow n={post.rating} />
        </div>
      )}

      <p className="text-sm text-gray-700 leading-relaxed">{post.body}</p>

      {post.contact && (
        <p className="text-xs text-gray-400 mt-1.5">📨 {post.contact}</p>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-3 space-y-2.5 border-l-2 border-gray-100 pl-3.5">
          {replies.map((reply) => {
            const canDeleteReply = currentUserId && reply.SK.endsWith(`#${currentUserId}`);
            return (
              <div key={reply.SK}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium text-gray-600">
                    {reply.display_name || "匿名"}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-400">{timeAgo(reply.created_at)}</span>
                    {canDeleteReply && (
                      <button
                        onClick={() => onDelete(reply.SK)}
                        className="text-xs text-gray-300 hover:text-red-400 transition-colors leading-none"
                        title="削除"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{reply.body}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply input */}
      {currentUserId && (
        <div className="mt-3">
          {showReply ? (
            <div className="flex gap-2 items-start">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="返信を入力..."
                rows={2}
                autoFocus
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={handleReplySubmit}
                  disabled={!replyText.trim() || submitting}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  送信
                </button>
                <button
                  onClick={() => {
                    setShowReply(false);
                    setReplyText("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 text-center"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowReply(true)}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              💬 返信する
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function HackathonBoard({
  sourceId,
  title,
}: {
  sourceId: string;
  title: string;
}) {
  const { user, name, signIn } = useAuth();
  const [tab, setTab] = useState<TabType>("team");
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPostModal, setShowPostModal] = useState(false);

  const fetchItems = useCallback(
    async (t: TabType) => {
      setLoading(true);
      const res = await fetch(
        `${API}/hackathons/${encodeURIComponent(sourceId)}/board?tab=${t}`
      ).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      } else {
        setItems([]);
      }
      setLoading(false);
    },
    [sourceId]
  );

  useEffect(() => {
    fetchItems(tab);
  }, [fetchItems, tab]);

  const threads = useMemo<Thread[]>(() => {
    const parents = items.filter((i) => !i.parent_sk);
    const replies = items.filter((i) => i.parent_sk);
    // Show newest threads first
    const sorted = [...parents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted.map((post) => ({
      post,
      replies: replies.filter((r) => r.parent_sk === post.SK),
    }));
  }, [items]);

  const handleDelete = async (sk: string) => {
    const token = await getToken();
    const res = await fetch(
      `${API}/hackathons/${encodeURIComponent(sourceId)}/board/${encodeURIComponent(sk)}`,
      {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }
    );
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.SK !== sk));
    }
  };

  const handleReplyPosted = (reply: BoardItem) => {
    setItems((prev) => [...prev, reply]);
  };

  const handlePostSuccess = (newItem: BoardItem) => {
    setItems((prev) => [newItem, ...prev]);
    setShowPostModal(false);
  };

  return (
    <div className="mt-8">
      {/* Tab header + post button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(["team", "reports"] as TabType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t === "team" ? "チーム募集" : "参加レポート"}
            </button>
          ))}
        </div>
        {user ? (
          <button
            onClick={() => setShowPostModal(true)}
            className="text-sm px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            投稿する
          </button>
        ) : (
          <button
            onClick={signIn}
            className="text-sm px-3 py-1.5 rounded-full border border-blue-300 text-blue-600 font-medium hover:bg-blue-50 transition-colors"
          >
            ログインして投稿
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-24"
            />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center text-gray-400">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Users size={18} className="text-gray-300" />
          </div>
          <p className="text-sm">まだ投稿がありません</p>
          {user && (
            <p className="text-xs mt-1">「投稿する」から最初の投稿をしてみましょう</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <ThreadCard
              key={thread.post.SK}
              thread={thread}
              tab={tab}
              currentUserId={user?.userId ?? null}
              displayName={name}
              sourceId={sourceId}
              onDelete={handleDelete}
              onReplyPosted={handleReplyPosted}
            />
          ))}
        </div>
      )}

      {showPostModal && (
        <BoardPostModal
          type={tab === "team" ? "TEAM" : "REPORT"}
          sourceId={sourceId}
          hackathonTitle={title}
          displayName={name}
          onClose={() => setShowPostModal(false)}
          onSuccess={handlePostSuccess}
        />
      )}
    </div>
  );
}
