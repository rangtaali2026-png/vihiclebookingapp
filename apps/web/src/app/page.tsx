import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Vehicle booking management systems
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enterprise Vehicle Booking Platform
        </p>
        
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
          <Link
            href="/super-admin/sites"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Access Super Admin Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
