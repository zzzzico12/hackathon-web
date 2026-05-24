"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { User, Settings, MessageSquare } from "lucide-react";

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

      {/* Gear — profile settings */}
      <a
        href="/mypage/profile"
        title="プロフィール設定"
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Settings size={16} />
      </a>

      {/* DM icon — placeholder for future feature */}
      <button
        disabled
        title="近日公開予定"
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 cursor-not-allowed"
      >
        <MessageSquare size={16} />
      </button>

      <a
        href="/mypage"
        className="text-sm px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        マイページ
      </a>
      <button
        onClick={signOut}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        ログアウト
      </button>
    </div>
  );
}
