"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ADDRESSES, MAX_COLLECTION_SIZE, MAX_ROYALTY_PCT } from "@/lib/config";
import { factoryAbi } from "@/lib/contracts";
import { useProtocolFee } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { usePreviewUrls } from "@/lib/usePreview";
import { collectionFromReceipt } from "@/lib/receipt";
import { buildMetadataJson, hasPinataJwt, pinImagesBatched } from "@/lib/pinata";
import { pinLaunch } from "@/lib/launch";
import {
  CSV_TEMPLATE,
  isDataFile,
  mapRowsToImages,
  naturalCompare,
  parseAttributeFile,
  type RowInfo,
} from "@/lib/attributes";
import PinataKeyField from "@/components/PinataKeyField";
import FeeStatus from "@/components/FeeStatus";
import LaunchInfoFields, { buildLaunchInfo, defaultLaunchInfo, type LaunchInfoState } from "@/components/LaunchInfoFields";
import LaunchConsent from "@/components/LaunchConsent";
import DropZone from "@/components/DropZone";
import BannerPicker from "@/components/BannerPicker";
import MintLinkCard from "@/components/MintLinkCard";
import Icon from "@/components/Icon";
import Steps from "@/components/Steps";
import { PageHeader, TxButton } from "@/components/ui";

export default function CreateCollectionPage() {
  const { isConnected } = useAccount();
  const tx = useTx();
  const { data: fee } = useProtocolFee();

  const [images, setImages] = useState<File[]>([]);
  const [dataFiles, setDataFiles] = useState<{ name: string; rows: RowInfo[]; format: string }[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [royaltyPct, setRoyaltyPct] = useState("5");
  const [info, setInfo] = useState<LaunchInfoState>(defaultLaunchInfo);
  const [banner, setBanner] = useState<File | null>(null);
  const [placeholder, setPlaceholder] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [publicData, setPublicData] = useState(false);
  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<`0x${string}` | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // non-standard but widely supported; set via the DOM so TypeScript doesn't need to know it
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, [isConnected]);

  const total = images.length;
  const stepLabels = ["Upload files", "Pin metadata", "Confirm in wallet", "Ready to share"];
  const doneStep = 3;
  const working = step >= 0 && step < doneStep;
  const busy = working || tx.busy;

  // Attribute rows from every imported file, mapped onto the images (in token order).
  const rows = useMemo(() => dataFiles.flatMap((d) => d.rows), [dataFiles]);
  const mapping = useMemo(() => mapRowsToImages(images.map((f) => f.name), rows), [images, rows]);
  const previewFiles = useMemo(() => images.slice(0, 48), [images]);
  const previews = usePreviewUrls(previewFiles);

  async function addFiles(files: File[]) {
    setError("");
    const warnings: string[] = [];
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const data = files.filter(isDataFile);
    const skipped = files.length - imgs.length - data.length;
    if (skipped > 0) warnings.push(`${skipped} file(s) were skipped (only images, .csv, .json and .xml are accepted).`);

    if (imgs.length > 0) {
      setImages((prev) => {
        const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
        const merged = [...prev, ...imgs.filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`))];
        merged.sort((a, b) => naturalCompare(a.name, b.name));
        return merged.length > MAX_COLLECTION_SIZE ? merged.slice(0, MAX_COLLECTION_SIZE) : merged;
      });
    }
    for (const f of data) {
      try {
        const parsed = await parseAttributeFile(f);
        warnings.push(...parsed.warnings.map((w) => `${f.name}: ${w}`));
        if (parsed.rows.length > 0) {
          setDataFiles((prev) => [...prev.filter((p) => p.name !== f.name), { name: f.name, rows: parsed.rows, format: parsed.format }]);
        }
      } catch {
        warnings.push(`${f.name}: couldn't be read.`);
      }
    }
    setImportWarnings(warnings);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (total === 0 || fee === undefined) return;
    if (!rights || !publicData) return setError("Please tick both confirmations before continuing.");
    if (!hasPinataJwt()) return setError("Add your Pinata JWT in the IPFS box above first.");
    const pct = parseFloat(royaltyPct || "0");
    if (!(pct >= 0 && pct <= MAX_ROYALTY_PCT)) return setError(`Royalty must be between 0 and ${MAX_ROYALTY_PCT}%.`);
    const launch = buildLaunchInfo(info);
    if (launch.error) return setError(launch.error);
    const sym = (symbol.trim() || name.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "COLL").toUpperCase();

    try {
      setStep(0);
      setProgress(`Uploading images: 0 of ${total.toLocaleString()}`);
      const imageUris = await pinImagesBatched(images, (done, all) => setProgress(`Uploaded ${done.toLocaleString()} of ${all.toLocaleString()} images`));

      setStep(1);
      // One metadata file per token, named by token id, pinned together as ONE folder so
      // tokenURI(id) = baseURI + id. Nothing is minted here: followers mint the tokens
      // (in order) from the minting link.
      const tokenFiles = imageUris.map((uri, i) => {
        const row = mapping.perImage[i];
        const tokenName = row?.name || `${name.trim()} #${i + 1}`;
        const json = buildMetadataJson(tokenName, row?.description || description.trim(), uri, row?.attributes ?? [], {
          ...(launch.links.website ? { external_url: launch.links.website } : {}),
        });
        return { filename: String(i), content: new Blob([json], { type: "application/json" }) };
      });
      const params = await pinLaunch({
        name: name.trim(),
        symbol: sym,
        description: description.trim(),
        firstImageUri: imageUris[0],
        tokenFiles,
        maxSupply: total,
        royaltyBps: Math.round(pct * 100),
        banner,
        placeholder,
        launch,
        onProgress: setProgress,
      });

      setStep(2);
      setProgress("");
      const holder: { addr: `0x${string}` | null } = { addr: null };
      const ok = await tx.run(
        "Create collection",
        { address: ADDRESSES.factory, abi: factoryAbi, functionName: "createCollection", args: [params], value: fee },
        { successMessage: "Your minting link is ready.", onReceipt: (r) => (holder.addr = collectionFromReceipt(r)) }
      );
      setCreated(holder.addr);
      setStep(ok ? doneStep : -1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep(-1);
    }
  }

  if (step === doneStep) {
    return (
      <div className="mx-auto max-w-xl page-enter">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-accent-500/40 bg-accent-500/10 text-2xl text-accent-300">
            <Icon name="check" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Your collection is uploaded</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {total.toLocaleString()} NFTs are ready to mint. Share the minting link; once the mint ends the collection becomes tradeable.
          </p>
        </div>
        {created ? (
          <MintLinkCard collection={created} />
        ) : (
          <p className="text-center text-sm text-amber-300">The collection was created, but I couldn&apos;t read its address. Find your minting link under Profile, then Created.</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/profile" className="btn btn-secondary">
            My profile
          </Link>
          <Link href="/explore" className="btn btn-ghost">
            Explore
          </Link>
        </div>
      </div>
    );
  }

  const featured = mapping.perImage.map((r, i) => ({ r, i })).filter((x) => x.r).slice(0, 4);

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Create"
        title="Create a collection"
        subtitle="Upload your images (10,000+ is fine), an optional attributes file and a banner. You get a minting link to share; followers mint from it, and trading opens once the mint ends."
      />

      {!isConnected ? (
        <div className="glass p-8 text-center text-zinc-400">Connect your wallet (top right) to continue.</div>
      ) : (
        <>
          <PinataKeyField />

          <form onSubmit={handleSubmit} className="glass space-y-8 p-6 sm:p-8">
            <div>
              <p className="label" id="cc-files-label">
                Images &amp; attributes file <span className="text-zinc-400 font-normal">(up to {MAX_COLLECTION_SIZE.toLocaleString()} images)</span>
              </p>
              <DropZone
                labelledBy="cc-files-label"
                accept="image/*,.csv,.json,.xml"
                multiple
                onFiles={(f) => void addFiles(f)}
                label="Drop images and a .csv / .json / .xml here, or click to browse"
                hint="Tokens are numbered in file-name order (1, 2, … 10)."
              >
                <Icon name="folder" className="mx-auto mb-2 text-3xl text-zinc-400" />
              </DropZone>
              <div className="flex flex-wrap gap-2 mt-3 items-center">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => folderInput.current?.click()}>
                  Select a whole folder
                </button>
                <input
                  ref={folderInput}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) void addFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
                <a
                  className="text-xs text-accent-400 hover:text-accent-300 underline underline-offset-2"
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
                  download="attributes-template.csv"
                >
                  Download CSV template
                </a>
                {(total > 0 || dataFiles.length > 0) && (
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-rose-300 ml-auto"
                    onClick={() => {
                      setImages([]);
                      setDataFiles([]);
                      setImportWarnings([]);
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <p className="hint">
                Attributes file: <b>Column 1 = the image file name</b> (or its number), every other column = a trait. Header names become trait names; columns called{" "}
                <code>name</code> / <code>description</code> set the token&apos;s name and text.
              </p>

              {total > 0 && (
                <>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mt-3">
                    {previews.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt={`Preview of ${images[i]?.name ?? "selected image"}`} className="w-full aspect-square object-cover rounded-lg" title={images[i]?.name} />
                    ))}
                  </div>
                  <p className="hint">
                    {total.toLocaleString()} image{total === 1 ? "" : "s"} → {total.toLocaleString()} NFTs
                    {total > previews.length ? ` (previewing the first ${previews.length})` : ""}.
                  </p>
                </>
              )}

              {dataFiles.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="text-white font-semibold">
                    {dataFiles.map((d) => d.name).join(", ")} · {rows.length.toLocaleString()} rows read
                  </p>
                  {total > 0 && (
                    <p className={`mt-1 ${mapping.matched === total ? "text-emerald-400" : "text-amber-300"}`}>
                      {mapping.matched.toLocaleString()} of {total.toLocaleString()} images matched an attribute row
                      {mapping.byOrder ? " (column 1 didn't match file names, so rows were mapped by order)" : ""}.
                    </p>
                  )}
                  {mapping.unmatchedRows.length > 0 && (
                    <p className="text-xs text-amber-300 mt-1">
                      {mapping.unmatchedRows.length} row(s) matched no image, e.g. “{mapping.unmatchedRows.slice(0, 3).join("”, “")}”.
                    </p>
                  )}
                  {featured.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                      {featured.map(({ r, i }) => (
                        <li key={i}>
                          <span className="text-zinc-200">{images[i].name}</span> →{" "}
                          {r!.attributes.length > 0 ? r!.attributes.map((a) => `${a.trait_type}: ${a.value}`).join(" · ") : "no attributes"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {importWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300 mt-2">
                  {w}
                </p>
              ))}
            </div>

            <BannerPicker file={banner} onChange={setBanner} />

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="app-create-collection-page-1" className="label">Collection name</label>
                <input id="app-create-collection-page-1" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Eden Apes" />
                <p className="hint">Tokens become “Name #1”, “Name #2”, … unless your file sets a name.</p>
              </div>
              <div>
                <label htmlFor="app-create-collection-page-2" className="label">Symbol</label>
                <input id="app-create-collection-page-2" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={10} placeholder="auto" />
              </div>
            </div>

            <div>
              <label htmlFor="app-create-collection-page-3" className="label">Description (shared by all tokens)</label>
              <textarea id="app-create-collection-page-3" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="hairline" />
            <LaunchInfoFields value={info} onChange={setInfo} placeholderFile={placeholder} onPlaceholder={setPlaceholder} />

            <LaunchConsent rights={rights} onRights={setRights} publicData={publicData} onPublicData={setPublicData} />

            <div>
              <label htmlFor="app-create-collection-page-4" className="label">Creator royalty (%)</label>
              <input id="app-create-collection-page-4" type="number" min={0} max={MAX_ROYALTY_PCT} step={0.5} className="input" value={royaltyPct} onChange={(e) => setRoyaltyPct(e.target.value)} />
              <p className="hint">Paid to you on resales made through KiiEden (other marketplaces may not honour royalties). Maximum {MAX_ROYALTY_PCT}%.</p>
            </div>

            {step >= 0 && (
              <div>
                <Steps steps={stepLabels} current={step} />
                {progress && <p className="text-xs text-zinc-400">{progress}</p>}
              </div>
            )}

            <TxButton
              type="submit"
              className="w-full !py-3.5 text-base"
              disabled={total === 0 || !name.trim() || fee === undefined || !rights || !publicData || busy}
              busy={busy}
              busyLabel={step === 0 ? "Uploading to IPFS…" : step === 1 ? "Pinning metadata…" : "Confirm in your wallet…"}
            >
              Create and get minting link
            </TxButton>

            {error && <p className="text-rose-400 text-sm">{error}</p>}
            <FeeStatus />
          </form>
        </>
      )}
    </div>
  );
}
