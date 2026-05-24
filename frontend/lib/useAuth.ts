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

export interface AuthState {
  user: AuthUser | null;
  name: string | null;
  loading: boolean;
}

export function useAuth(): AuthState & {
  signIn: () => void;
  signOut: () => Promise<void>;
  updateName: (newName: string) => Promise<void>;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(async (u) => {
        setUser(u);
        const attrs = await fetchUserAttributes().catch(() => ({}));
        const a = attrs as Record<string, string>;
        // preferred_username is the user-editable display name; fall back to Google name
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
  };

  const updateName = async (newName: string) => {
    const trimmed = newName.trim();
    await updateUserAttributes({ userAttributes: { preferred_username: trimmed } });
    setName(trimmed);
  };

  return { user, name, loading, signIn, signOut, updateName };
}
