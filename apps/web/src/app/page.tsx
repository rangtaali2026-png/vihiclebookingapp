'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function RootPage() {
  const router = useRouter();
  const { session, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && session) {
      if (session.role === 'SUPER_ADMIN') {
        router.replace('/super-admin/sites');
      } else if (session.role === 'DRIVER') {
        router.replace('/board');
      } else {
        router.replace('/bookings');
      }
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, session, router]);

  return (
    <div className="min-h-screen bg-[#F3F6FB] flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#2878F0] border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-xs font-bold text-[#142B4A] tracking-wider uppercase">
        Routing to SmartDrive...
      </p>
    </div>
  );
}
