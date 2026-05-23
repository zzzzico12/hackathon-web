export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="space-y-2">
            <div className="h-5 bg-gray-100 rounded-full w-20" />
            <div className="h-7 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 bg-gray-100 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
            ))}
          </div>
          <div className="h-10 bg-blue-100 rounded-full w-full" />
        </div>
      </div>
    </main>
  );
}
