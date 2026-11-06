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

/**
 * What the guard knows about the page's requests (those with a screen watching them):
 *  fetching: running, or paused (a failed request waits to retry while the browser tab is in the background: still unsettled)
 *  waiting:  registered but not started (disabled until something else arrives)
 *  failed:   failed and has nothing to show
 *  answered: delivered data, or answered 404 (a screen shows "not found" itself)
 *  total:    every request registered so far
 */
type Snapshot = { fetching: number; waiting: number; failed: number; answered: number; total: number };

// a missing record (404) is an answer the screen shows itself ("not found"), not a failure of the page
const isMissing = (e: unknown) => e instanceof ApiError && e.status === 404;
// A query marked `meta: { quiet: true }` is left out (shell parts such as the top bar's cash figure observe queries of their own; counting one as
// "the page was answered" made the guard decide "ok" about 0.7 s after a hard load, before a slow page had even started: QA BUG-020, second cause).
const observed = (q: Query) => q.getObserversCount() > 0 && q.meta?.quiet !== true;
// a request that still has nothing to show and is not a 404 answer
const unanswered = (q: Query) => q.state.data === undefined && !isMissing(q.state.error);
const watched = (q: Query) => observed(q) && unanswered(q);

function readSnapshot(qc: QueryClient): string {
  let fetching = 0, waiting = 0, failed = 0, answered = 0, total = 0;
  for (const q of qc.getQueryCache().getAll()) {
    if (!observed(q)) continue;
    total++;
    if (!unanswered(q)) { answered++; continue; }
    // "fetching" AND "paused": TanStack pauses a failed request's retry while the tab is hidden, and a paused request is not a settled one
    if (q.state.fetchStatus !== "idle") fetching++;
    else if (q.state.status === "error") failed++;
    else waiting++;
  }
  return `${fetching}|${waiting}|${failed}|${answered}|${total}`;
}

function firstFailure(qc: QueryClient): { message: string; requestId?: string } | null {
  for (const q of qc.getQueryCache().getAll()) {
    if (watched(q) && q.state.status === "error" && q.state.fetchStatus === "idle") {
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
    () => "0|0|0|0|0",
  );
  const [fetching, waiting, failed, answered, total] = raw.split("|").map(Number);
  return { fetching: fetching ?? 0, waiting: waiting ?? 0, failed: failed ?? 0, answered: answered ?? 0, total: total ?? 0 };
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
  // "started": give the page one beat to register its requests before we look at them at all
  const [started, setStarted] = React.useState(false);
  // BUG-020 (second cause): on a slow first visit the page's own code can arrive long after the guard has mounted; until then the route's
  // loading placeholder is on screen and the page has registered no request. "This page makes no request" may therefore only be concluded
  // once the page itself is running. Until then the children stay hidden behind the skeleton, so nothing the page paints on its first
  // render (zero tiles) can ever be seen; deciding early and taking it back afterwards always shows a flash.
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [settleAfterHydration, setSettleAfterHydration] = React.useState(false);
  const [giveUp, setGiveUp] = React.useState(false);
  const [stuckGrace, setStuckGrace] = React.useState(false);
  React.useEffect(() => {
    // While the page's own code is still downloading, Next shows the route's loading placeholder (app/dashboard/loading.tsx, marked
    // data-route-loading) inside this wrapper; the page replaces it the moment it runs. So "the page is running" = the placeholder is gone.
    // (Checked in the browser: with the page's code delayed 6 s the placeholder is there for 6 s. If it were ever renamed, the 20 s limit
    // below keeps pages usable, and e2e/qa/guard-timeline.mjs fails loudly: pages without requests would sit on the skeleton for 20 s.)
    // Both signals are needed: right after a hard load the wrapper first holds the page's server-rendered markup (no placeholder yet, but
    // none of its elements has run), and only later the placeholder. Elements React has hydrated or created carry a private "__reactFiber$"
    // key (checked on every screen: a running page has no element without it).
    const isHydrated = () => {
      const root = wrapRef.current;
      if (!root || root.querySelector("[data-route-loading]")) return false;
      for (const node of Array.from(root.querySelectorAll("*")).slice(0, 4000)) {
        if (!Object.keys(node).some((k) => k.startsWith("__reactFiber$"))) return false;
      }
      return true;
    };
    const poll = window.setInterval(() => { if (isHydrated()) { setHydrated(true); window.clearInterval(poll); } }, 50);
    const ids = [window.setTimeout(() => setStarted(true), 80), window.setTimeout(() => setStuckGrace(true), 1500), window.setTimeout(() => setGiveUp(true), 20000)];
    return () => { window.clearInterval(poll); ids.forEach((id) => window.clearTimeout(id)); };
  }, []);
  React.useEffect(() => {
    // the page's requests register in the same commit that hydrates it; a short beat covers the passive effects
    if (!hydrated) return;
    const id = window.setTimeout(() => setSettleAfterHydration(true), 250);
    return () => window.clearTimeout(id);
  }, [hydrated]);
  const noRequestGrace = settleAfterHydration || giveUp;
  const [retrying, setRetrying] = React.useState(false);
  // latched the first time the page has settled: "ok" (data is there) or "failed" (a request failed, nothing to show)
  const [outcome, setOutcome] = React.useState<"ok" | "failed" | null>(null);
  // QA BUG-020: never decide "ok" just because nothing is running at this instant (a retry can be paused, a request can register a
  // moment late). The page must have been answered (data, or a 404 it shows itself) or have failed. Only a page that never
  // registered a request (once it is running), or whose requests never started, falls back to a timer. (Shell queries are excluded in `observed`.)
  const evidence = snap.failed > 0 || snap.answered > 0;
  const settled = snap.fetching === 0 && (evidence ? snap.waiting === 0 || stuckGrace : snap.total === 0 ? noRequestGrace : stuckGrace);
  const target = snap.failed > 0 ? "failed" : "ok";
  // a page that has shown its data stays "ok" (later trouble is a notice); a panel may clear when the data later arrives
  if (started && !retrying && settled && outcome !== "ok" && outcome !== target) setOutcome(target);

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
      <div ref={wrapRef} className={loading || failed ? "invisible" : undefined} inert={loading || failed ? true : undefined}>{children}</div>
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
