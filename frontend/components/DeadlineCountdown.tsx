"use client";

interface Props {
  entryDeadline: string;
}

export function DeadlineCountdown({ entryDeadline }: Props) {
  const daysLeft = Math.ceil(
    (new Date(entryDeadline).getTime() - Date.now()) / 86_400_000
  );

  if (daysLeft <= 0) return null;

  const color =
    daysLeft <= 3
      ? "bg-red-50 text-red-700"
      : daysLeft <= 7
        ? "bg-orange-50 text-orange-700"
        : "bg-gray-100 text-gray-600";

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      締切まで{daysLeft}日
    </span>
  );
}
