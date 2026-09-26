"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { marketplaceAbi } from "@/lib/contracts";
import { Spinner } from "@/components/ui";

/// Old links used /listing/<id>. The canonical page for an NFT is
/// /collection/<address>/<tokenId>, so this just resolves the id and redirects.
export default function ListingRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const raw = params?.id ?? "";
  const valid = /^\d+$/.test(raw);

  const { data } = useReadContract({
    address: ADDRESSES.marketplace,
    abi: marketplaceAbi,
    functionName: "listings",
    args: valid ? [BigInt(raw)] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: valid },
  });

  useEffect(() => {
    if (data) router.replace(`/collection/${data[1]}/${data[2].toString()}`);
  }, [data, router]);

  if (!valid) return <p className="text-rose-300">Invalid listing id.</p>;
  return (
    <p className="text-zinc-400 flex items-center gap-2">
      <Spinner /> Opening listing…
    </p>
  );
}
