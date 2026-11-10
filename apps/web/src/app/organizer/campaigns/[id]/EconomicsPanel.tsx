"use client";

import { useEffect, useState } from "react";
import { Figure, Notice, Field, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Econ {
  observedSupplyApr: string;
  utilizationBps: number;
  grossYield: string;
  yieldPerDay: string;
  platformFee: string;
  settlementCosts: string;
  rewardPerPeriod: string;
  rewardPerWinnerPerPeriod: string;
  breakEvenDays: number | null;
  warnings: string[];
  viable: boolean;
  formatted: Record<string, string>;
  assumptions: string[];
}

/** Live, clearly-labelled estimate from the real RHEA market. Never used for payouts. */
export function EconomicsPanel({ periods, winners, minPayout, budget, token }: { periods: number; winners: number; minPayout: string; budget: string; token: { symbol: string } }) {
  const [principal, setPrincipal] = useState("1000");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Econ | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setError(null);
      try {
        const q = new URLSearchParams({ principal, days: String(days), periods: String(periods), winners: String(winners), minPayout: minPayout || "0", budget: budget || "0" });
        setData(await api<Econ>(`/api/economics?${q}`));
      } catch (e) {
        setData(null);
        setError(e instanceof ApiError ? e.message : "Estimate unavailable.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [principal, days, periods, winners, minPayout, budget]);

  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-sm font-semibold">Is this worth it? A live estimate</p>
      <p className="text-[12.5px] text-ink-3">Uses the RHEA USDC market's current rate. Rates change constantly; nothing here is guaranteed.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={`Deposit (${token.symbol})`} htmlFor="econ-p">
          <input id="econ-p" inputMode="decimal" className={inputClass} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </Field>
        <Field label="Mission length (days)" htmlFor="econ-d">
          <input id="econ-d" type="number" min={1} max={730} className={inputClass} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
      </div>
      {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure kind="estimate" label="Current supply rate" value={`${(Number(data.observedSupplyApr) * 100).toFixed(2)}%`} help={`Market ${(data.utilizationBps / 100).toFixed(1)}% borrowed`} />
            <Figure kind="estimate" label="Interest per day" value={data.formatted.yieldPerDay} unit={token.symbol} />
            <Figure kind="estimate" label="Interest over campaign" value={data.formatted.grossYield} unit={token.symbol} />
            <Figure kind="estimate" label="Per winner per period" value={data.formatted.rewardPerWinnerPerPeriod} unit={token.symbol} />
          </div>
          <ul className="mt-3 space-y-1 text-[12.5px] text-ink-3">
            {data.assumptions.map((a) => (
              <li key={a}>• {a}</li>
            ))}
            {data.breakEvenDays !== null && <li>• Shortest period whose interest covers one settlement: about {data.breakEvenDays} day(s).</li>}
          </ul>
          {data.warnings.length > 0 && (
            <div className="mt-3">
              <Notice tone="warn" title={data.viable ? "Heads up" : "This setup is not economically viable"}>
                <ul className="list-disc pl-5">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </>
      )}
    </div>
  );
}
