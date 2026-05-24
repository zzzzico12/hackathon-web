"use client";

import { useAuth } from "@/lib/useAuth";

export function AuthButton() {
  const { user, name, loading, signIn, signOut } = useAuth();

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
      <span className="text-sm text-gray-700 hidden sm:inline">
        {name ?? "ユーザー"}
      </span>
      <a
        href="/mypage"
        className="text-sm px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
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
