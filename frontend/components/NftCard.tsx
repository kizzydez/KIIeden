"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { ACTIVE_CHAIN_ID } from "@/lib/config";
import { collectionAbi } from "@/lib/contracts";
import { fetchNftMetadata, type NftMetadata } from "@/lib/ipfs";
import { fmtKii } from "@/lib/format";
import TiltCard from "./TiltCard";
import IpfsImage from "./IpfsImage";

export function useNftMetadata(nft: `0x${string}`, tokenId: bigint) {
  const [meta, setMeta] = useState<NftMetadata | null>(null);
  const { data: tokenUri } = useReadContract({
    address: nft,
    abi: collectionAbi,
    functionName: "tokenURI",
    args: [tokenId],
    chainId: ACTIVE_CHAIN_ID,
    query: { staleTime: 5 * 60_000 },
  });

  useEffect(() => {
    let alive = true;
    if (tokenUri) fetchNftMetadata(tokenUri as string).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [tokenUri]);

  return meta;
}

export default function NftCard({
  nft,
  tokenId,
  price,
  href,
  listed,
  unrevealed,
}: {
  nft: `0x${string}`;
  tokenId: bigint;
  price?: bigint;
  href: string;
  listed?: boolean;
  unrevealed?: boolean;
}) {
  const meta = useNftMetadata(nft, tokenId);
  const title = meta?.name || `Token #${tokenId.toString()}`;

  return (
    <TiltCard>
      <Link href={href} className="block rounded-[inherit]">
        <div className="relative overflow-hidden rounded-t-[1.25rem]">
          <IpfsImage src={meta?.image} alt={`${title}${unrevealed ? " (unrevealed placeholder)" : ""}, artwork`} className="aspect-square" />
          <span className="badge badge-nft absolute top-3 left-3 backdrop-blur">{unrevealed ? "Unrevealed" : "NFT"}</span>
          {listed && <span className="badge badge-live badge-warn absolute top-3 right-3 backdrop-blur">Listed</span>}
        </div>
        <div className="p-4">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          <div className="flex items-center justify-between mt-1.5 min-h-[1.5rem]">
            <span className="text-xs text-zinc-400">#{tokenId.toString()}</span>
            {price !== undefined ? (
              <span className="text-sm font-bold text-accent-300">{fmtKii(price)} KII</span>
            ) : (
              <span className="text-xs text-zinc-400">Not listed</span>
            )}
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}
