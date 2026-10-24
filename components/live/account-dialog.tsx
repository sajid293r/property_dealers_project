"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/live/search-select";
import { useCompany } from "@/lib/providers/company-provider";
import { useChartAccounts, useInvalidateFinance } from "@/lib/hooks/use-live";
import { createAccount } from "@/lib/api/finance";
import { toast } from "sonner";

/** Add a ledger account under a heading. The code is worked out by the system. */
export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { company } = useCompany();
  const { data: accounts } = useChartAccounts();
  const invalidate = useInvalidateFinance();
  const [parentId, setParentId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [requiresParty, setRequiresParty] = React.useState(false);
  const options = (accounts ?? [])
    .filter((a) => a.isGroup && a.active)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ value: a.id, label: a.name, hint: a.code }));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={BookOpen}
      title="New ledger account"
      description="Pick the heading it belongs to and give it a name. The account code is assigned automatically."
      submitLabel="Add account"
      submitDisabled={!parentId || name.trim().length < 2}
      onSubmit={async () => {
        await createAccount(company.id, { parentId: parentId!, name: name.trim(), requiresParty });
        await invalidate();
        toast.success(`${name.trim()} added`);
        setName("");
        setRequiresParty(false);
      }}
    >
      <Field label="Under heading">
        <SearchSelect options={options} value={parentId} onChange={setParentId} placeholder="Choose a heading" searchPlaceholder="Search headings" emptyText="No heading matches" />
      </Field>
      <Field label="Account name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Site Security Charges" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={requiresParty} onCheckedChange={(c) => setRequiresParty(c === true)} />
        Every entry must name a customer or supplier
      </label>
    </FormDialog>
  );
}
