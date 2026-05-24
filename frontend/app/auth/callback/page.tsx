"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { getCurrentUser } from "aws-amplify/auth";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // If already signed in (code already exchanged), redirect immediately
    getCurrentUser()
      .then(() => router.replace("/"))
      .catch(() => {
        // Wait for Amplify to finish the OAuth code exchange
        const unlisten = Hub.listen("auth", ({ payload }) => {
          if (payload.event === "signedIn") {
            unlisten();
            router.replace("/");
          }
        });
        // Fallback redirect after 5s
        const t = setTimeout(() => router.replace("/"), 5000);
        return () => {
          unlisten();
          clearTimeout(t);
        };
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">ログイン処理中...</p>
    </div>
  );
}
