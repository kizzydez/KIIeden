"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { ADDRESSES } from "@/lib/config";
import { useIsRwaAdmin } from "@/lib/data";
import { rwaFactoryAbi } from "@/lib/contracts";
import { useTx } from "@/lib/useTx";
import { usePreviewUrls } from "@/lib/usePreview";
import { parseAmount } from "@/lib/format";
import { hasPinataJwt, pinFile, pinFiles } from "@/lib/pinata";
import PinataKeyField from "@/components/PinataKeyField";
import DropZone from "@/components/DropZone";
import Steps from "@/components/Steps";
import Icon from "@/components/Icon";
import { PageHeader, Spinner, TxButton } from "@/components/ui";

const STEP_LABELS = ["Upload files", "Pin metadata", "Confirm in wallet", "Listed"];
const MAX_IMAGES = 20;
const PROPERTY_TYPES = ["Residential", "Commercial", "Land", "Industrial", "Mixed-use", "Hospitality", "Infrastructure", "Other"];
const SIZE_UNITS = ["sqm", "sqft", "acres", "hectares"];
const PAYOUTS = ["Monthly", "Quarterly", "Semi-annual", "Annual", "At exit"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="font-display font-semibold text-white border-b border-white/10 pb-2">{title}</p>
      {children}
    </div>
  );
}

