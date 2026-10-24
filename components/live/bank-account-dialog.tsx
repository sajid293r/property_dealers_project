"use client";

import * as React from "react";
import { Landmark } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { BankSelect, type BankValue } from "@/components/live/bank-select";
import { useCompany } from "@/lib/providers/company-provider";
import { createBankAccount, type BankAccountRow } from "@/lib/api/finance";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { toast } from "sonner";

/** Add one of the company's own bank accounts. It gets its own ledger account automatically. */
export function BankAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (account: BankAccountRow) => void;
}) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [bank, setBank] = React.useState<BankValue>({ bankId: null, bankName: "" });
  const [branchName, setBranchName] = React.useState("");
  const [branchCode, setBranchCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [accountNo, setAccountNo] = React.useState("");
  const [iban, setIban] = React.useState("");

  function reset() {
    setBank({ bankId: null, bankName: "" });
    setBranchName("");
    setBranchCode("");
    setTitle("");
    setAccountNo("");
    setIban("");
  }

  async function submit() {
    const created = await createBankAccount(company.id, {
      bankId: bank.bankId ?? undefined,
      bankName: bank.bankId ? undefined : bank.bankName.trim(),
      branchName: branchName.trim() || undefined,
      branchCode: branchCode.trim() || undefined,
      accountTitle: title.trim(),
      accountNo: accountNo.trim(),
      iban: iban.trim().replace(/\s+/g, "") || undefined,
    });
    await invalidate();
    toast.success(`${created.bankName} account added`, { description: `Ledger account ${created.glCode}` });
    reset();
    onCreated?.(created);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      icon={Landmark}
      title="Add a bank account"
      description="Choose the bank from the list of Pakistani banks. Vouchers and bank reconciliation use this account."
      submitLabel="Add bank account"
      submitDisabled={(!bank.bankId && !bank.bankName.trim()) || !title.trim() || !accountNo.trim()}
      onSubmit={submit}
    >
      <Field label="Bank">
        <BankSelect value={bank} onChange={setBank} />
      </Field>
      <Field label="Account title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ByteCraft (Pvt) Ltd — Current A/C" />
      </Field>
      <FieldRow>
        <Field label="Account number">
          <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="0123-4567890" />
        </Field>
        <Field label="IBAN (optional)">
          <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="PK36HABB0000000123456702" maxLength={34} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Branch (optional)">
          <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Gulberg, Lahore" />
        </Field>
        <Field label="Branch code (optional)">
          <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="0123" />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
