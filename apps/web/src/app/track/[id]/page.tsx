'use client';

import { use } from 'react';
import TrackPage from '../page';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DynamicTrackRoute({ params }: PageProps) {
  const resolvedParams = use(params);
  // Re-uses the existing TrackPage component with the route parameter
  return <TrackPage routeBookingId={resolvedParams.id} />;
}
