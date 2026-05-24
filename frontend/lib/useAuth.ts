"use client";

import { useEffect, useState } from "react";
import {
  getCurrentUser,
  signInWithRedirect,
  signOut as amplifySignOut,
  fetchUserAttributes,
  updateUserAttributes,
  type AuthUser,
} from "aws-amplify/auth";

const AVATAR_BASE = process.env.NEXT_PUBLIC_AVATAR_BASE_URL ?? "";

function buildAvatarUrl(userId: string, bust?: number): string {
  const base = `${AVATAR_BASE}/avatars/${userId}/avatar.jpg`;
  return bust ? `${base}?t=${bust}` : base;
}

export interface AuthState {
  user: AuthUser | null;
  name: string | null;
  avatarUrl: string | null;
  loading: boolean;
}

export function useAuth(): AuthState & {
  signIn: () => void;
  signOut: () => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  refreshAvatar: () => void;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(async (u) => {
        setUser(u);
        if (AVATAR_BASE) setAvatarUrl(buildAvatarUrl(u.userId));
        const attrs = await fetchUserAttributes().catch(() => ({}));
        const a = attrs as Record<string, string>;
        setName(a.preferred_username ?? a.name ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = () =>
    signInWithRedirect({ provider: { custom: "Google" } });

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
    setName(null);
    setAvatarUrl(null);
  };

  const updateName = async (newName: string) => {
    const trimmed = newName.trim();
    await updateUserAttributes({ userAttributes: { preferred_username: trimmed } });
    setName(trimmed);
  };

  const refreshAvatar = () => {
    if (user && AVATAR_BASE) setAvatarUrl(buildAvatarUrl(user.userId, Date.now()));
  };

  return { user, name, avatarUrl, loading, signIn, signOut, updateName, refreshAvatar };
}
