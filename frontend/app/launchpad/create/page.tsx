"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ADDRESSES, LAUNCHPAD_DEFAULT_MAX_WALLET_BPS, LAUNCHPAD_MAX_WALLET_DISABLED_BPS, LAUNCHPAD_MIN_MAX_WALLET_BPS, LAUNCHPAD_TOTAL_SUPPLY } from "@/lib/config";
import { launchpadAbi } from "@/lib/contracts";
import { useLaunchpadParams } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { hasPinataJwt, pinFile } from "@/lib/pinata";
import { cleanLine, cleanSymbol, cleanText, safeHref } from "@/lib/sanitize";
import { usePreviewUrl } from "@/lib/usePreview";
import { fmtKii } from "@/lib/format";
import PinataKeyField from "@/components/PinataKeyField";
import DropZone from "@/components/DropZone";
import Steps from "@/components/Steps";
import { PageHeader, TxButton } from "@/components/ui";

const STEP_LABELS = ["Details", "Pin metadata", "Confirm in wallet", "Launched"];

export default function CreateMemecoinPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const tx = useTx();
  const { data: params } = useLaunchpadParams();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [maxWalletPct, setMaxWalletPct] = useState((LAUNCHPAD_DEFAULT_MAX_WALLET_BPS / 100).toString());
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const preview = usePreviewUrl(image);
  const maxWalletBps = Math.round(Number(maxWalletPct) * 100);
  const validWallet = Number.isFinite(maxWalletBps) && maxWalletBps >= LAUNCHPAD_MIN_MAX_WALLET_BPS && maxWalletBps <= LAUNCHPAD_MAX_WALLET_DISABLED_BPS;
  // Sanitized the same way everything else written to IPFS/on-chain is (lib/sanitize.ts):
  // strips control/invisible/bidi-override characters before anything is validated, pinned,
  // or sent to createToken — validating the RAW input here would let a name that looks like
  // "32 chars" hide extra invisible characters that only get stripped later.
  const cleanName = cleanLine(name, 32);
  const cleanSym = cleanSymbol(symbol, 12);
  const cleanDesc = cleanText(description, 500);
  const validName = cleanName.length > 0;
  const validSymbol = cleanSym.length > 0;
  const canSubmit = isConnected && validName && validSymbol && validWallet && !!image && !busy && !!params;

  async function launch() {
    if (!canSubmit || !image) return;
    setError(null);
    setBusy(true);
    setStep(0);
    try {
      if (!hasPinataJwt()) throw new Error("Add a Pinata API key below first — it's needed to store the token's image and description.");
      setStep(1);
      const imageCid = await pinFile(image);
      const metadata = {
        name: cleanName,
        description: cleanDesc,
        image: `ipfs://${imageCid}`,
        twitter: safeHref(twitter),
        telegram: safeHref(telegram),
        website: safeHref(website),
      };
      const metadataFile = new File([JSON.stringify(metadata)], "metadata.json", { type: "application/json" });
      const metadataCid = await pinFile(metadataFile);

      setStep(2);
      const ok = await tx.run(
        "Launch token",
        {
          address: ADDRESSES.launchpad,
          abi: launchpadAbi,
          functionName: "createToken",
          args: [cleanName, cleanSym, `ipfs://${metadataCid}`, maxWalletBps],
          value: params!.creationFeeWei,
        },
        { successMessage: `${cleanName} is live on the launchpad.` }
      );
      if (!ok) {
        setBusy(false);
        return;
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Launchpad" title="Launch a memecoin" subtitle="No code required. Set a name, symbol and image — the entire supply opens on a fair-launch bonding curve the moment you confirm." />

      {busy && (
        <div className="glass mb-8 p-6">
          <Steps steps={STEP_LABELS} current={step} />
        </div>
      )}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Token name
            </label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Doge Kii" maxLength={32} disabled={busy} />
          </div>
          <div>
            <label className="label" htmlFor="symbol">
              Symbol
            </label>
            <input id="symbol" className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="DOGEKII" maxLength={12} disabled={busy} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="desc">
            Description
          </label>
          <textarea id="desc" className="input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the token about?" maxLength={500} disabled={busy} />
        </div>

        <div>
          <p className="label">Token image</p>
          {preview ? (
            <div className="flex items-center gap-4">
              <img src={preview} alt="Token preview" className="h-20 w-20 rounded-xl object-cover" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImage(null)} disabled={busy}>
                Change
              </button>
            </div>
          ) : (
            <DropZone accept="image/*" onFiles={(files) => setImage(files[0] ?? null)} label="Drop an image, or click to browse" hint="PNG, JPG or GIF" />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="tw">
              X / Twitter
            </label>
            <input id="tw" className="input" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/…" disabled={busy} />
          </div>
          <div>
            <label className="label" htmlFor="tg">
              Telegram
            </label>
            <input id="tg" className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" disabled={busy} />
          </div>
          <div>
            <label className="label" htmlFor="web">
              Website
            </label>
            <input id="web" className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" disabled={busy} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="mw">
            Max wallet — largest amount one wallet can hold while this token is Active ({maxWalletPct || 0}% of supply ≈{" "}
            {maxWalletBps && Number.isFinite(maxWalletBps) ? Math.round((LAUNCHPAD_TOTAL_SUPPLY * maxWalletBps) / 10000).toLocaleString() : "—"} tokens)
          </label>
          <input
            id="mw"
            className="input"
            inputMode="decimal"
            value={maxWalletPct}
            onChange={(e) => setMaxWalletPct(e.target.value)}
            placeholder="2"
            disabled={busy}
          />
          <p className="hint">
            Between 0.5% and 100% (100% disables the cap). Doesn&apos;t block sniping bots from buying — it only caps how much of the supply any single wallet
            can end up holding. You can tighten or loosen this later. The cap lifts automatically once the token graduates.
          </p>
        </div>

        <PinataKeyField />

        <div className="glass p-5">
          <p className="text-sm text-zinc-300">
            Creation fee: <span className="font-semibold text-white">{params ? fmtKii(params.creationFeeWei) : "…"} KII</span>. Goes to the KiiEden treasury —
            you also keep a {params ? params.creatorFeeBpsDefault / 100 : "…"}% cut of every trade on your token, claimable anytime from your profile.
          </p>
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <TxButton className="w-full !py-3.5 text-base" onClick={() => void launch()} disabled={!canSubmit} busy={busy} busyLabel="Launching…">
          {!isConnected ? "Connect wallet to launch" : `Launch for ${params ? fmtKii(params.creationFeeWei) : "…"} KII`}
        </TxButton>

        {step === 3 && !busy && (
          <div className="glass p-5 text-center">
            <p className="text-sm text-accent-300">Token launched! Find it on the launchpad explore page.</p>
            <button className="btn btn-secondary mt-3" onClick={() => router.push("/launchpad")}>
              Go to launchpad
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
