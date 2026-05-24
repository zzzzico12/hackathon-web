"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export type ActionType = "FAV" | "DONE" | "APPLIED" | "NOTE";

export interface UserDataState {
  FAV: Set<string>;
  DONE: Set<string>;
  APPLIED: Set<string>;
  NOTES: Map<string, string>;
  loading: boolean;
  needsLogin: boolean;
}

const EMPTY: UserDataState = {
  FAV: new Set(),
  DONE: new Set(),
  APPLIED: new Set(),
  NOTES: new Map(),
  loading: false,
  needsLogin: false,
};

async function getToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export function useUserData(loggedIn: boolean) {
  const [state, setState] = useState<UserDataState>({ ...EMPTY, loading: loggedIn });
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!loggedIn) {
      setState({ ...EMPTY });
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    apiFetch("/user/data")
      .then((r) => r.json())
      .then((data: { items: Array<{ SK: string; body?: string }> }) => {
        const FAV = new Set<string>();
        const DONE = new Set<string>();
        const APPLIED = new Set<string>();
        const NOTES = new Map<string, string>();
        for (const item of data.items ?? []) {
          const [type, ...rest] = item.SK.split("#");
          const sourceId = rest.join("#");
          if (type === "FAV") FAV.add(sourceId);
          else if (type === "DONE") DONE.add(sourceId);
          else if (type === "APPLIED") APPLIED.add(sourceId);
          else if (type === "NOTE") NOTES.set(sourceId, item.body ?? "");
        }
        setState({ FAV, DONE, APPLIED, NOTES, loading: false, needsLogin: false });
      })
      .catch(() => setState({ ...EMPTY }));
  }, [loggedIn]);

  const toggle = useCallback(
    async (type: "FAV" | "DONE" | "APPLIED", sourceId: string) => {
      if (!loggedIn) {
        setState((s) => ({ ...s, needsLogin: true }));
        return;
      }
      const key = type as keyof Pick<UserDataState, "FAV" | "DONE" | "APPLIED">;
      const has = state[key].has(sourceId);

      // Optimistic update
      setState((prev) => {
        const next = new Set(prev[key]);
        has ? next.delete(sourceId) : next.add(sourceId);
        return { ...prev, [key]: next };
      });

      try {
        if (has) {
          const sk = encodeURIComponent(`${type}#${sourceId}`);
          await apiFetch(`/user/data/${sk}`, { method: "DELETE" });
        } else {
          await apiFetch("/user/data", {
            method: "POST",
            body: JSON.stringify({ type, source_id: sourceId }),
          });
        }
      } catch {
        // Rollback
        setState((prev) => {
          const next = new Set(prev[key]);
          has ? next.add(sourceId) : next.delete(sourceId);
          return { ...prev, [key]: next };
        });
      }
    },
    [loggedIn, state]
  );

  const saveNote = useCallback(
    async (sourceId: string, body: string) => {
      if (!loggedIn) {
        setState((s) => ({ ...s, needsLogin: true }));
        return;
      }
      setState((prev) => {
        const next = new Map(prev.NOTES);
        body ? next.set(sourceId, body) : next.delete(sourceId);
        return { ...prev, NOTES: next };
      });
      if (body) {
        await apiFetch("/user/data", {
          method: "POST",
          body: JSON.stringify({ type: "NOTE", source_id: sourceId, body }),
        });
      } else {
        const sk = encodeURIComponent(`NOTE#${sourceId}`);
        await apiFetch(`/user/data/${sk}`, { method: "DELETE" });
      }
    },
    [loggedIn]
  );

  const dismissLogin = useCallback(
    () => setState((s) => ({ ...s, needsLogin: false })),
    []
  );

  return { ...state, toggle, saveNote, dismissLogin };
}
