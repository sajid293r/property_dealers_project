"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Users2 } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Customer } from "@/lib/types";
import { toast } from "sonner";

const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad", "Multan", "Gujranwala"] as const;

export function NewCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [cnic, setCnic] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState<string>("");

  function resetForm() {
    setName("");
    setCnic("");
    setPhone("");
    setCity("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      name,
      cnic,
      phone,
      city,
      balance: 0,
      totalPaid: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    queryClient.setQueryData<Customer[]>(["customers"], (old = []) => [newCustomer, ...old]);
    toast.success(`${name} added as a customer`);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Users2}
      title="Add Customer"
      description="Create a client record to book units against."
      submitLabel="Add Customer"
      submitDisabled={!name || !phone || !city}
      onSubmit={handleSubmit}
    >
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayesha Malik" />
      </Field>

      <FieldRow>
        <Field label="CNIC">
          <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="35201-1234567-1" />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
        </Field>
      </FieldRow>

      <Field label="City">
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select city" /></SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
