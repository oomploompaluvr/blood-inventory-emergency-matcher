"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ErrorText, useAction } from "@/components/api-client";
import { Badge, BloodGroup, Card, fmtDate, fmtDateTime } from "@/components/ui";

interface DonorHit { donor_id: number; full_name: string; blood_group: string; phone: string; eligible_now: number; next_whole_blood_date: string }
interface DonorDetail {
  donor: { donor_id: number; full_name: string; blood_group: string; gender: string; weight_kg: number; is_active: number };
  eligibility: {
    age: number; last_donation_at: string | null; total_donations: number;
    eligible_now: number; next_whole_blood_date: string; apheresis_eligible_now: number; next_apheresis_date: string;
  };
}
interface Screening { _id: string; submittedAt: string; result: string; deferralReasons: string[] }
interface Unit { unit_id: number; unit_code: string; component_code: string; volume_ml: number; expires_at: string; status: string }

export function DonationForm({ initialDonorId, suggestedBag, screeningRequired }: {
  initialDonorId: number | null; suggestedBag: string; screeningRequired: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DonorHit[]>([]);
  const [donor, setDonor] = useState<DonorDetail | null>(null);
  const [screening, setScreening] = useState<Screening | null | undefined>(undefined);
  const [form, setForm] = useState({
    donation_type: "whole_blood", bag_number: suggestedBag, volume_ml: "450", hemoglobin_g_dl: "", weight_kg: "",
    platelet_count_k: "", notes: "", separate: true,
  });
  const apheresis = form.donation_type === "plateletpheresis";
  const [result, setResult] = useState<{ donationId: number; units: Unit[] } | null>(null);
  const router = useRouter();
  const search = useAction();
  const save = useAction();

  const pick = useCallback(async (id: number) => {
    setHits([]);
    setResult(null);
    await search.run(async () => {
      const d = await api<DonorDetail>(`/api/donors/${id}`);
      setDonor(d);
      setForm((f) => ({
        ...f, weight_kg: String(d.donor.weight_kg),
        volume_ml: f.donation_type === "plateletpheresis" ? f.volume_ml : d.donor.weight_kg >= 55 ? "450" : "350",
      }));
      if (screeningRequired) {
        const list = await api<Screening[]>(`/api/screening?donorId=${id}`);
        setScreening(list[0] ?? null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeningRequired]);

  useEffect(() => {
    if (initialDonorId) void pick(initialDonorId);
  }, [initialDonorId, pick]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    await search.run(async () => setHits(await api<DonorHit[]>(`/api/donors?q=${encodeURIComponent(q)}&limit=10`)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!donor) return;
    const body = { ...form, donor_id: donor.donor.donor_id, platelet_count_k: apheresis ? form.platelet_count_k : null };
    const r = await save.run(() => api<{ donationId: number; units: Unit[] }>("/api/donations", "POST", body));
    if (r) {
      setResult(r);
      const next = await api<{ bagNumber: string }>("/api/donations/next-bag");
      setForm((f) => ({ ...f, bag_number: next.bagNumber, hemoglobin_g_dl: "", platelet_count_k: "", notes: "" }));
      void pick(donor.donor.donor_id).then(() => setResult(r));
      router.refresh();
    }
  }

  const screeningAge = screening ? (Date.now() - new Date(screening.submittedAt).getTime()) / 86_400_000 : null;
  const screeningOk = !screeningRequired || (screening && screening.result === "eligible" && screeningAge! < 3);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const setType = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    const heavy = (donor?.donor.weight_kg ?? 60) >= 55;
    setForm({ ...form, donation_type: type, volume_ml: type === "plateletpheresis" ? "250" : heavy ? "450" : "350" });
  };
  const elig = donor?.eligibility;
  const eligibleForType = elig && (apheresis ? elig.apheresis_eligible_now : elig.eligible_now);
  const nextForType = elig && (apheresis ? elig.next_apheresis_date : elig.next_whole_blood_date);

  return (
    <div className="space-y-6">
      <Card title="1. Donor">
        <form onSubmit={find} className="flex gap-2">
          <input className="input" placeholder="Search name, phone or donor ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" disabled={search.busy}>Find</button>
        </form>
        <ErrorText error={search.error} />
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {hits.map((h) => (
              <li key={h.donor_id}>
                <button type="button" onClick={() => pick(h.donor_id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-background">
                  <BloodGroup group={h.blood_group} />
                  <span className="flex-1">{h.full_name} <span className="text-muted">· #{h.donor_id} · {h.phone}</span></span>
                  {h.eligible_now ? <Badge tone="ok">Eligible</Badge> : <Badge>From {fmtDate(h.next_whole_blood_date)}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {donor && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <BloodGroup group={donor.donor.blood_group} />
              <Link className="font-medium hover:underline" href={`/donors/${donor.donor.donor_id}`}>{donor.donor.full_name}</Link>
              <span className="text-muted">age {donor.eligibility.age} · {donor.eligibility.total_donations} donations · last {fmtDate(donor.eligibility.last_donation_at)}</span>
            </div>
            <div>
              {eligibleForType
                ? <Badge tone="ok">Eligible today for {apheresis ? "platelet apheresis" : "whole blood"}</Badge>
                : <Badge tone="critical">Not eligible for {apheresis ? "platelet apheresis" : "whole blood"}{nextForType && nextForType > new Date().toISOString().slice(0, 10) ? ` until ${fmtDate(nextForType)}` : " (age or weight)"}</Badge>}
            </div>
            {screeningRequired && (
              <div>
                {screening === null && <Badge tone="low">No screening on file</Badge>}
                {screening && (screening.result !== "eligible"
                  ? <Badge tone="critical">Screening deferred: {screening.deferralReasons.join("; ")}</Badge>
                  : screeningAge! >= 3 ? <Badge tone="low">Screening is older than 3 days ({fmtDateTime(screening.submittedAt)})</Badge>
                  : <Badge tone="ok">Screening passed {fmtDateTime(screening.submittedAt)}</Badge>)}
                {!screeningOk && <Link className="ml-2 underline" href={`/screening/new?donor=${donor.donor.donor_id}`}>Fill in questionnaire</Link>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="2. Collection">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="type">Donation type</label>
              <select id="type" className="input" value={form.donation_type} onChange={setType}>
                <option value="whole_blood">Whole blood (separated into red cells, plasma, platelets)</option>
                <option value="plateletpheresis">Platelet apheresis (single-donor platelets)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bag">Bag number</label>
              <input id="bag" className="input font-mono" value={form.bag_number} onChange={set("bag_number")} required />
            </div>
            <div>
              <label className="label" htmlFor="vol">{apheresis ? "Product volume (ml)" : "Bag volume"}</label>
              {apheresis ? (
                <input id="vol" className="input" type="number" min="150" max="500" value={form.volume_ml} onChange={set("volume_ml")} required />
              ) : (
                <select id="vol" className="input" value={form.volume_ml} onChange={set("volume_ml")}>
                  <option value="450">450 ml (55 kg and above)</option>
                  <option value="350">350 ml</option>
                </select>
              )}
            </div>
            <div>
              <label className="label" htmlFor="hb">Haemoglobin (g/dL)</label>
              <input id="hb" className="input" type="number" step="0.1" min="3" max="25" value={form.hemoglobin_g_dl} onChange={set("hemoglobin_g_dl")} required />
            </div>
            <div>
              <label className="label" htmlFor="wt">Weight today (kg)</label>
              <input id="wt" className="input" type="number" step="0.1" min="20" max="250" value={form.weight_kg} onChange={set("weight_kg")} required />
            </div>
          </div>
          {apheresis && (
            <div className="max-w-xs">
              <label className="label" htmlFor="plt">Pre-donation platelet count (×10³/µL)</label>
              <input id="plt" className="input" type="number" min="10" max="1500" value={form.platelet_count_k} onChange={set("platelet_count_k")} required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="notes">Notes</label>
            <input id="notes" className="input" value={form.notes} onChange={set("notes")} maxLength={255} />
          </div>
          {!apheresis && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.separate} onChange={set("separate")} />
              Separate into components (red cells, plasma, platelets)
            </label>
          )}
          <ErrorText error={save.error} />
          <button className="btn" disabled={!donor || save.busy}>{save.busy ? "Recording…" : "Record donation"}</button>
          {!donor && <span className="ml-3 text-sm text-muted">Choose a donor first.</span>}
        </form>
      </Card>

      {result && (
        <Card title={`Donation #${result.donationId} recorded`}>
          <table className="table">
            <thead><tr><th>Unit</th><th>Component</th><th>Volume</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {result.units.map((u) => (
                <tr key={u.unit_id}>
                  <td className="font-mono text-xs">{u.unit_code}</td>
                  <td>{u.component_code}</td>
                  <td className="tabular-nums">{u.volume_ml} ml</td>
                  <td>{fmtDate(u.expires_at)}</td>
                  <td><Badge>{u.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
