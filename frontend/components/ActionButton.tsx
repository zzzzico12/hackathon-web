"use client";

import type { ReactNode } from "react";

interface Props {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  activeLabel?: string;
  activeClass?: string;
}

export function ActionButton({
  active,
  onClick,
  icon,
  label,
  activeLabel,
  activeClass = "bg-blue-50 text-blue-700 border-blue-200",
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
        active
          ? activeClass
          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {icon}
      <span>{active ? (activeLabel ?? label) : label}</span>
    </button>
  );
}
