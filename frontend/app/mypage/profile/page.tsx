"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { User, Check } from "lucide-react";

export default function ProfilePage() {
  const { user, name, loading, updateName } = useAuth();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (name !== null && value === "") setValue(name);
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">ログインが必要です</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateName(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/mypage" className="text-sm text-blue-600 hover:underline shrink-0">
            ← マイページ
          </Link>
          <h1 className="text-lg font-bold text-gray-900">プロフィール設定</h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <User size={22} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{name ?? "ユーザー"}</p>
              <p className="text-xs text-gray-400 mt-0.5">現在の表示名</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                表示名を変更
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={50}
                placeholder="新しい表示名"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">{value.length}/50</p>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving || !value.trim() || value.trim() === name}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saved ? (
                <>
                  <Check size={15} />
                  保存しました
                </>
              ) : saving ? (
                "保存中..."
              ) : (
                "保存する"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
