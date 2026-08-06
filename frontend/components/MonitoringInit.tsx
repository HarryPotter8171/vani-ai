'use client';

import { useEffect } from 'react';
import { initMonitoring } from '@/lib/monitoring';

/** Client-only boot of monitoring hooks (no UI). */
export function MonitoringInit() {
  useEffect(() => {
    initMonitoring();
  }, []);
  return null;
}
