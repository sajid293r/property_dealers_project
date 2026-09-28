import { formatLedgerBalance } from "@/lib/chart-of-accounts";
import type { LedgerAccountBalance } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Static (non-collapsible) indented account tree for a printed-style
 * statement — Balance Sheet, P&L — as opposed to the interactive browser on
 * the Accounts page. Renders every node under `rootId` from a flattened,
 * already-balanced `LedgerAccountBalance[]` (see `buildChartOfAccounts`).
 */
export function AccountStatementTree({
  nodes,
  rootId,
}: {
  nodes: LedgerAccountBalance[];
  rootId: string;
}) {
  const childrenOf = new Map<string, LedgerAccountBalance[]>();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
  });
  const root = nodes.find((n) => n.id === rootId);
  if (!root || root.balance === 0) return null;

  function renderNode(n: LedgerAccountBalance) {
    const kids = childrenOf.get(n.id) ?? [];
    const hasChildren = kids.length > 0;
    if (!hasChildren && n.balance === 0) return null;

    return (
      <div key={n.id}>
        <div
          className={cn(
            "flex items-center justify-between gap-3 py-1.5",
            hasChildren ? "font-semibold" : "text-muted-foreground",
          )}
          style={{ paddingLeft: `${n.depth * 18}px` }}
        >
          <span className={cn(!hasChildren && "text-foreground")}>{n.name}</span>
          <span className={cn("shrink-0 tabular-nums", hasChildren && "font-semibold")}>
            {formatLedgerBalance(n.balance)}
          </span>
        </div>
        {hasChildren && <div className="border-b border-border/30 last:border-0">{kids.map(renderNode)}</div>}
      </div>
    );
  }

  return <div>{renderNode(root)}</div>;
}
