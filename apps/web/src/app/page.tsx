import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-4 font-bold text-xl">
          PT
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Vehicle booking management systems
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enterprise Vehicle Booking Platform
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 text-left">
          <Link
            href="/bookings"
            className="group flex items-center justify-between p-4 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 transition"
          >
            <div>
              <p className="text-sm font-semibold text-blue-900">Booking Engine</p>
              <p className="text-xs text-blue-700 mt-0.5">Private & shared reservations, seat allocation, 1-click rebooking</p>
            </div>
            <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/fleet"
            className="group flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Fleet Inventory</p>
              <p className="text-xs text-slate-500 mt-0.5">Manage cars, 4/6-seaters, and 42/52-seater buses</p>
            </div>
            <span className="text-slate-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/super-admin/sites"
            className="group flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Super Admin Portal</p>
              <p className="text-xs text-slate-500 mt-0.5">Multi-tenant plant sites and fleet policy management</p>
            </div>
            <span className="text-slate-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
