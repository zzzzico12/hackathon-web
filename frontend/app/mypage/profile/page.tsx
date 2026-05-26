"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/lib/useAuth";
import { User, Camera, Check, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function getToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const { user, name, avatarUrl, loading, updateName, refreshAvatar } = useAuth();
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (name !== null && nameValue === "") setNameValue(name);
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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("画像ファイルを選択してください");
      return;
    }
    // Local preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLocalPreview(ev.target?.result as string);
      setImgErr(false);
    };
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const token = await getToken();
      const presignRes = await fetch(`${API}/user/avatar/presign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content_type: file.type }),
      });
      if (!presignRes.ok) throw new Error("presign failed");
      const { upload_url } = await presignRes.json();

      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      refreshAvatar();
    } catch {
      setAvatarError("アップロードに失敗しました。もう一度お試しください。");
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValue.trim()) return;
    setNameSaving(true);
    setNameError(null);
    try {
      await updateName(nameValue);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch {
      setNameError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setNameSaving(false);
    }
  };

  const displaySrc = localPreview ?? (imgErr ? null : avatarUrl);

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

      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">

        {/* Avatar upload */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">アイコン画像</p>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {displaySrc ? (
                <img
                  src={displaySrc}
                  alt="avatar"
                  onError={() => { setImgErr(true); setLocalPreview(null); }}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-100"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center ring-2 ring-gray-100">
                  <User size={32} className="text-blue-400" />
                </div>
              )}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Camera size={14} />
                写真を選択
              </button>
              <p className="text-xs text-gray-400">JPG・PNG・GIF など</p>
              {avatarError && <p className="text-xs text-red-500">{avatarError}</p>}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Name edit */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">表示名</p>
          <form onSubmit={handleNameSave} className="space-y-3">
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              maxLength={50}
              placeholder="表示名を入力"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{nameValue.length}/50</p>
              {nameError && <p className="text-xs text-red-500">{nameError}</p>}
            </div>
            <button
              type="submit"
              disabled={nameSaving || !nameValue.trim() || nameValue.trim() === name}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {nameSaved ? (
                <><Check size={15} />保存しました</>
              ) : nameSaving ? (
                <><Loader2 size={15} className="animate-spin" />保存中...</>
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
