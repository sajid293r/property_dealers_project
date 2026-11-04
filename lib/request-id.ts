"use client";

import * as React from "react";

/** A fresh random id for one user action (sent as the Idempotency-Key header; see api/src/idempotency.ts). */
export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

/**
 * One request id for one form. Keep sending the same id while the person retries the same save (a slow answer, a flaky
 * connection, a second click): the server does the work once and hands back the first result. Call renew() after a save
 * went through, so the next record gets its own id.
 */
export function useRequestId() {
  const ref = React.useRef<string | null>(null);
  return React.useMemo(
    () => ({
      current: () => (ref.current ??= newRequestId()),
      renew: () => {
        ref.current = null;
      },
    }),
    [],
  );
}
