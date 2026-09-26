"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ADDRESSES, MAX_EDITIONS, MAX_ROYALTY_PCT } from "@/lib/config";
import { factoryAbi } from "@/lib/contracts";
import { useProtocolFee } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { usePreviewUrl } from "@/lib/usePreview";
import { collectionFromReceipt } from "@/lib/receipt";
import { buildMetadataJson, hasPinataJwt, pinFile, type Attribute } from "@/lib/pinata";
import { pinLaunch } from "@/lib/launch";
import PinataKeyField from "@/components/PinataKeyField";
import FeeStatus from "@/components/FeeStatus";
import BannerPicker from "@/components/BannerPicker";
import MintLinkCard from "@/components/MintLinkCard";
import LaunchInfoFields, { buildLaunchInfo, defaultLaunchInfo, type LaunchInfoState } from "@/components/LaunchInfoFields";
import LaunchConsent from "@/components/LaunchConsent";
import DropZone from "@/components/DropZone";
import Steps from "@/components/Steps";
import Icon from "@/components/Icon";
import { PageHeader, TxButton } from "@/components/ui";

const STEP_LABELS = ["Upload files", "Pin metadata", "Confirm in wallet", "Ready to share"];

export default function CreateSinglePage() {
  const { isConnected } = useAccount();
  const tx = useTx();
  const { data: fee } = useProtocolFee();

  const [image, setImage] = useState<File | null>(null);
  const preview = usePreviewUrl(image);
  const [banner, setBanner] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [noAttributes, setNoAttributes] = useState(false);
  const [attributes, setAttributes] = useState<Attribute[]>([{ trait_type: "", value: "" }]);
  const [editions, setEditions] = useState("1");
  const [royaltyPct, setRoyaltyPct] = useState("5");
  const [info, setInfo] = useState<LaunchInfoState>(defaultLaunchInfo);
  const [placeholder, setPlaceholder] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [publicData, setPublicData] = useState(false);
  const [step, setStep] = useState(-1); // -1 = idle
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<`0x${string}` | null>(null);

  const working = step >= 0 && step < 3;
  const busy = working || tx.busy;

  function pickImage(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, GIF, WebP).");
      return;
    }
    setError("");
    setImage(f);
  }

  function updateAttr(i: number, key: keyof Attribute, value: string) {
    setAttributes((prev) => prev.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!image || fee === undefined) return;
    if (!rights || !publicData) return setError("Please tick both confirmations before continuing.");
    if (!hasPinataJwt()) return setError("Add your Pinata JWT in the IPFS box above first.");
    const pct = parseFloat(royaltyPct || "0");
    if (!(pct >= 0 && pct <= MAX_ROYALTY_PCT)) return setError(`Royalty must be between 0 and ${MAX_ROYALTY_PCT}%.`);
    const supply = Number(editions);
    if (!Number.isInteger(supply) || supply < 1 || supply > MAX_EDITIONS) return setError(`Editions must be a whole number from 1 to ${MAX_EDITIONS}.`);
    const launch = buildLaunchInfo(info);
    if (launch.error) return setError(launch.error);
    const sym = (symbol.trim() || name.trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "NFT").toUpperCase();

    try {
      setStep(0);
      setProgress("Uploading image");
      const imageUri = `ipfs://${await pinFile(image)}`;

      setStep(1);
      const cleanAttrs = noAttributes ? [] : attributes.filter((a) => a.trait_type.trim() && a.value.trim());
      // One metadata file per edition, named by token id: tokenURI(id) = baseURI + id.
      const tokenFiles = Array.from({ length: supply }, (_, i) => ({
        filename: String(i),
        content: new Blob(
          [
            buildMetadataJson(supply > 1 ? `${name.trim()} #${i + 1}` : name.trim(), description.trim(), imageUri, cleanAttrs, {
              ...(launch.links.website ? { external_url: launch.links.website } : {}),
            }),
          ],
          { type: "application/json" }
        ),
      }));
      const params = await pinLaunch({
        name: name.trim(),
        symbol: sym,
        description: description.trim(),
        firstImageUri: imageUri,
        tokenFiles,
        maxSupply: supply,
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
        "Create NFT",
        { address: ADDRESSES.factory, abi: factoryAbi, functionName: "createCollection", args: [params], value: fee },
        { successMessage: "Your minting link is ready.", onReceipt: (r) => (holder.addr = collectionFromReceipt(r)) }
      );
      setCreated(holder.addr);
      setStep(ok ? 3 : -1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep(-1);
    }
  }

  if (step === 3) {
    return (
      <div className="mx-auto max-w-xl page-enter">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-accent-500/40 bg-accent-500/10 text-2xl text-accent-300">
            <Icon name="check" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Your NFT is uploaded</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Share the minting link with your followers. Once the mint ends, the NFT becomes tradeable.
          </p>
        </div>
        {created ? (
          <MintLinkCard collection={created} />
        ) : (
          <p className="text-center text-sm text-amber-300">The NFT was created, but I couldn&apos;t read its address. Find your minting link under Profile, then Created.</p>
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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="Create a single NFT"
        subtitle="Upload your artwork and set the mint. You get a minting link to share; followers mint from it, and trading opens once the mint ends."
      />

      {!isConnected ? (
        <div className="glass p-10 text-center text-zinc-400">Connect your wallet (top right) to continue.</div>
      ) : (
        <>
          <PinataKeyField />

          <form onSubmit={handleSubmit} className="glass space-y-10 p-6 sm:p-8">
            <div className="space-y-6">
              <div>
                <p className="label" id="cs-art-label">Artwork</p>
                <DropZone labelledBy="cs-art-label" accept="image/*" onFiles={pickImage} label={image ? "Click or drop to replace" : "Drop your image here, or click to browse"} hint="PNG, JPG, GIF or WebP">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Preview of the artwork you selected" className="mx-auto mb-3 max-h-72 rounded-xl" />
                  ) : (
                    <Icon name="image" className="mx-auto mb-2 text-3xl text-zinc-400" />
                  )}
                </DropZone>
              </div>

              <BannerPicker file={banner} onChange={setBanner} />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="app-create-single-page-1" className="label">Name</label>
                  <input id="app-create-single-page-1" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Eden Genesis" />
                </div>
                <div>
                  <label htmlFor="app-create-single-page-2" className="label">Symbol</label>
                  <input id="app-create-single-page-2" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={10} placeholder="Auto" />
                </div>
              </div>

              <div>
                <label htmlFor="app-create-single-page-3" className="label">Description</label>
                <textarea id="app-create-single-page-3" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell collectors what makes this special" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="app-create-single-page-4" className="label">Editions available to mint</label>
                  <input id="app-create-single-page-4" className="input" inputMode="numeric" value={editions} onChange={(e) => setEditions(e.target.value)} />
                  <p className="hint">1 = a true one-of-one. More = an open edition of the same artwork (up to {MAX_EDITIONS}).</p>
                </div>
                <div>
                  <label htmlFor="app-create-single-page-5" className="label">Creator royalty (%)</label>
                  <input id="app-create-single-page-5" type="number" min={0} max={MAX_ROYALTY_PCT} step={0.5} className="input" value={royaltyPct} onChange={(e) => setRoyaltyPct(e.target.value)} />
                  <p className="hint">Paid to you on resales made through KiiEden; other marketplaces may not honour it (max {MAX_ROYALTY_PCT}%).</p>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="label !mb-0" id="cs-attrs-label">Attributes (optional)</p>
                  <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" className="h-4 w-4 accent-violet-500" checked={noAttributes} onChange={(e) => setNoAttributes(e.target.checked)} />
                    No attributes
                  </label>
                </div>
                {!noAttributes && (
                  <>
                    {attributes.map((a, i) => (
                      <div key={i} className="mb-2 flex gap-2">
                        <input className="input" aria-label={`Attribute ${i + 1} trait name`} placeholder="Trait (e.g. Color)" value={a.trait_type} onChange={(e) => updateAttr(i, "trait_type", e.target.value)} />
                        <input className="input" aria-label={`Attribute ${i + 1} value`} placeholder="Value (e.g. Purple)" value={a.value} onChange={(e) => updateAttr(i, "value", e.target.value)} />
                      </div>
                    ))}
                    <button type="button" className="text-sm text-accent-400 hover:text-accent-300" onClick={() => setAttributes((p) => [...p, { trait_type: "", value: "" }])}>
                      Add attribute
                    </button>
                    <p className="hint">Leave the rows empty, or tick “No attributes”, to launch without any.</p>
                  </>
                )}
              </div>
            </div>

            <div className="hairline" />
            <LaunchInfoFields value={info} onChange={setInfo} placeholderFile={placeholder} onPlaceholder={setPlaceholder} />

            <LaunchConsent rights={rights} onRights={setRights} publicData={publicData} onPublicData={setPublicData} />

            {step >= 0 && (
              <div>
                <Steps steps={STEP_LABELS} current={step} />
                {progress && <p className="text-xs text-zinc-400">{progress}</p>}
              </div>
            )}

            <TxButton
              type="submit"
              className="w-full !py-3.5 text-base"
              disabled={!image || !name.trim() || fee === undefined || !rights || !publicData || busy}
              busy={busy}
              busyLabel={step === 2 ? "Confirm in your wallet…" : "Uploading to IPFS…"}
            >
              Create and get minting link
            </TxButton>

            {error && <p className="text-sm text-rose-400">{error}</p>}
            <FeeStatus />
          </form>
        </>
      )}
    </div>
  );
}
