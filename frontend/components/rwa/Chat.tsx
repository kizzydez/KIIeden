"use client";

import { useId, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ACTIVE_CHAIN_ID, ADDRESSES, CHAT_MAX_LENGTH, isSet } from "@/lib/config";
import { rwaAssetAbi, rwaChatAbi } from "@/lib/contracts";
import { useRwaChat } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { sameAddr, shortAddr } from "@/lib/format";
import { TxButton } from "../ui";

type Address = `0x${string}`;

/// Public discussion for one asset. Messages are on-chain events (no server, no account);
/// only wallets that hold units can post. Text is shown as plain text - never as HTML or links.
export default function Chat({ asset }: { asset: Address }) {
  const uid = useId();
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const { data: messages, isLoading } = useRwaChat(asset);
  const [text, setText] = useState("");
  const [ack, setAck] = useState(false);

  const { data: balance } = useReadContract({
    address: asset,
    abi: rwaAssetAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!account },
  });
  const holder = ((balance as bigint | undefined) ?? 0n) > 0n;
  const bytes = new TextEncoder().encode(text).length;
  const tooLong = bytes > CHAT_MAX_LENGTH;

  if (!isSet(ADDRESSES.rwaChat)) return null;

  async function post() {
    if (!text.trim() || tooLong || !ack) return;
    const ok = await tx.run("Post message", { address: ADDRESSES.rwaChat, abi: rwaChatAbi, functionName: "post", args: [asset, text.trim()] }, { successMessage: "Your message is posted." });
    if (ok) setText("");
  }

  return (
    <section className="glass p-6" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="font-display text-lg font-semibold tracking-tight text-white">
        Discussion
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">Only unit holders can post. Messages are public and permanent on the blockchain, so do not share personal information, private keys or recovery phrases. Posts are not advice.</p>

      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-4" role="log" aria-live="polite" aria-label="Messages" tabIndex={0}>
        {isLoading && <p className="text-sm text-zinc-400">Loading messages</p>}
        {!isLoading && (!messages || messages.length === 0) && <p className="text-sm text-zinc-400">No messages yet.</p>}
        {messages?.map((m) => (
          <div key={m.id.toString()}>
            <p className="text-xs text-zinc-400">
              <span className={sameAddr(m.author, account) ? "font-semibold text-accent-300" : "font-medium text-zinc-300"}>{sameAddr(m.author, account) ? "You" : shortAddr(m.author)}</span>
              {" · "}
              <time dateTime={new Date(m.time * 1000).toISOString()}>{new Date(m.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-100">{m.text}</p>
          </div>
        ))}
      </div>

      {isConnected && holder ? (
        <div className="mt-4">
          <label className="label" htmlFor={`${uid}-msg`}>
            Your message
          </label>
          <textarea id={`${uid}-msg`} className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${uid}-count`} />
          <p id={`${uid}-count`} className={`hint ${tooLong ? "!text-rose-300" : ""}`}>
            {bytes} / {CHAT_MAX_LENGTH}
          </p>
          <div className="mt-3 flex items-start gap-3">
            <input id={`${uid}-ack`} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-500" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <label htmlFor={`${uid}-ack`} className="text-xs leading-relaxed text-zinc-300">
              I understand this message will be public and permanent and will be linked to my wallet address.
            </label>
          </div>
          <TxButton className="mt-3 w-full" onClick={() => void post()} disabled={!text.trim() || tooLong || !ack || tx.busy} busy={tx.pending === "Post message"} busyLabel="Posting">
            Post message
          </TxButton>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">{isConnected ? "Hold units of this asset to join the discussion." : "Connect a wallet that holds units to join the discussion."}</p>
      )}
    </section>
  );
}
