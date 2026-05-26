"use client";

import { Share2, Check, Copy } from "lucide-react";
import { useState } from "react";

interface Props {
  name: string;
  count: number;
  url: string;
}

export function ShareButton({ name, count, url }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = `${name}のハッカソンポートフォリオ — ${count}件のハッカソンに参加しました`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        // fallthrough to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
    >
      {copied ? (
        <><Check size={15} className="text-green-500" />URLをコピーしました</>
      ) : (
        <><Share2 size={15} /><Copy size={13} />このポートフォリオをシェア</>
      )}
    </button>
  );
}
