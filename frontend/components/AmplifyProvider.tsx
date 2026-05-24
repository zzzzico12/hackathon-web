"use client";

import "@/lib/amplify";
import { AuthButton } from "@/components/AuthButton";

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed top-3 right-4 z-20">
        <AuthButton />
      </div>
      {children}
    </>
  );
}