export default function CreateRwaAssetPage() {
  const { isConnected } = useAccount();
  const tx = useTx();

  // identity
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [propertyType, setPropertyType] = useState("");
  // location
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  // size
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState("sqm");
  const [yearBuilt, setYearBuilt] = useState("");
  // descriptions
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [additional, setAdditional] = useState("");
  // ownership
  const [owner, setOwner] = useState("");
  const [structure, setStructure] = useState("");
  const [titleRef, setTitleRef] = useState("");
  // financials
  const [valuation, setValuation] = useState("");
  const [annualYield, setAnnualYield] = useState("");
  const [rental, setRental] = useState("");
  const [payout, setPayout] = useState("");
  // offering
  const [totalUnits, setTotalUnits] = useState("1000");
  const [pricePerUnit, setPricePerUnit] = useState("1");
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [ipoDays, setIpoDays] = useState("7");
  const [treasury, setTreasury] = useState("");
  // files
  const [images, setImages] = useState<File[]>([]);
  const previewFiles = useMemo(() => images, [images]);
  const previews = usePreviewUrls(previewFiles);
  const [docs, setDocs] = useState<File[]>([]);

  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const { isAdmin, isLoading: loadingAdmin } = useIsRwaAdmin();
  const working = step >= 0 && step < 3;
  const busy = working || tx.busy;

  function addImages(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length < files.length) setError("Some files were skipped because they aren't images.");
    else setError("");
    setImages((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...imgs.filter((f) => !seen.has(`${f.name}|${f.size}`))].slice(0, MAX_IMAGES);
    });
  }

  function makeCover(i: number) {
    setImages((prev) => [prev[i], ...prev.filter((_, idx) => idx !== i)]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const units = parseAmount(totalUnits);
    const price = parseAmount(pricePerUnit);
    const days = parseFloat(ipoDays);
    if (images.length === 0) return setError("Add at least one image (5 or more is recommended).");
    if (units === null || units === 0n || units % 10n ** 18n !== 0n) return setError("Total units must be a whole number of at least 1.");
    if (price === null || price === 0n) return setError("Price per unit must be greater than 0.");
    if (!(days > 0)) return setError("IPO duration must be more than 0 days.");
    if (!isAddress(treasury)) return setError("Enter a valid treasury address (0x…).");
    let startTs = 0;
    if (!startNow) {
      const when = new Date(`${startDate}T${startTime}`);
      if (!startDate || !startTime || Number.isNaN(when.getTime())) return setError("Choose the IPO start day and time, or tick “Open immediately”.");
      if (when.getTime() <= Date.now() + 5 * 60_000) return setError("The IPO start must be at least a few minutes in the future (or open it immediately).");
      startTs = Math.floor(when.getTime() / 1000);
    }
    if (!(parseFloat(sizeValue) > 0)) return setError("Enter the asset's size as a number greater than 0.");
    if (details.trim().length < 100) return setError("The detailed description needs at least 100 characters — buyers rely on it.");
    if (docs.length === 0) return setError("Attach at least one legal document (title deed, valuation report, SPV papers…).");
    if (annualYield.trim() && !(parseFloat(annualYield) >= 0)) return setError("Expected annual yield must be a number.");
    if (!hasPinataJwt()) return setError("Add your Pinata JWT in the IPFS box above first.");

    try {
      setStep(0);
      setProgress(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
      const imageCids = await pinFiles(images, (d, t) => setProgress(`Uploaded ${d} of ${t} images…`));
      const imageUris = imageCids.map((c) => `ipfs://${c}`);

      const documents: { name: string; uri: string }[] = [];
      for (let i = 0; i < docs.length; i++) {
        setProgress(`Uploading document ${i + 1} of ${docs.length}…`);
        documents.push({ name: docs[i].name, uri: `ipfs://${await pinFile(docs[i])}` });
      }

      setStep(1);
      setProgress("Pinning asset metadata…");
      // Same top-level shape as NFT metadata (name/description/image) so the same viewers
      // render it, plus the RWA specifics under `properties`.
      const metadata = {
        name: name.trim(),
        description: summary.trim(),
        longDescription: details.trim(),
        image: imageUris[0],
        images: imageUris,
        documents,
        properties: {
          location: { address: addressLine.trim(), city: city.trim(), country: country.trim() },
          propertyType,
          size: { value: sizeValue.trim(), unit: sizeUnit },
          yearBuilt: yearBuilt.trim() || undefined,
          ownership: { owner: owner.trim(), structure: structure.trim() || undefined, titleRef: titleRef.trim() || undefined },
          valuation: valuation.trim() || undefined,
          yield: {
            annualPct: annualYield.trim() || undefined,
            rentalIncome: rental.trim() || undefined,
            payout: payout || undefined,
          },
          additional: additional.trim() || undefined,
        },
      };
      const metadataFile = new File([JSON.stringify(metadata)], "metadata.json", { type: "application/json" });
      const metadataUri = `ipfs://${await pinFile(metadataFile)}`;

      setStep(2);
      setProgress("");
      const duration = BigInt(Math.round(days * 86400));
      const ok = await tx.run(
        "List RWA asset",
        {
          address: ADDRESSES.rwaFactory,
          abi: rwaFactoryAbi,
          functionName: "createAsset",
          args: [name.trim(), symbol.trim() || "RWA", units, price, BigInt(startTs), duration, treasury as `0x${string}`, metadataUri],
        },
        { successMessage: startTs ? "The asset is listed. Its IPO opens at the scheduled time." : "The asset is live and its IPO is open." }
      );
      setStep(ok ? 3 : -1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep(-1);
    }
  }

  if (!isConnected) return <div className="max-w-lg mx-auto glass p-8 text-center text-zinc-400">Connect your wallet to continue.</div>;
  if (loadingAdmin)
    return (
      <p className="max-w-lg mx-auto text-zinc-400 flex items-center gap-2">
        <Spinner /> Checking admin access…
      </p>
    );

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg glass p-10 text-center page-enter">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-xl text-zinc-400">
          <Icon name="lock" />
        </div>
        <h1 className="font-display text-xl font-semibold text-white">Page not available</h1>
        <p className="mt-2 text-sm text-zinc-400">This page is only available to platform administrators.</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="max-w-lg mx-auto text-center glass p-10 page-enter shadow-glow-lg">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-accent-500/40 bg-accent-500/10 text-2xl text-accent-300">
          <Icon name="check" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-white">Asset listed</h1>
        <p className="text-zinc-400 text-sm mt-2">It now appears on the RWA page under its IPO status.</p>
        <Link href="/rwa" className="btn btn-primary mt-6">
          View RWA assets
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader eyebrow="Admin" title="List a real-world asset" subtitle="Everything buyers need to judge the asset lives on IPFS next to the token. Fields marked * are required." />
      <PinataKeyField />

      <form onSubmit={handleSubmit} className="glass p-6 space-y-8">
        <Section title="Photos">
          <div>
            <p className="label" id="rwa-images-label">
              Images * <span className="text-zinc-400 font-normal">(up to {MAX_IMAGES} · 5+ recommended · the first is the cover)</span>
            </p>
            <DropZone labelledBy="rwa-images-label" accept="image/*" multiple onFiles={addImages} label="Drop several images at once, or click to browse" hint="You can add more in several rounds.">
              <Icon name="building" className="mx-auto mb-2 text-3xl text-zinc-400" />
            </DropZone>
            {images.length > 0 && (
              <>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-3 stagger">
                  {previews.map((src, i) => (
                    <div key={src} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Selected image ${i + 1}${i === 0 ? " (cover)" : ""}`} className={`w-full h-full object-cover rounded-lg ${i === 0 ? "ring-2 ring-accent-400" : ""}`} />
                      {i === 0 && <span className="absolute bottom-1 left-1 badge badge-nft !text-[10px] !py-0.5 !px-1.5">Cover</span>}
                      <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        {i !== 0 && (
                          <button type="button" className="text-[11px] text-white underline" onClick={() => makeCover(i)}>
                            Make cover
                          </button>
                        )}
                        <button type="button" className="text-[11px] text-rose-300 underline" onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  {images.length} of {MAX_IMAGES} images{images.length < 5 ? " — add a few more for a better listing" : ""}.
                </p>
              </>
            )}
          </div>
        </Section>

        <Section title="The asset">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="app-rwa-create-page-1" className="label">Asset name *</label>
              <input id="app-rwa-create-page-1" className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Skyline Tower, Unit 12" />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-2" className="label">Unit symbol *</label>
              <input id="app-rwa-create-page-2" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} required maxLength={10} placeholder="SKY12" />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="app-rwa-create-page-3" className="label">Property type *</label>
              <select id="app-rwa-create-page-3" className="input" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} required>
                <option value="">Select…</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-4" className="label">Size *</label>
              <div className="flex gap-2">
                <input id="app-rwa-create-page-4" className="input" inputMode="decimal" value={sizeValue} onChange={(e) => setSizeValue(e.target.value)} required placeholder="120" />
                <select className="input !w-28" aria-label="Size unit" value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)}>
                  {SIZE_UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-5" className="label">Year built</label>
              <input id="app-rwa-create-page-5" className="input" inputMode="numeric" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} placeholder="2018" />
            </div>
          </div>
        </Section>

        <Section title="Location">
          <div>
            <label htmlFor="app-rwa-create-page-6" className="label">Address / location of the asset *</label>
            <input id="app-rwa-create-page-6" className="input" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} required placeholder="12 Marina Boulevard" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-rwa-create-page-7" className="label">City *</label>
              <input id="app-rwa-create-page-7" className="input" value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-8" className="label">Country *</label>
              <input id="app-rwa-create-page-8" className="input" value={country} onChange={(e) => setCountry(e.target.value)} required />
            </div>
          </div>
        </Section>

        <Section title="Description">
          <div>
            <label htmlFor="app-rwa-create-page-9" className="label">Short summary * <span className="text-zinc-400 font-normal">(shown on cards)</span></label>
            <input id="app-rwa-create-page-9" className="input" value={summary} onChange={(e) => setSummary(e.target.value)} required maxLength={200} placeholder="Two-bedroom sea-view apartment with a 6-year lease in place" />
          </div>
          <div>
            <label htmlFor="app-rwa-create-page-10" className="label">Detailed description * <span className="text-zinc-400 font-normal">(at least 100 characters)</span></label>
            <textarea id="app-rwa-create-page-10" className="input" rows={7} value={details} onChange={(e) => setDetails(e.target.value)} required placeholder="Condition, layout, amenities, tenants and leases, neighbourhood, why this asset, risks…" />
            <p className="hint">{details.trim().length} characters</p>
          </div>
          <div>
            <label htmlFor="app-rwa-create-page-11" className="label">Additional information</label>
            <textarea id="app-rwa-create-page-11" className="input" rows={3} value={additional} onChange={(e) => setAdditional(e.target.value)} placeholder="Insurance, maintenance costs, taxes, restrictions, planned renovations…" />
          </div>
        </Section>

        <Section title="Ownership & legal">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-rwa-create-page-12" className="label">Legal owner / holding entity *</label>
              <input id="app-rwa-create-page-12" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} required placeholder="Skyline Holdings SPV Ltd" />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-13" className="label">Ownership structure</label>
              <input id="app-rwa-create-page-13" className="input" value={structure} onChange={(e) => setStructure(e.target.value)} placeholder="SPV holds title; units = SPV shares" />
            </div>
          </div>
          <div>
            <label htmlFor="app-rwa-create-page-14" className="label">Title deed / registry reference *</label>
            <input id="app-rwa-create-page-14" className="input" value={titleRef} onChange={(e) => setTitleRef(e.target.value)} required placeholder="Land registry no. …" />
          </div>
          <div>
            <p className="label" id="rwa-docs-label">Legal documents * <span className="text-zinc-400 font-normal">(title deed, valuation, SPV papers, lease…)</span></p>
            <DropZone labelledBy="rwa-docs-label" multiple onFiles={(f) => setDocs((p) => [...p, ...f].slice(0, 20))} label="Drop documents here, or click to browse" hint="PDF, images or Word files — pinned to IPFS and linked from the asset page.">
              <Icon name="file" className="mx-auto mb-1 text-2xl text-zinc-400" />
            </DropZone>
            {docs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {docs.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="flex items-center justify-between text-sm bg-black/20 rounded-lg px-3 py-1.5">
                    <span className="truncate text-zinc-300">{d.name}</span>
                    <button type="button" className="text-xs text-rose-300 hover:underline ml-3" aria-label={`Remove document ${d.name}`} onClick={() => setDocs((p) => p.filter((_, idx) => idx !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Financials">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="app-rwa-create-page-15" className="label">Valuation</label>
              <input id="app-rwa-create-page-15" className="input" value={valuation} onChange={(e) => setValuation(e.target.value)} placeholder="USD 850,000 (appraised Jan 2026)" />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-16" className="label">Expected annual yield (%), issuer estimate</label>
              <input id="app-rwa-create-page-16" className="input" inputMode="decimal" value={annualYield} onChange={(e) => setAnnualYield(e.target.value)} placeholder="7.5" />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-17" className="label">Rental income</label>
              <input id="app-rwa-create-page-17" className="input" value={rental} onChange={(e) => setRental(e.target.value)} placeholder="USD 5,300 / month" />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-18" className="label">Payout frequency</label>
              <select id="app-rwa-create-page-18" className="input" value={payout} onChange={(e) => setPayout(e.target.value)}>
                <option value="">Not specified</option>
                {PAYOUTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="hint">Yield is shown as an estimate and is not guaranteed. Distributing rent to holders is done off-chain by the treasury for now.</p>
        </Section>

        <Section title="Offering">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="app-rwa-create-page-19" className="label">Total units *</label>
              <input id="app-rwa-create-page-19" className="input" inputMode="numeric" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-20" className="label">Price / unit (KII) *</label>
              <input id="app-rwa-create-page-20" className="input" inputMode="decimal" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="app-rwa-create-page-21" className="label">IPO days *</label>
              <input id="app-rwa-create-page-21" className="input" inputMode="decimal" value={ipoDays} onChange={(e) => setIpoDays(e.target.value)} required />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="label !mb-0">IPO start</p>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" className="h-4 w-4 accent-violet-500" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
                Open immediately
              </label>
            </div>
            {!startNow && (
              <div className="grid grid-cols-2 gap-4">
                <input type="date" className="input" aria-label="IPO start day" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="time" className="input" aria-label="IPO start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            )}
            <p className="hint">A future start shows the asset under “Upcoming IPO” on the RWA page. The IPO duration counts from the start.</p>
          </div>

          <div>
            <label htmlFor="app-rwa-create-page-22" className="label">Treasury address *</label>
            <input id="app-rwa-create-page-22" className="input" value={treasury} onChange={(e) => setTreasury(e.target.value)} required placeholder="0x…" />
            <p className="hint">Receives the raised KII once the IPO ends — the legal custodian of the asset (ideally a multisig).</p>
          </div>
        </Section>

        {step >= 0 && (
          <div>
            <Steps steps={STEP_LABELS} current={step} />
            {progress && <p className="text-xs text-zinc-400">{progress}</p>}
          </div>
        )}

        <TxButton type="submit" className="w-full !py-3.5 text-base" disabled={busy} busy={busy} busyLabel={step === 2 ? "Confirm in your wallet…" : "Uploading to IPFS…"}>
          List asset
        </TxButton>
        {error && <p className="text-rose-400 text-sm">{error}</p>}
      </form>
    </div>
  );
}
