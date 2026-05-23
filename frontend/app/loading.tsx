export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse">
      <div className="flex justify-between gap-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-5 bg-gray-100 rounded-full w-16 shrink-0" />
      </div>
      <div className="flex gap-3">
        <div className="h-3 bg-gray-100 rounded w-28" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
      <div className="flex gap-2">
        <div className="h-5 bg-yellow-50 rounded-full w-24" />
        <div className="h-5 bg-gray-100 rounded-full w-16" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-full" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
    </div>
  );
}
