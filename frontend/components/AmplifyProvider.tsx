"use client";

import "@/lib/amplify";
import { AuthButton } from "@/components/AuthButton";
import { usePathname } from "next/navigation";

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideAuth = pathname?.startsWith("/users/");

  return (
    <>
      {!hideAuth && (
        <div className="fixed top-3 right-4 z-20">
          <AuthButton />
        </div>
      )}
      {children}
    </>
  );
}
