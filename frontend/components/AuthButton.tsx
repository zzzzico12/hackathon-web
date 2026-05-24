"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { User, Settings, MessageSquare, Home, LogOut } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function getToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

function Avatar({ src, name }: { src: string | null; name: string | null }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      <img
        src={src}
        alt={name ?? "avatar"}
        onError={() => setErr(true)}
        className="w-7 h-7 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center ring-2 ring-white shrink-0">
      <User size={14} className="text-blue-600" />
    </div>
  );
}

export function AuthButton() {
  const { user, name, avatarUrl, loading, signIn, signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API}/dm/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        const total = (data.conversations ?? []).reduce(
          (sum: number, c: { unread_count?: number }) => sum + (c.unread_count ?? 0),
          0
        );
        setUnreadCount(total);
      }
    };

    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    window.addEventListener("dm-inbox-updated", fetchUnread);
    return () => {
      clearInterval(id);
      window.removeEventListener("dm-inbox-updated", fetchUnread);
    };
  }, [user]);

  if (loading) return null;

  if (!user) {
    return (
      <button
        onClick={signIn}
        className="text-sm px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        Googleでログイン
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Avatar */}
      <Avatar src={avatarUrl} name={name} />

      {/* Username */}
      <span className="text-sm font-medium text-gray-700 hidden sm:inline max-w-[120px] truncate">
        {name ?? "ユーザー"}
      </span>

      {/* Profile settings */}
      <a
        href="/mypage/profile"
        title="プロフィール設定"
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Settings size={16} />
      </a>

      {/* DM icon with unread badge */}
      <Link
        href="/dm"
        title="DM"
        className="relative w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
      >
        <MessageSquare size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>

      {/* My page */}
      <Link
        href="/mypage"
        title="マイページ"
        className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium w-7 h-7 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 sm:text-sm"
      >
        <Home size={14} className="sm:hidden" />
        <span className="hidden sm:inline">マイページ</span>
      </Link>

      {/* Sign out */}
      <button
        onClick={signOut}
        title="ログアウト"
        className="inline-flex items-center justify-center rounded-full w-7 h-7 sm:w-auto sm:h-auto text-gray-400 hover:text-gray-600 hover:bg-gray-100 sm:hover:bg-transparent transition-colors sm:text-xs sm:rounded-none"
      >
        <LogOut size={14} className="sm:hidden" />
        <span className="hidden sm:inline">ログアウト</span>
      </button>
    </div>
  );
}
