"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

interface Conversation {
  SK: string;
  other_user_id: string;
  other_display_name: string;
  last_message_body: string;
  last_sender_id: string;
  unread_count: number;
  updated_at: string;
}

interface DmMessage {
  SK: string;
  sender_id: string;
  sender_display_name: string;
  body: string;
  created_at: string;
}

async function getToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Tokyo" };
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ja-JP", { ...opts, hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨日";
  return d.toLocaleDateString("ja-JP", { ...opts, month: "narrow", day: "numeric" });
}

function fmtMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric",
  });
}

export function DmApp({
  initialWith,
  initialName,
}: {
  initialWith?: string;
  initialName?: string;
}) {
  const { user, name, loading, signIn } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchInbox = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API}/dm/inbox`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
    }
  }, []);

  const fetchMessages = useCallback(async (otherUserId: string) => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API}/dm/messages?with=${encodeURIComponent(otherUserId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setConversations(prev =>
        prev.map(c => c.other_user_id === otherUserId ? { ...c, unread_count: 0 } : c)
      );
      window.dispatchEvent(new Event("dm-inbox-updated"));
    }
  }, []);

  const openConversation = useCallback(
    async (otherUserId: string, otherName: string) => {
      setActiveUserId(otherUserId);
      setActiveName(otherName);
      setShowList(false);
      setMessages([]);
      await fetchMessages(otherUserId);
    },
    [fetchMessages]
  );

  // Initial load
  useEffect(() => {
    if (user) fetchInbox();
  }, [user, fetchInbox]);

  // Handle ?with= param after inbox loaded
  useEffect(() => {
    if (!user || !initialWith) return;
    const decodedName = initialName ? decodeURIComponent(initialName) : "匿名";
    openConversation(initialWith, decodedName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialWith]);

  // Poll messages when conversation is open
  useEffect(() => {
    if (!activeUserId) return;
    const id = setInterval(() => fetchMessages(activeUserId), 5000);
    return () => clearInterval(id);
  }, [activeUserId, fetchMessages]);

  // Poll inbox
  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchInbox, 30000);
    return () => clearInterval(id);
  }, [user, fetchInbox]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleSend = async () => {
    if (!inputText.trim() || !activeUserId || sending) return;
    const body = inputText.trim();
    setSending(true);
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const token = await getToken();
      const res = await fetch(`${API}/dm/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to_user_id: activeUserId,
          to_display_name: activeName ?? "匿名",
          sender_display_name: name ?? "匿名",
          body,
        }),
      });
      if (res.ok) {
        const { created_at } = await res.json();
        const newMsg: DmMessage = {
          SK: `MSG#${activeUserId}#${created_at}#local`,
          sender_id: user!.userId,
          sender_display_name: name ?? "匿名",
          body,
          created_at,
        };
        setMessages(prev => [...prev, newMsg]);
        setConversations(prev => {
          const exists = prev.find(c => c.other_user_id === activeUserId);
          const updated: Conversation = {
            SK: `CONV#${activeUserId}`,
            other_user_id: activeUserId,
            other_display_name: activeName ?? "匿名",
            last_message_body: body.slice(0, 50),
            last_sender_id: user!.userId,
            unread_count: 0,
            updated_at: created_at,
          };
          if (exists) {
            return prev.map(c => c.other_user_id === activeUserId ? updated : c)
              .sort((a, b) => b.updated_at > a.updated_at ? 1 : -1);
          }
          return [updated, ...prev];
        });
      }
    } finally {
      setSending(false);
    }
  };

  // ── Not logged in ──
  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600 text-sm">DMを使用するにはログインが必要です</p>
        <button
          onClick={signIn}
          className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Googleでログイン
        </button>
        <Link href="/" className="text-sm text-blue-500 hover:underline">← 一覧に戻る</Link>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-gray-50" />;

  // ── DM UI ──
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Mobile header */}
      <header className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-10 shrink-0">
        <div className="px-4 py-3 flex items-center gap-3">
          {!showList ? (
            <>
              <button
                onClick={() => { setShowList(true); }}
                className="text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="font-semibold text-gray-900 truncate">{activeName ?? "DM"}</span>
            </>
          ) : (
            <>
              <Link href="/" className="text-sm text-blue-600 shrink-0">← 戻る</Link>
              <span className="font-semibold text-gray-900">DM</span>
            </>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden max-w-4xl w-full mx-auto md:border-x md:border-gray-200 bg-white">

        {/* ── Conversation list (left panel) ── */}
        <div className={`
          w-full md:w-72 lg:w-80 shrink-0 flex flex-col border-r border-gray-100
          ${showList ? "flex" : "hidden md:flex"}
        `}>
          {/* Desktop panel header */}
          <div className="hidden md:flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
            <Link href="/" className="text-sm text-blue-600">← 戻る</Link>
            <span className="font-semibold text-gray-900">DM</span>
          </div>

          <div className="overflow-y-auto flex-1">
            {conversations.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-16">まだ会話がありません</p>
            ) : (
              conversations.map(conv => (
                <button
                  key={conv.SK}
                  onClick={() => openConversation(conv.other_user_id, conv.other_display_name)}
                  className={`w-full px-4 py-3.5 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                    activeUserId === conv.other_user_id ? "bg-blue-50 hover:bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm truncate mr-2 ${conv.unread_count > 0 ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                      {conv.other_display_name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-400">{fmtTime(conv.updated_at)}</span>
                      {conv.unread_count > 0 && (
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                          {conv.unread_count > 9 ? "9+" : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`text-xs truncate ${conv.unread_count > 0 ? "font-medium text-gray-700" : "text-gray-400"}`}>
                    {conv.last_sender_id === user?.userId ? "あなた: " : ""}
                    {conv.last_message_body}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Message panel (right panel) ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${!showList ? "flex" : "hidden md:flex"}`}>
          {activeUserId ? (
            <>
              {/* Desktop conversation header */}
              <div className="hidden md:flex items-center px-5 py-3 border-b border-gray-100 shrink-0">
                <span className="font-semibold text-gray-900">{activeName}</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                {messages.map((msg, i) => {
                  const isOwn = msg.sender_id === user?.userId;
                  const prevMsg = messages[i - 1];
                  const showDateLabel =
                    i === 0 ||
                    fmtDateLabel(prevMsg.created_at) !== fmtDateLabel(msg.created_at);
                  const showName = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id || showDateLabel);

                  return (
                    <div key={msg.SK}>
                      {showDateLabel && (
                        <p className="text-center text-xs text-gray-400 my-4">
                          {fmtDateLabel(msg.created_at)}
                        </p>
                      )}
                      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${
                        prevMsg && prevMsg.sender_id === msg.sender_id && !showDateLabel ? "mt-0.5" : "mt-3"
                      }`}>
                        <div className={`max-w-[72%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                          {showName && (
                            <p className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_display_name}</p>
                          )}
                          <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                            isOwn
                              ? "bg-blue-600 text-white rounded-br-md"
                              : "bg-gray-100 text-gray-800 rounded-bl-md"
                          }`}>
                            {msg.body}
                          </div>
                          <p className={`text-[10px] text-gray-400 mt-0.5 ${isOwn ? "mr-1 self-end" : "ml-1"}`}>
                            {fmtMsgTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <p className="text-center text-gray-400 text-sm pt-16">
                    メッセージを送ってみましょう
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="shrink-0 border-t border-gray-100 px-3 py-2.5 flex gap-2 items-end bg-white">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInput}
                  placeholder="メッセージを入力…"
                  rows={1}
                  className="flex-1 text-sm border border-gray-200 rounded-2xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 overflow-y-auto"
                  style={{ minHeight: "42px", maxHeight: "120px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sending}
                  className="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              会話を選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
