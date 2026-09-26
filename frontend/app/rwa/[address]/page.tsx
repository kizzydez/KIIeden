"use client";

import { useEffect, useId, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { rwaAssetAbi, rwaMarketplaceAbi } from "@/lib/contracts";
import { useRwaAssetState, useRwaOrders, type RwaOrder } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, parseAmount, pctOf, sameAddr, shortAddr, timeLeft, unitCost } from "@/lib/format";
import { explorerAddress } from "@/lib/chains";
import { fetchNftMetadata, toHttp, type NftMetadata } from "@/lib/ipfs";
import { safeHref } from "@/lib/sanitize";
import IpfsImage from "@/components/IpfsImage";
import Icon from "@/components/Icon";
import MarketData from "@/components/rwa/MarketData";
import PriceChart from "@/components/rwa/PriceChart";
import TradePanel from "@/components/rwa/TradePanel";
import OrderBook from "@/components/rwa/OrderBook";
import Liquidity from "@/components/rwa/Liquidity";
import Chat from "@/components/rwa/Chat";
import RiskAck from "@/components/rwa/RiskAck";
import { RWA_PHASE_LABEL, rwaPhase, type RwaPhase } from "@/lib/status";
import { useNow } from "@/lib/useNow";
import { countdown } from "@/lib/status";
import { ErrorNote, TxButton } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

const ONE = 10n ** 18n;

export default function RwaAssetPage() {
  const params = useParams<{ address: string }>();
  const addr = params?.address ?? "";
  if (!isAddress(addr)) return <ErrorNote>That asset link isn&apos;t valid.</ErrorNote>;
  return <AssetView asset={addr as `0x${string}`} />;
}

