"use client";

import { useId, useMemo, type ChangeEvent } from "react";
import { normalizeUrl, type LaunchLinks, type MintInfo } from "@/lib/collectionInfo";
import { parseAmount } from "@/lib/format";
import { parseAddressList } from "@/lib/merkle";
import { MAX_WHITELIST_SIZE } from "@/lib/config";

export type LaunchInfoState = {
  mintPrice: string; // KII per NFT in the public mint ("0" = free)
  maxPerWallet: string; // "" = unlimited
  startDate: string; // public mint start
  startTime: string;
  endDate: string; // mint end (trading opens)
  endTime: string;
  // whitelist
  wlEnabled: boolean;
  wlAddresses: string;
  wlStartDate: string;
  wlStartTime: string;
  wlEndDate: string;
  wlEndTime: string;
  wlPrice: string; // "" = same as public price
  // reveal
  revealEnabled: boolean;
  revealDate: string;
  revealTime: string;
  // links
  twitter: string;
  website: string;
  telegram: string;
  discord: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function parts(d: Date) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const inHours = (h: number) => new Date(Date.now() + h * 3600 * 1000);

/// Mint starts now and runs for a week by default, so the form is valid out of the box.
export function defaultLaunchInfo(): LaunchInfoState {
  const now = parts(new Date());
  const end = parts(inHours(24 * 7));
  const wlEnd = parts(inHours(24));
  const reveal = parts(inHours(24 * 3));
  return {
    mintPrice: "0",
    maxPerWallet: "",
    startDate: now.date,
    startTime: now.time,
    endDate: end.date,
    endTime: end.time,
    wlEnabled: false,
    wlAddresses: "",
    wlStartDate: now.date,
    wlStartTime: now.time,
    wlEndDate: wlEnd.date,
    wlEndTime: wlEnd.time,
    wlPrice: "",
    revealEnabled: false,
    revealDate: reveal.date,
    revealTime: reveal.time,
    twitter: "",
    website: "",
    telegram: "",
    discord: "",
  };
}

export type LaunchBuild = {
  error?: string;
  links: LaunchLinks;
  mint: MintInfo; // written to collection.json
  chain: { mintPrice: bigint; start: bigint; end: bigint; perWallet: bigint };
  whitelist?: { addresses: string[]; start: bigint; end: bigint; price: bigint };
  reveal?: { at: bigint; iso: string };
};

const EMPTY: LaunchBuild["chain"] = { mintPrice: 0n, start: 0n, end: 0n, perWallet: 0n };
const fail = (error: string, links: LaunchLinks = {}): LaunchBuild => ({ error, links, mint: {}, chain: EMPTY });

/// Validate the form and convert it into contract arguments + collection.json content.
export function buildLaunchInfo(s: LaunchInfoState): LaunchBuild {
  const links: LaunchLinks = {};
  const fields: [keyof LaunchLinks, string, string][] = [
    ["twitter", s.twitter, "X (Twitter) link"],
    ["website", s.website, "Website"],
    ["telegram", s.telegram, "Telegram link"],
    ["discord", s.discord, "Discord link"],
  ];
  for (const [key, raw, label] of fields) {
    const n = normalizeUrl(raw);
    if (!n.valid) return fail(`${label} isn't a valid URL.`);
    if (n.url) links[key] = n.url;
  }

  const price = s.mintPrice.trim() === "" ? 0n : parseAmount(s.mintPrice);
  if (price === null) return fail("Mint price must be a number (0 for a free mint).");

  let perWallet = 0n;
  if (s.maxPerWallet.trim() !== "") {
    if (!/^\d+$/.test(s.maxPerWallet.trim()) || BigInt(s.maxPerWallet.trim()) === 0n) return fail("Mints per wallet must be a whole number (or leave it empty for no limit).");
    perWallet = BigInt(s.maxPerWallet.trim());
  }

  if (!s.startDate || !s.startTime || !s.endDate || !s.endTime) return fail("Choose the mint start and end (day and time).");
  const start = new Date(`${s.startDate}T${s.startTime}`);
  const end = new Date(`${s.endDate}T${s.endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fail("That mint day/time isn't valid.");
  if (end.getTime() <= Date.now() + 60_000) return fail("The mint end must be in the future.");
  if (end.getTime() <= start.getTime()) return fail("The mint must end after it starts.");

  const startsNow = start.getTime() <= Date.now() + 60_000;

  // ---- whitelist ----
  let whitelist: LaunchBuild["whitelist"];
  if (s.wlEnabled) {
    const { valid } = parseAddressList(s.wlAddresses);
    if (valid.length === 0) return fail("Add at least one valid wallet address to the whitelist, or switch the whitelist off.");
    if (valid.length > MAX_WHITELIST_SIZE) return fail(`A whitelist can hold up to ${MAX_WHITELIST_SIZE.toLocaleString()} addresses.`);
    const wlStart = new Date(`${s.wlStartDate}T${s.wlStartTime}`);
    const wlEnd = new Date(`${s.wlEndDate}T${s.wlEndTime}`);
    if (Number.isNaN(wlStart.getTime()) || Number.isNaN(wlEnd.getTime())) return fail("Choose the whitelist opening and closing day and time.");
    if (wlEnd.getTime() <= Date.now() + 60_000) return fail("The whitelist window must end in the future.");
    if (wlEnd.getTime() <= wlStart.getTime()) return fail("The whitelist must close after it opens.");
    if (startsNow) return fail("With a whitelist, set the public mint to start when the whitelist window ends (or later), not immediately.");
    if (wlEnd.getTime() > start.getTime()) return fail("The whitelist window must end before (or exactly when) the public mint starts.");
    const wlPrice = s.wlPrice.trim() === "" ? price : parseAmount(s.wlPrice);
    if (wlPrice === null) return fail("Whitelist price must be a number.");
    whitelist = {
      addresses: valid,
      start: wlStart.getTime() <= Date.now() + 60_000 ? 0n : BigInt(Math.floor(wlStart.getTime() / 1000)),
      end: BigInt(Math.floor(wlEnd.getTime() / 1000)),
      price: wlPrice,
    };
  }

  // ---- reveal ----
  let reveal: LaunchBuild["reveal"];
  if (s.revealEnabled) {
    const at = new Date(`${s.revealDate}T${s.revealTime}`);
    if (Number.isNaN(at.getTime())) return fail("Choose the reveal day and time.");
    if (at.getTime() <= Date.now() + 60_000) return fail("The reveal must be in the future. Switch the reveal off to show the real images immediately.");
    reveal = { at: BigInt(Math.floor(at.getTime() / 1000)), iso: at.toISOString() };
  }

  return {
    links,
    mint: { startsAt: (startsNow ? new Date() : start).toISOString(), endsAt: end.toISOString() },
    chain: {
      mintPrice: price,
      start: startsNow ? 0n : BigInt(Math.floor(start.getTime() / 1000)),
      end: BigInt(Math.floor(end.getTime() / 1000)),
      perWallet,
    },
    whitelist,
    reveal,
  };
}

function Toggle({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-500" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={`${id}-desc`} />
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-white">
          {label}
        </label>
        <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function LaunchInfoFields({
  value,
  onChange,
  placeholderFile,
  onPlaceholder,
}: {
  value: LaunchInfoState;
  onChange: (v: LaunchInfoState) => void;
  placeholderFile: File | null;
  onPlaceholder: (f: File | null) => void;
}) {
  const uid = useId();
  const set = (k: keyof LaunchInfoState) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const id = (n: string) => `${uid}-${n}`;
  const wl = useMemo(() => (value.wlEnabled ? parseAddressList(value.wlAddresses) : { valid: [], invalid: [] }), [value.wlEnabled, value.wlAddresses]);

  async function loadList(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    onChange({ ...value, wlAddresses: (value.wlAddresses ? value.wlAddresses + "\n" : "") + text });
    e.target.value = "";
  }

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------------- mint */}
      <fieldset>
        <legend className="eyebrow mb-4">Public mint</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id("price")}>
              Mint price per NFT (KII)
            </label>
            <input id={id("price")} className="input" inputMode="decimal" value={value.mintPrice} onChange={set("mintPrice")} placeholder="0 for a free mint" />
            <p className="hint">Paid by minters to you. You withdraw it from the collection page.</p>
          </div>
          <div>
            <label className="label" htmlFor={id("limit")}>
              Limit per wallet
            </label>
            <input id={id("limit")} className="input" inputMode="numeric" value={value.maxPerWallet} onChange={set("maxPerWallet")} placeholder="No limit" />
          </div>
          <div>
            <label className="label" htmlFor={id("sd")}>
              Public mint start day
            </label>
            <input id={id("sd")} type="date" className="input" value={value.startDate} onChange={set("startDate")} required />
          </div>
          <div>
            <label className="label" htmlFor={id("st")}>
              Public mint start time (your local time)
            </label>
            <input id={id("st")} type="time" className="input" value={value.startTime} onChange={set("startTime")} required />
          </div>
          <div>
            <label className="label" htmlFor={id("ed")}>
              Mint end day
            </label>
            <input id={id("ed")} type="date" className="input" value={value.endDate} onChange={set("endDate")} required />
          </div>
          <div>
            <label className="label" htmlFor={id("et")}>
              Mint end time
            </label>
            <input id={id("et")} type="time" className="input" value={value.endTime} onChange={set("endTime")} required />
          </div>
        </div>
        <p className="hint mt-3">Followers mint from your minting link between these times. Buying and selling opens once the mint ends, when it sells out, or when you end it early.</p>
      </fieldset>

      {/* ----------------------------------------------------------- whitelist */}
      <fieldset>
        <legend className="eyebrow mb-4">Whitelist</legend>
        <Toggle
          id={id("wl")}
          checked={value.wlEnabled}
          onChange={(v) => onChange({ ...value, wlEnabled: v, ...(v ? { startDate: value.wlEndDate, startTime: value.wlEndTime } : {}) })}
          label="Enable a whitelist"
          description="Only the wallets you list can mint during the whitelist window. The public mint opens afterwards."
        />
        {value.wlEnabled && (
          <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.07] bg-black/20 p-5">
            <div>
              <label className="label" htmlFor={id("wla")}>
                Whitelisted wallet addresses
              </label>
              <textarea
                id={id("wla")}
                className="input font-mono text-xs"
                rows={6}
                value={value.wlAddresses}
                onChange={(e) => onChange({ ...value, wlAddresses: e.target.value })}
                placeholder={"0x1234...\n0xabcd...\nOne per line, or separated by commas."}
                aria-describedby={id("wla-hint")}
              />
              <p id={id("wla-hint")} className="hint">
                {wl.valid.length.toLocaleString()} valid address{wl.valid.length === 1 ? "" : "es"}
                {wl.invalid.length > 0 ? `, ${wl.invalid.length} entr${wl.invalid.length === 1 ? "y" : "ies"} ignored (not a valid address)` : ""}. Up to {MAX_WHITELIST_SIZE.toLocaleString()}.
                The list is published on IPFS so anyone can verify it, so only include wallets that agreed to be listed.
              </p>
              <div className="mt-2">
                <label htmlFor={id("wlf")} className="btn btn-secondary btn-sm cursor-pointer">
                  Add addresses from a .csv or .txt file
                </label>
                <input id={id("wlf")} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void loadList(e)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={id("wlsd")}>
                  Whitelist opens (day)
                </label>
                <input id={id("wlsd")} type="date" className="input" value={value.wlStartDate} onChange={set("wlStartDate")} />
              </div>
              <div>
                <label className="label" htmlFor={id("wlst")}>
                  Whitelist opens (time)
                </label>
                <input id={id("wlst")} type="time" className="input" value={value.wlStartTime} onChange={set("wlStartTime")} />
              </div>
              <div>
                <label className="label" htmlFor={id("wled")}>
                  Whitelist closes (day)
                </label>
                <input id={id("wled")} type="date" className="input" value={value.wlEndDate} onChange={set("wlEndDate")} />
              </div>
              <div>
                <label className="label" htmlFor={id("wlet")}>
                  Whitelist closes (time)
                </label>
                <input id={id("wlet")} type="time" className="input" value={value.wlEndTime} onChange={set("wlEndTime")} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={id("wlp")}>
                  Whitelist price per NFT (KII)
                </label>
                <input id={id("wlp")} className="input" inputMode="decimal" value={value.wlPrice} onChange={set("wlPrice")} placeholder="Same as the public price" />
              </div>
            </div>
            <p className="hint">The public mint start above must be at or after the moment the whitelist closes.</p>
          </div>
        )}
      </fieldset>

      {/* -------------------------------------------------------------- reveal */}
      <fieldset>
        <legend className="eyebrow mb-4">Reveal</legend>
        <Toggle
          id={id("rv")}
          checked={value.revealEnabled}
          onChange={(v) => onChange({ ...value, revealEnabled: v })}
          label="Hide the artwork until a reveal date"
          description="Until the reveal, every NFT shows one default placeholder image. After it, the real images and metadata appear."
        />
        {value.revealEnabled && (
          <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.07] bg-black/20 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={id("rvd")}>
                  Reveal day
                </label>
                <input id={id("rvd")} type="date" className="input" value={value.revealDate} onChange={set("revealDate")} />
              </div>
              <div>
                <label className="label" htmlFor={id("rvt")}>
                  Reveal time (your local time)
                </label>
                <input id={id("rvt")} type="time" className="input" value={value.revealTime} onChange={set("revealTime")} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor={id("rvi")}>
                Placeholder image <span className="font-normal text-zinc-400">(optional, a default is used if you skip this)</span>
              </label>
              <input
                id={id("rvi")}
                type="file"
                accept="image/*"
                className="input"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  onPlaceholder(f && f.type.startsWith("image/") ? f : null);
                }}
              />
              {placeholderFile && <p className="hint">Using {placeholderFile.name}</p>}
            </div>
            <p className="hint">
              The reveal changes what apps show. The folder holding the real metadata is written to the blockchain when you launch, so this is not a cryptographic secret. You can also reveal earlier from your collection page.
            </p>
          </div>
        )}
      </fieldset>

      {/* --------------------------------------------------------------- links */}
      <fieldset>
        <legend className="eyebrow mb-4">
          Social links <span className="normal-case tracking-normal text-zinc-400">(optional)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id("tw")}>
              Collection X (Twitter) link
            </label>
            <input id={id("tw")} className="input" value={value.twitter} onChange={set("twitter")} placeholder="https://x.com/yourcollection" />
          </div>
          <div>
            <label className="label" htmlFor={id("web")}>
              Website
            </label>
            <input id={id("web")} className="input" value={value.website} onChange={set("website")} placeholder="https://" />
          </div>
          <div>
            <label className="label" htmlFor={id("tg")}>
              Telegram link
            </label>
            <input id={id("tg")} className="input" value={value.telegram} onChange={set("telegram")} placeholder="https://t.me/..." />
          </div>
          <div>
            <label className="label" htmlFor={id("dc")}>
              Discord link
            </label>
            <input id={id("dc")} className="input" value={value.discord} onChange={set("discord")} placeholder="https://discord.gg/..." />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
