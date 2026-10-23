"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, useAction } from "./api-client";

const GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export interface DonorFormValues {
  full_name: string;
  gender: string;
  date_of_birth: string;
  weight_kg: string | number;
  blood_group: string;
  phone: string;
  email: string;
  preferred_channel: string;
  address_line: string;
  pincode: string;
}

export interface PincodeOption {
  pincode: string;
  area: string;
  city: string;
}

const EMPTY: DonorFormValues = {
  full_name: "", gender: "M", date_of_birth: "", weight_kg: "", blood_group: "O+", phone: "", email: "",
  preferred_channel: "call", address_line: "", pincode: "",
};
const CONTACT_FIELDS = ["phone", "email", "preferred_channel", "address_line", "pincode"];

/**
 * mode "create": POST /api/donors, then go to `redirectTo` (with the new id appended when it ends in "/").
 * mode "edit":   PATCH /api/donors/:id with only the changed fields.
 * contactOnly:   donors editing themselves may only change contact details.
 */
export function DonorForm({ mode, donorId, initial, pincodes, contactOnly = false, redirectTo }: {
  mode: "create" | "edit";
  donorId?: number;
  initial?: Partial<DonorFormValues>;
  pincodes: PincodeOption[];
  contactOnly?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const start = { ...EMPTY, ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? ""])) } as DonorFormValues;
  const [v, setV] = useState<DonorFormValues>(start);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: keyof DonorFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setV({ ...v, [k]: e.target.value });
  };
  const locked = (k: keyof DonorFormValues) => contactOnly && !CONTACT_FIELDS.includes(k);
  const place = pincodes.find((p) => p.pincode === v.pincode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (mode === "create") {
        const { donorId: id } = await api<{ donorId: number }>("/api/donors", "POST", v);
        router.push(redirectTo?.endsWith("/") ? `${redirectTo}${id}` : (redirectTo ?? `/donors/${id}`));
        router.refresh();
      } else {
        const changed = Object.fromEntries(
          Object.entries(v).filter(([k, val]) => String(val) !== String(start[k as keyof DonorFormValues]) && !locked(k as keyof DonorFormValues)),
        );
        if (!Object.keys(changed).length) return;
        await api(`/api/donors/${donorId}`, "PATCH", changed);
        setSaved(true);
        router.refresh();
      }
    });
  }

  const field = (k: keyof DonorFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <input id={k} className="input" value={v[k]} onChange={set(k)} disabled={locked(k)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("full_name", "Full name", { required: true, autoComplete: "name" })}
        {field("phone", "Phone", { required: true, inputMode: "tel", placeholder: "9876543210" })}
        <div>
          <label className="label" htmlFor="gender">Gender</label>
          <select id="gender" className="input" value={v.gender} onChange={set("gender")} disabled={locked("gender")}>
            <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
          </select>
        </div>
        {field("date_of_birth", "Date of birth", { type: "date", required: true })}
        <div>
          <label className="label" htmlFor="blood_group">Blood group</label>
          <select id="blood_group" className="input" value={v.blood_group} onChange={set("blood_group")} disabled={locked("blood_group")}>
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        {field("weight_kg", "Weight (kg)", { type: "number", step: "0.1", min: 20, max: 250, required: true })}
        {field("email", "Email (optional)", { type: "email", autoComplete: "email" })}
        <div>
          <label className="label" htmlFor="preferred_channel">Contact me by</label>
          <select id="preferred_channel" className="input" value={v.preferred_channel} onChange={set("preferred_channel")}>
            <option value="call">Phone call</option><option value="sms">SMS</option><option value="email">Email</option>
          </select>
        </div>
        {field("address_line", "Address (house, street)", { maxLength: 150, autoComplete: "street-address" })}
        <div>
          {field("pincode", "PIN code", { required: true, inputMode: "numeric", pattern: "[1-9][0-9]{5}", maxLength: 6,
            list: "pincode-options", autoComplete: "postal-code" })}
          <datalist id="pincode-options">
            {pincodes.map((p) => <option key={p.pincode} value={p.pincode}>{p.area}, {p.city}</option>)}
          </datalist>
          <p className="mt-1 text-xs text-muted">
            {place ? `${place.area}, ${place.city}` : v.pincode.length === 6 ? "Not in our PIN-code list" : "Used to find nearby donors during shortages"}
          </p>
        </div>
      </div>
      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Register donor" : "Save changes"}</button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
    </form>
  );
}
