"use client";

import { useEffect, useState } from "react";
import {
  getCurrentUser,
  signInWithRedirect,
  signOut as amplifySignOut,
  fetchUserAttributes,
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
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(async (u) => {
        setUser(u);
        const attrs = await fetchUserAttributes().catch(() => ({}));
        setName((attrs as Record<string, string>).name ?? null);
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

  return { user, name, loading, signIn, signOut };
}