function AssetView({ asset }: { asset: `0x${string}` }) {
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const uid = useId();
  const [ack, setAck] = useState(false);

  const read = { address: asset, abi: rwaAssetAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: name } = useReadContract({ ...read, functionName: "name" });
  const { data: symbol } = useReadContract({ ...read, functionName: "symbol" });
  const { data: totalUnits } = useReadContract({ ...read, functionName: "totalUnits" });
  const { data: pricePerUnit } = useReadContract({ ...read, functionName: "pricePerUnit" });
  const { data: totalSupply } = useReadContract({ ...read, functionName: "totalSupply" });
  const { data: ipoEndTime } = useReadContract({ ...read, functionName: "ipoEndTime" });
  const { data: ipoStartTime } = useReadContract({ ...read, functionName: "ipoStartTime" });
  const { data: treasury } = useReadContract({ ...read, functionName: "assetTreasury" });
  const { data: pendingProceeds } = useReadContract({ ...read, functionName: "pendingTreasuryWithdrawal" });
  const { data: myBalance } = useReadContract({ ...read, functionName: "balanceOf", args: account ? [account] : undefined, query: { enabled: !!account } });
  const { data: myAllowance } = useReadContract({
    ...read,
    functionName: "allowance",
    args: account ? [account, ADDRESSES.rwaMarketplace] : undefined,
    query: { enabled: !!account },
  });

  const { data: state } = useRwaAssetState(asset);
  const { data: orders } = useRwaOrders(asset);

  const [meta, setMeta] = useState<NftMetadata | null>(null);
  useEffect(() => {
    let alive = true;
    if (state?.metadataUri) fetchNftMetadata(state.metadataUri).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [state?.metadataUri]);

  const [contributeInput, setContributeInput] = useState("");
  const [listUnitsInput, setListUnitsInput] = useState("");
  const [listPriceInput, setListPriceInput] = useState("");

  const price = pricePerUnit as bigint | undefined;
  const total = totalUnits as bigint | undefined;
  const sold = state?.unitsSold;
  const ipoOpen = state?.ipoOpen;
  const now = useNow(1000);
  const nowSec = Math.floor(now / 1000);
  const phase: RwaPhase | undefined = ipoStartTime !== undefined ? rwaPhase({ ipoStartTime: ipoStartTime as bigint }, state, nowSec) : undefined;
  const upcoming = phase === "upcoming";
  const ended = state?.ipoEnded === true;
  const pct = sold !== undefined && total !== undefined ? pctOf(sold, total) : 0;
  const isTreasury = sameAddr(account, treasury as string | undefined);
  const title = meta?.name || (name as string) || "…";
  const gallery = meta?.images && meta.images.length > 0 ? meta.images : meta?.image ? [meta.image] : [];

  // ---- contribute maths (mirrors RWAAsset.contribute) ----
  const amount = parseAmount(contributeInput);
  let wholeUnits = 0n;
  let cost = 0n;
  if (amount && price && price > 0n && total !== undefined && sold !== undefined) {
    const requested = amount / price;
    const remaining = (total - sold) / ONE;
    wholeUnits = requested > remaining ? remaining : requested;
    cost = wholeUnits * price;
  }
  const contributeInvalid = contributeInput.trim() !== "" && (amount === null || wholeUnits === 0n);

  function contribute() {
    if (!amount || wholeUnits === 0n) return;
    void tx.run(
      "Contribute",
      { address: asset, abi: rwaAssetAbi, functionName: "contribute", value: amount },
      { successMessage: `You received ${wholeUnits.toString()} unit${wholeUnits === 1n ? "" : "s"}. Any extra KII was refunded.` }
    );
  }

  // ---- list units maths ----
  const listUnits = parseAmount(listUnitsInput);
  const listPrice = parseAmount(listPriceInput);
  const balance = (myBalance as bigint | undefined) ?? 0n;
  const listInvalid = listUnits === null || listUnits === 0n || listUnits > balance || listPrice === null || listPrice === 0n;
  const needsApproval = listUnits !== null && myAllowance !== undefined && listUnits > (myAllowance as bigint);

  function approveMarketplace() {
    if (!listUnits) return;
    void tx.run("Approve units", { address: asset, abi: rwaAssetAbi, functionName: "approve", args: [ADDRESSES.rwaMarketplace, listUnits] });
  }
  async function listForSale() {
    if (listInvalid || !listUnits || !listPrice) return;
    const ok = await tx.run("List units", {
      address: ADDRESSES.rwaMarketplace,
      abi: rwaMarketplaceAbi,
      functionName: "listUnits",
      args: [asset, listUnits, listPrice],
    });
    if (ok) {
      setListUnitsInput("");
      setListPriceInput("");
    }
  }

  function withdrawProceeds() {
    void tx.run("Withdraw proceeds", { address: asset, abi: rwaAssetAbi, functionName: "withdrawProceeds" });
  }

  const soldOut = sold !== undefined && total !== undefined && sold >= total;

  const supply = (totalSupply as bigint | undefined) ?? sold ?? 0n;

  return (
    <div>
      {/* header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 page-enter">
        <div>
          <p className="eyebrow mb-2">Real-world asset</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {(symbol as string) || ""} · custodian{" "}
            {treasury ? (
              <span className="inline-flex items-center gap-1">
                <a href={explorerAddress(treasury as string)} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline">
                  {shortAddr(treasury as string)}
                </a>
                <CopyButton value={treasury as string} label="custodian address" />
              </span>
            ) : (
              "…"
            )}
          </p>
        </div>
        {phase && <span className={`badge ${phase === "trading" ? "badge-rwa" : phase === "upcoming" ? "badge-warn" : "badge-nft badge-live"}`}>{RWA_PHASE_LABEL[phase]}</span>}
      </div>

      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* ===================== LEFT: asset information ===================== */}
        <div className="space-y-8 lg:col-span-7">
          <Gallery images={gallery} title={title} />

          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="sr-only">
              About this asset
            </h2>
            {meta?.description && <p className="leading-relaxed text-zinc-200">{meta.description}</p>}
            {meta?.longDescription && <p className="mt-3 whitespace-pre-line leading-relaxed text-zinc-300">{meta.longDescription}</p>}
            <AssetFacts meta={meta} />
          </section>

          {/* subscription */}
          <section className="glass p-6" aria-labelledby="ipo-heading">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="ipo-heading" className="eyebrow">
                IPO subscription
              </h2>
              <p className="font-display text-3xl font-semibold text-white">{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%</p>
            </div>
            <div className="gauge" style={{ height: 10 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Share of units subscribed">
              <span style={{ width: `${pct}%` }} />
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="eyebrow">IPO price</dt>
                <dd className="mt-1 font-semibold text-white">{fmtKii(price)} KII</dd>
              </div>
              <div>
                <dt className="eyebrow">Units sold</dt>
                <dd className="mt-1 font-semibold text-white">
                  {sold !== undefined ? fmtKii(sold, 2) : "…"} / {total !== undefined ? fmtKii(total, 2) : "…"}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{upcoming ? "Opens in" : ipoOpen ? "Ends in" : "IPO"}</dt>
                <dd className="mt-1 font-semibold text-white">{upcoming && ipoStartTime ? countdown(Number(ipoStartTime) - nowSec) : ipoOpen && ipoEndTime ? timeLeft(Number(ipoEndTime)) : "closed"}</dd>
              </div>
            </dl>
            {account && balance > 0n && (
              <p className="mt-5 text-center text-sm text-accent-300">
                You hold <b>{fmtKii(balance, 4)}</b> units{total ? ` (${pctOf(balance, total).toFixed(2)}% of the asset)` : ""}.
              </p>
            )}
          </section>

          {ended && price !== undefined && <PriceChart asset={asset} ipoPrice={price} />}

          {ended && price !== undefined && (
            <details className="glass group p-6 sm:p-7">
              <summary className="cursor-pointer list-none font-display font-semibold text-white">
                Peer-to-peer orders <span className="ml-1 text-sm font-normal text-zinc-400">set your own price</span>
              </summary>
              <div className="mt-6 space-y-8">
                {isConnected && balance > 0n && (
                  <div className="space-y-4">
                    <h3 className="font-display font-semibold text-white">Sell your units</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label" htmlFor={`${uid}-lu`}>
                          Units (max {fmtKii(balance, 4)})
                        </label>
                        <input id={`${uid}-lu`} className="input" inputMode="decimal" value={listUnitsInput} onChange={(e) => setListUnitsInput(e.target.value)} placeholder="10" />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${uid}-lp`}>
                          Price per unit (KII)
                        </label>
                        <input id={`${uid}-lp`} className="input" inputMode="decimal" value={listPriceInput} onChange={(e) => setListPriceInput(e.target.value)} placeholder="1.2" />
                      </div>
                    </div>
                    {listUnits !== null && listUnits > balance && <p className="text-xs text-rose-300">You only hold {fmtKii(balance, 4)} units.</p>}
                    {needsApproval ? (
                      <TxButton variant="secondary" className="w-full" onClick={approveMarketplace} disabled={listUnits === null || listUnits === 0n || tx.busy} busy={tx.pending === "Approve units"} busyLabel="Approving units">
                        Step 1 of 2: approve these units
                      </TxButton>
                    ) : (
                      <TxButton className="w-full" onClick={listForSale} disabled={listInvalid || tx.busy} busy={tx.pending === "List units"} busyLabel="Listing units">
                        List units for sale
                      </TxButton>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="mb-3 font-display font-semibold text-white">Units for sale</h3>
                  {!orders || orders.length === 0 ? (
                    <p className="text-sm text-zinc-400">No active sell orders yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((o) => (
                        <OrderRow key={o.orderId.toString()} order={o} asset={asset} account={account} tx={tx} isConnected={isConnected} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          )}
        </div>

        {/* ============== RIGHT: trading, market data, order book, chat ============== */}
        <aside className="space-y-6 lg:col-span-5" aria-label="Trading and discussion">
          {isTreasury && ended && (pendingProceeds as bigint | undefined) !== undefined && (pendingProceeds as bigint) > 0n && (
            <section className="glass p-6" aria-label="IPO proceeds">
              <p className="font-display font-semibold text-white">IPO proceeds ready</p>
              <p className="mt-1 text-sm text-zinc-400">{fmtKii(pendingProceeds as bigint)} KII raised are waiting for the asset treasury.</p>
              <TxButton className="mt-4" onClick={withdrawProceeds} disabled={tx.busy} busy={tx.pending === "Withdraw proceeds"} busyLabel="Withdrawing">
                Withdraw {fmtKii(pendingProceeds as bigint)} KII
              </TxButton>
            </section>
          )}

          {upcoming && (
            <section className="glass p-6" aria-label="IPO not open yet">
              <p className="font-display font-semibold text-white">This IPO has not opened yet</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                It opens {ipoStartTime ? new Date(Number(ipoStartTime) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "soon"}. You can contribute from this page as soon as it starts.
              </p>
            </section>
          )}

          {ipoOpen && (
            <section className="glass space-y-4 p-6" aria-labelledby="contribute-heading">
              <div>
                <h2 id="contribute-heading" className="font-display text-lg font-semibold tracking-tight text-white">
                  Back this asset
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">Units are sold at a fixed price and land in your wallet immediately. Any KII beyond a whole unit is refunded. Units cannot be transferred until the IPO ends.</p>
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-c`}>
                  Amount to contribute (KII)
                </label>
                <input id={`${uid}-c`} className="input" inputMode="decimal" placeholder={price ? `e.g. ${fmtKii(price * 10n)}` : "0.0"} value={contributeInput} onChange={(e) => setContributeInput(e.target.value)} />
                {wholeUnits > 0n && amount && (
                  <p className="hint !text-accent-300" role="status">
                    You receive <b>{wholeUnits.toString()}</b> unit{wholeUnits === 1n ? "" : "s"} for {fmtKii(cost, 6)} KII
                    {amount > cost ? `. ${fmtKii(amount - cost, 6)} KII is refunded.` : "."}
                  </p>
                )}
                {contributeInvalid && <p className="mt-1.5 text-xs text-rose-300">Enter at least the price of one unit ({fmtKii(price)} KII).</p>}
              </div>
              <RiskAck checked={ack} onChange={setAck} />
              <TxButton className="w-full !py-3.5" onClick={contribute} disabled={!isConnected || !ack || wholeUnits === 0n || soldOut || tx.busy} busy={tx.pending === "Contribute"} busyLabel="Contributing">
                {isConnected ? "Contribute KII for units" : "Connect wallet to contribute"}
              </TxButton>
            </section>
          )}

          {ended && price !== undefined && (
            <>
              <MarketData asset={asset} ipoPrice={price} totalSupply={supply} totalUnits={total ?? 0n} />
              <TradePanel asset={asset} ipoPrice={price} />
              <OrderBook asset={asset} />
              <Liquidity asset={asset} />
            </>
          )}

          <Chat asset={asset} />
        </aside>
      </div>

      <p className="mt-12 max-w-3xl text-xs leading-relaxed text-zinc-400">
        Fractionalized real-world assets can be regulated as securities and may not be available in your country. Listing on KiiEden is not an endorsement or a guarantee of any return. Nothing here is legal, tax or investment advice. Read the{" "}
        <a href="/terms#rwa" className="text-accent-300 underline underline-offset-2">
          risk disclosures
        </a>
        .
      </p>
    </div>
  );
}

function OrderRow({
  order,
  account,
  isConnected,
  tx,
}: {
  order: RwaOrder;
  asset: `0x${string}`;
  account: `0x${string}` | undefined;
  isConnected: boolean;
  tx: ReturnType<typeof useTx>;
}) {
  const [input, setInput] = useState("");
  const mine = sameAddr(account, order.seller);
  const parsed = parseAmount(input);
  const units = input.trim() === "" ? order.remainingUnits : parsed;
  const valid = units !== null && units > 0n && units <= order.remainingUnits;
  const cost = valid ? unitCost(units as bigint, order.pricePerUnit) : 0n;
  const label = `Buy units #${order.orderId.toString()}`;

  function buy() {
    if (!valid) return;
    void tx.run(label, { address: ADDRESSES.rwaMarketplace, abi: rwaMarketplaceAbi, functionName: "buyUnits", args: [order.orderId, units as bigint], value: cost });
  }
  function cancel() {
    void tx.run("Cancel order", { address: ADDRESSES.rwaMarketplace, abi: rwaMarketplaceAbi, functionName: "cancelOrder", args: [order.orderId] });
  }

  return (
    <div className="glass p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="text-sm font-semibold text-white">{fmtKii(order.remainingUnits, 4)} units available</p>
        <p className="text-xs text-zinc-400">
          {fmtKii(order.pricePerUnit, 6)} KII / unit · seller {mine ? "you" : shortAddr(order.seller)}
        </p>
      </div>
      {mine ? (
        <TxButton variant="danger" size="sm" onClick={cancel} disabled={tx.busy} busy={tx.pending === "Cancel order"} busyLabel="Cancelling…">
          Cancel order
        </TxButton>
      ) : (
        <div className="flex items-center gap-2">
          <input className="input !w-28 !py-2" inputMode="decimal" placeholder="all" value={input} onChange={(e) => setInput(e.target.value)} aria-label={`Units to buy from order ${order.orderId.toString()}`} />
          <TxButton size="sm" onClick={buy} disabled={!isConnected || !valid || tx.busy} busy={tx.pending === label} busyLabel="Buying…">
            Buy for {fmtKii(cost, 4)} KII
          </TxButton>
        </div>
      )}
    </div>
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = images[Math.min(active, Math.max(images.length - 1, 0))];
  return (
    <div className="mb-6">
      <div className="glass p-3 shadow-glow-lg">
        <IpfsImage src={current} alt={`${title}, photo ${Math.min(active, Math.max(images.length - 1, 0)) + 1} of ${Math.max(images.length, 1)}`} className="aspect-[16/9] rounded-2xl" fallback={<Icon name="building" className="text-5xl" />} />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 mt-3">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}`}
              className={`rounded-xl overflow-hidden transition-all duration-300 ${i === active ? "ring-2 ring-accent-400 scale-[1.03]" : "opacity-60 hover:opacity-100"}`}
            >
              <IpfsImage src={src} alt="" className="aspect-square" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="glass px-4 py-3" style={{ borderRadius: "0.9rem" }}>
      <p className="text-[11px] uppercase tracking-widest text-accent-400 font-semibold">{label}</p>
      <p className="text-sm text-white mt-0.5 break-words">{value}</p>
    </div>
  );
}

function AssetFacts({ meta }: { meta: NftMetadata | null }) {
  const p = meta?.properties;
  const docs = (meta?.documents ?? [])
    .map((d, i) => (typeof d === "string" ? { name: `Document ${i + 1}`, uri: d } : { name: d.name || `Document ${i + 1}`, uri: d.uri }))
    .map((d) => ({ ...d, href: safeHref(toHttp(d.uri, 0)) }))
    .filter((d) => !!d.href);
  if (!p && docs.length === 0) return null;
  const loc = [p?.location?.address, p?.location?.city, p?.location?.country].filter(Boolean).join(", ");
  const size = p?.size?.value ? `${p.size.value} ${p.size.unit ?? ""}`.trim() : "";
  return (
    <div className="mt-6 space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Fact label="Location" value={loc} />
        <Fact label="Property type" value={p?.propertyType} />
        <Fact label="Size" value={size} />
        <Fact label="Year built" value={p?.yearBuilt} />
        <Fact label="Legal owner" value={p?.ownership?.owner} />
        <Fact label="Ownership structure" value={p?.ownership?.structure} />
        <Fact label="Title / registry ref" value={p?.ownership?.titleRef} />
        <Fact label="Valuation" value={p?.valuation} />
        <Fact label="Issuer estimate: annual yield" value={p?.yield?.annualPct ? `${p.yield.annualPct}%` : ""} />
        <Fact label="Rental income" value={p?.yield?.rentalIncome} />
        <Fact label="Payouts" value={p?.yield?.payout} />
      </div>
      {p?.additional && (
        <div className="glass p-4" style={{ borderRadius: "0.9rem" }}>
          <p className="text-[11px] uppercase tracking-widest text-accent-400 font-semibold">Additional information</p>
          <p className="text-sm text-zinc-300 mt-1 whitespace-pre-line">{p.additional}</p>
        </div>
      )}
      {docs.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-2">Legal documents</p>
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.uri}>
                <a href={d.href} target="_blank" rel="noreferrer noopener" className="text-sm text-accent-400 hover:text-accent-300 underline underline-offset-2">
                  {d.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
