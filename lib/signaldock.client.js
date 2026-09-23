'use client';

import { createSignalDock } from '@fielddaylabs/signaldock-sdk';

const appKey = process.env.NEXT_PUBLIC_SIGNALDOCK_APP_KEY;

export const signalDock = appKey
  ? createSignalDock({
      baseUrl: process.env.NEXT_PUBLIC_SIGNALDOCK_BASE_URL,
      appKey,
    })
  : null;
