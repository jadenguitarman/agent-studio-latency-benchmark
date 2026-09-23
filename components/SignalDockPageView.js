'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signalDock } from '../lib/signaldock.client';

const campaign = 'agent-studio-latency-benchmark';
let lastPageKey = null;
let inFlightPageKey = null;

export function SignalDockPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!signalDock) return;

    const pageKey = pathname;
    if (pageKey === lastPageKey || pageKey === inFlightPageKey) return;

    inFlightPageKey = pageKey;
    void signalDock
      .pageView({ path: pathname, utm: { campaign } })
      .then(() => {
        lastPageKey = pageKey;
      })
      .catch(() => undefined)
      .finally(() => {
        if (inFlightPageKey === pageKey) inFlightPageKey = null;
      });
  }, [pathname]);

  return null;
}
