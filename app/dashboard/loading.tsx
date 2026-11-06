import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Shown the instant a dashboard link is clicked, until the page itself arrives. The sidebar and top bar stay put;
 * only this page-shaped placeholder shimmers (header, summary tiles, a table).
 */
export default function DashboardLoading() {
  return (
    // data-route-loading: LivePageGuard waits until this placeholder is gone before it concludes that a page makes no request of its own
    // (the page's own code has not arrived while it is shown; QA BUG-020)
    <div className="mx-auto max-w-[1400px] space-y-5" aria-busy="true" aria-live="polite" data-route-loading>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </Card>
    </div>
  );
}
