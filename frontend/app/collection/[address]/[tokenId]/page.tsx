"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { collectionAbi, marketplaceAbi } from "@/lib/contracts";
import { useTokenOffers } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, parseAmount, sameAddr, shortAddr, timeLeft } from "@/lib/format";
import { explorerAddress } from "@/lib/chains";
import { useNftMetadata } from "@/components/NftCard";
import IpfsImage from "@/components/IpfsImage";
import { ErrorNote, TxButton } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import CopyButton from "@/components/CopyButton";

export default function TokenPage() {
  const params = useParams<{ address: string; tokenId: string }>();
  const addr = params?.address ?? "";
  const tid = params?.tokenId ?? "";
  if (!isAddress(addr) || !/^\d+$/.test(tid)) return <ErrorNote>That NFT link isn&apos;t valid.</ErrorNote>;
  return <TokenView nft={addr as `0x${string}`} tokenId={BigInt(tid)} />;
}

const DURATIONS: [string, number][] = [
  ["1 day", 86400],
  ["3 days", 3 * 86400],
  ["7 days", 7 * 86400],
  ["30 days", 30 * 86400],
];

function TokenView({ nft, tokenId }: { nft: `0x${string}`; tokenId: bigint }) {
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const confirm = useConfirm();
  const meta = useNftMetadata(nft, tokenId);
  const [priceInput, setPriceInput] = useState("");
  const [offerInput, setOfferInput] = useState("");
  const [duration, setDuration] = useState(7 * 86400);

  const read = { address: nft, abi: collectionAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: collectionName } = useReadContract({ ...read, functionName: "name" });
  const { data: tradingOpen } = useReadContract({ ...read, functionName: "tradingOpen" });
  const { data: isRevealed } = useReadContract({ ...read, functionName: "revealed" });
  const { data: revealAt } = useReadContract({ ...read, functionName: "revealTime" });
  const { data: currentOwner, isError: tokenMissing } = useReadContract({ ...read, functionName: "ownerOf", args: [tokenId] });
  const { data: royalty } = useReadContract({ ...read, functionName: "royaltyInfo", args: [tokenId, 10000n] });

  const mp = { address: ADDRESSES.marketplace, abi: marketplaceAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: listingId } = useReadContract({ ...mp, functionName: "activeListingId", args: [nft, tokenId] });
  const hasListingId = listingId !== undefined && listingId > 0n;
  const { data: listing } = useReadContract({
    ...mp,
    functionName: "listings",
    args: hasListingId ? [listingId!] : undefined,
    query: { enabled: hasListingId },
  });
  const { data: tradeFeeBps } = useReadContract({ ...mp, functionName: "protocolFeeBps" });
  const { data: offers } = useTokenOffers(nft, tokenId);

  const isOwner = sameAddr(account, currentOwner as string | undefined);
  const listingActive = !!listing && listing[4];
  const stale = listingActive && !sameAddr(listing![0], currentOwner as string | undefined);
  const isListed = listingActive && !stale;
  const price = isListed ? listing![3] : undefined;

  const best = offers && offers.length > 0 ? offers[0] : undefined;
  const myOffers = (offers ?? []).filter((o) => sameAddr(o.bidder, account));

  const royaltyBps = royalty ? Number(royalty[1]) : 0;
  const feeBps = tradeFeeBps !== undefined ? Number(tradeFeeBps) : 250;
  const netOf = (amount: bigint) => (amount * BigInt(Math.max(10000 - feeBps - royaltyBps, 0))) / 10000n;

  const newPrice = parseAmount(priceInput);
  const priceInvalid = priceInput.trim() !== "" && (newPrice === null || newPrice === 0n);
  const offerAmount = parseAmount(offerInput);
  const offerInvalid = offerInput.trim() !== "" && (offerAmount === null || offerAmount === 0n);

  const title = meta?.name || `Token #${tokenId.toString()}`;

  async function listNft() {
    if (!newPrice) return;
    const ok = await tx.run("List for sale", { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "list", args: [nft, tokenId, newPrice] });
    if (ok) setPriceInput("");
  }
  async function updatePrice() {
    if (!newPrice || !hasListingId) return;
    const ok = await tx.run("Update price", { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "updatePrice", args: [listingId!, newPrice] });
    if (ok) setPriceInput("");
  }
  function cancelListing() {
    if (!hasListingId) return;
    void tx.run("Cancel listing", { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "cancel", args: [listingId!] });
  }
  function buy() {
    if (!hasListingId || price === undefined) return;
    void tx.run(
      "Buy NFT",
      { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "buy", args: [listingId!], value: price },
      { successMessage: "It's yours. The NFT is now in your wallet." }
    );
  }
  async function sellNow() {
    if (!best) return;
    const sure = await confirm({
      title: "Sell now?",
      body: `This sells the NFT immediately to the highest bidder for ${fmtKii(best.amount, 6)} KII. This cannot be undone.`,
      confirmLabel: "Sell now",
      tone: "danger",
    });
    if (!sure) return;
    void tx.run(
      "Sell now",
      { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "sellNow", args: [best.offerId, best.amount] },
      { successMessage: `Sold. ${fmtKii(netOf(best.amount), 6)} KII was paid to your wallet.` }
    );
  }
  async function makeOffer() {
    if (!offerAmount) return;
    const ok = await tx.run(
      "Place offer",
      { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "makeOffer", args: [nft, tokenId, BigInt(duration)], value: offerAmount },
      { successMessage: "Your offer is live. The amount is held in escrow until it is accepted or you cancel." }
    );
    if (ok) setOfferInput("");
  }
  function cancelOffer(offerId: bigint) {
    void tx.run("Cancel offer", { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "cancelOffer", args: [offerId] }, { successMessage: "Your escrow was refunded." });
  }

  if (tokenMissing) return <ErrorNote>This token doesn&apos;t exist (yet). It may be on a different network, or it hasn&apos;t been minted.</ErrorNote>;

  const notTradable = tradingOpen === false;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2 lg:gap-14">
      {/* image */}
      <div className="glass h-fit p-3">
        <IpfsImage src={meta?.image} alt={`${title}, NFT artwork`} className="aspect-square rounded-2xl" />
      </div>

      {/* details */}
      <div>
        <Link href={`/collection/${nft}`} className="eyebrow hover:text-accent-300">
          {(collectionName as string) || "Collection"}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Owned by{" "}
          {currentOwner ? (
            <a href={explorerAddress(currentOwner as string)} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline">
              {isOwner ? "you" : shortAddr(currentOwner as string)}
            </a>
          ) : (
            "…"
          )}{" "}
          · Token #{tokenId.toString()}
        </p>
        {isRevealed === false && revealAt !== undefined && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" role="status">
            Unrevealed. The real artwork appears on {new Date(Number(revealAt) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
          </p>
        )}
        {meta?.description && <p className="mt-6 leading-relaxed text-zinc-300">{meta.description}</p>}

        {meta?.attributes && meta.attributes.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {meta.attributes.map((a, i) => (
              <div key={i} className="glass px-3 py-3 text-center" style={{ borderRadius: "0.9rem" }}>
                <p className="eyebrow !text-accent-400">{a.trait_type}</p>
                <p className="mt-1 truncate text-sm font-medium text-white">{String(a.value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* trading panel */}
        <div className="glass mt-8 space-y-6 p-6 sm:p-7">
          {notTradable ? (
            <div>
              <p className="font-display font-semibold text-white">Minting comes first</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                This NFT can be bought, sold and receive offers once the collection&apos;s mint has ended.
              </p>
              <Link href={`/mint/${nft}`} className="btn btn-secondary mt-4">
                View the mint
              </Link>
            </div>
          ) : (
            <>
              {/* current price / listing */}
              {isListed && price !== undefined ? (
                <div>
                  <p className="eyebrow">Price</p>
                  <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-white">{fmtKii(price, 6)} KII</p>
                </div>
              ) : (
                <div>
                  <p className="eyebrow">Status</p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {stale ? "The previous listing is out of date because the owner changed." : "Not listed for sale."}
                  </p>
                </div>
              )}

              {/* OWNER */}
              {isOwner && (
                <div className="space-y-5">
                  {best && (
                    <div className="rounded-2xl border border-accent-500/30 bg-accent-500/[0.07] p-5">
                      <p className="eyebrow !text-accent-300">Highest offer</p>
                      <p className="mt-1 font-display text-2xl font-semibold text-white">{fmtKii(best.amount, 6)} KII</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        You receive about {fmtKii(netOf(best.amount), 6)} KII after the {feeBps / 100}% marketplace fee
                        {royaltyBps > 0 ? ` and ${royaltyBps / 100}% creator royalty` : ""}. Paid from escrow in the same transaction.
                      </p>
                      <TxButton className="mt-4 w-full" onClick={sellNow} disabled={tx.busy} busy={tx.pending === "Sell now"} busyLabel="Selling…">
                        Sell now for {fmtKii(best.amount, 6)} KII
                      </TxButton>
                    </div>
                  )}

                  {isListed ? (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="lection-address-tokenid-page-1" className="label">Change price (KII)</label>
                        <div className="flex gap-2">
                          <input id="lection-address-tokenid-page-1" className="input" inputMode="decimal" placeholder="New price" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
                          <TxButton variant="secondary" className="shrink-0" onClick={updatePrice} disabled={!newPrice || tx.busy} busy={tx.pending === "Update price"} busyLabel="Updating…">
                            Update price
                          </TxButton>
                        </div>
                        {priceInvalid && <p className="mt-1.5 text-xs text-rose-400">Enter a number greater than 0.</p>}
                      </div>
                      <TxButton variant="danger" className="w-full" onClick={cancelListing} disabled={tx.busy} busy={tx.pending === "Cancel listing"} busyLabel="Cancelling…">
                        Cancel listing
                      </TxButton>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="lection-address-tokenid-page-2" className="label">List for sale (KII)</label>
                      <div className="flex gap-2">
                        <input id="lection-address-tokenid-page-2" className="input" inputMode="decimal" placeholder="0.0" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
                        <TxButton className="shrink-0" onClick={listNft} disabled={!newPrice || newPrice === 0n || tx.busy} busy={tx.pending === "List for sale"} busyLabel="Listing…">
                          List for sale
                        </TxButton>
                      </div>
                      {priceInvalid && <p className="mt-1.5 text-xs text-rose-400">Enter a number greater than 0.</p>}
                      {newPrice && newPrice > 0n && (
                        <p className="hint">
                          You receive about {fmtKii(netOf(newPrice), 6)} KII after fees. One step: no approval needed, and the NFT stays in your wallet until it sells.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* NOT THE OWNER */}
              {!isOwner && (
                <div className="space-y-5">
                  {isListed && price !== undefined && (
                    <TxButton className="w-full !py-3.5 text-base" onClick={buy} disabled={!isConnected || tx.busy} busy={tx.pending === "Buy NFT"} busyLabel="Buying…">
                      {isConnected ? `Buy now for ${fmtKii(price, 6)} KII` : "Connect wallet to buy"}
                    </TxButton>
                  )}

                  <div>
                    <label htmlFor="lection-address-tokenid-page-3" className="label">Make an offer (KII)</label>
                    <div className="flex gap-2">
                      <input id="lection-address-tokenid-page-3" className="input" inputMode="decimal" placeholder="Your offer" value={offerInput} onChange={(e) => setOfferInput(e.target.value)} />
                      <select className="input !w-32 shrink-0" value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Offer duration">
                        {DURATIONS.map(([label, secs]) => (
                          <option key={secs} value={secs}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {offerInvalid && <p className="mt-1.5 text-xs text-rose-400">Enter a number greater than 0.</p>}
                    <p className="hint">The offer amount is deposited into escrow now and returned in full if you cancel or it expires. The owner can take the highest offer at any time.</p>
                    <TxButton
                      variant="secondary"
                      className="mt-3 w-full"
                      onClick={() => void makeOffer()}
                      disabled={!isConnected || !offerAmount || offerAmount === 0n || tx.busy}
                      busy={tx.pending === "Place offer"}
                      busyLabel="Placing offer…"
                    >
                      {isConnected ? "Place offer and deposit" : "Connect wallet to make an offer"}
                    </TxButton>
                  </div>

                  {myOffers.length > 0 && (
                    <div>
                      <p className="eyebrow mb-2">Your active offers</p>
                      <ul className="space-y-2">
                        {myOffers.map((o) => (
                          <li key={o.offerId.toString()} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{fmtKii(o.amount, 6)} KII</p>
                              <p className="text-xs text-zinc-400">expires in {timeLeft(o.expiresAt)}</p>
                            </div>
                            <TxButton variant="ghost" size="sm" onClick={() => cancelOffer(o.offerId)} disabled={tx.busy} busy={tx.pending === "Cancel offer"} busyLabel="Cancelling…">
                              Cancel and refund
                            </TxButton>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* all offers */}
              {offers && offers.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Offers</p>
                  <ul className="divide-y divide-white/[0.06] text-sm">
                    {offers.slice(0, 6).map((o, i) => (
                      <li key={o.offerId.toString()} className="flex items-center justify-between py-2.5">
                        <span className="text-zinc-400">
                          {shortAddr(o.bidder)}
                          {i === 0 && <span className="badge badge-nft ml-2">Highest</span>}
                        </span>
                        <span className="font-medium text-white">{fmtKii(o.amount, 6)} KII</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-1 break-all text-xs text-zinc-400">
          Contract{" "}
          <a href={explorerAddress(nft)} target="_blank" rel="noreferrer" className="hover:text-accent-300">
            {nft}
          </a>
          <CopyButton value={nft} label="contract address" />
        </p>
      </div>
    </div>
  );
}
