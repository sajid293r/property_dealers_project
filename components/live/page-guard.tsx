"use client";

import * as React from "react";
import { useQueryClient, type Query, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

/**
 * One place that answers "is this page's data here yet, and did it arrive?" for EVERY live screen (QA finding BUG-004:
 * a failed request used to look like "0 properties", and the tiles read 0 while still loading).
 *
 * It is mounted for real companies only (the demo has no server to fail). It watches every data request the page has started:
 *  - first load, nothing cached yet: the page is kept in the DOM (so its requests run) but hidden behind a skeleton;
 *  - a request failed and there is nothing to show: a clear message with a Try again button instead of the page;
 *  - a later refresh or a picker inside a dialog fails while the page has its data: a slim notice, page stays usable.
 * A page that already has cached data shows it at once. Mark a request `meta: { quiet: true }` to keep it out of this.
 */

type Snapshot = { fetching: number; failed: number };

// a missing record (404) is an answer the screen shows itself ("not found"), not a failure of the page
const isMissing = (e: unknown) => e instanceof ApiError && e.status === 404;
const watched = (q: Query) => q.getObserversCount() > 0 && q.meta?.quiet !== true && q.state.data === undefined && !isMissing(q.state.error);

function readSnapshot(qc: QueryClient): string {
  let fetching = 0;
  let failed = 0;
  for (const q of qc.getQueryCache().getAll()) {
    if (!watched(q)) continue;
    if (q.state.fetchStatus === "fetching") fetching++;
    else if (q.state.status === "error") failed++;
  }
  return `${fetching}|${failed}`;
}

function firstFailure(qc: QueryClient): { message: string; requestId?: string } | null {
  for (const q of qc.getQueryCache().getAll()) {
    if (watched(q) && q.state.status === "error" && q.state.fetchStatus !== "fetching") {
      const e = q.state.error;
      if (e instanceof ApiError) return { message: e.message, requestId: e.requestId };
      return { message: e instanceof Error ? e.message : "" };
    }
  }
  return null;
}

function useSnapshot(qc: QueryClient): Snapshot {
  const raw = React.useSyncExternalStore(
    (notify) => qc.getQueryCache().subscribe(notify),
    () => readSnapshot(qc),
    () => "0|0",
  );
  const [fetching, failed] = raw.split("|").map(Number);
  return { fetching: fetching ?? 0, failed: failed ?? 0 };
}

/** A placeholder shaped like a typical list screen: heading, a row of tiles, a table. */
function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[66px] rounded-xl" />)}
      </div>
      <Card className="space-y-2 p-4">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </Card>
    </div>
  );
}

export function LivePageGuard({ children }: { children: React.ReactNode }) {
  const t = useT();
  const qc = useQueryClient();
  const snap = useSnapshot(qc);
  // "started": give the page one beat to register its requests before we decide there is nothing to wait for
  const [started, setStarted] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setStarted(true), 80);
    return () => window.clearTimeout(id);
  }, []);
  const [retrying, setRetrying] = React.useState(false);
  // latched the first time everything has settled: "ok" (data is there) or "failed" (a request failed, nothing to show)
  const [outcome, setOutcome] = React.useState<"ok" | "failed" | null>(null);
  const settledAs = snap.failed > 0 ? "failed" : "ok";
  // before the first settle we latch either way; a page that has shown its data stays "ok" (later trouble is a notice)
  if (started && !retrying && snap.fetching === 0 && outcome !== settledAs && outcome !== "ok") setOutcome(settledAs);

  async function retry() {
    setRetrying(true);
    setOutcome(null);
    try {
      await qc.refetchQueries({ predicate: (q) => q.state.status === "error" && q.meta?.quiet !== true });
    } finally {
      setRetrying(false);
    }
  }

  const loading = outcome === null;
  const failed = outcome === "failed";
  const problem = failed || (outcome === "ok" && snap.failed > 0) ? firstFailure(qc) : null;

  return (
    <div className="relative" aria-busy={loading}>
      <div className={loading || failed ? "invisible" : undefined} inert={loading || failed ? true : undefined}>{children}</div>
      {loading && started && (
        <div className="absolute inset-x-0 top-0">
          <PageSkeleton />
        </div>
      )}
      {failed && (
        <div className="absolute inset-x-0 top-0 mx-auto max-w-xl py-16 text-center" role="alert">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warning/15 text-warning"><AlertTriangle className="size-6" /></span>
          <p className="mt-4 font-heading text-2xl font-semibold">{t("common.loadFailed.title")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("common.loadFailed.body")}</p>
          {problem?.message && <p className="mt-3 text-sm">{problem.message}</p>}
          <Button className="mt-5 gap-2" onClick={() => void retry()} disabled={retrying}>
            <RefreshCw className={`size-4 ${retrying ? "animate-spin" : ""}`} /> {t("common.retry")}
          </Button>
          {problem?.requestId && <p className="mt-4 text-xs text-muted-foreground">{t("common.loadFailed.reference", { id: problem.requestId.slice(0, 8) })}</p>}
        </div>
      )}
      {outcome === "ok" && snap.failed > 0 && (
        <div role="alert" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-warning/40 bg-card px-4 py-3 text-sm shadow-lg">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">{t("common.loadFailed.partial")}</span>
          <Button size="sm" variant="outline" onClick={() => void retry()}>{t("common.retry")}</Button>
        </div>
      )}
    </div>
  );
}
