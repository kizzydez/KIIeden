"use client";

import { pinDirectory, pinFile } from "./pinata";
import { buildMerkleTree } from "./merkle";
import type { LaunchBuild } from "@/components/LaunchInfoFields";

type Hex = `0x${string}`;

async function defaultPlaceholderFile(): Promise<File> {
  const res = await fetch("/placeholder.png");
  if (!res.ok) throw new Error("Couldn't load the default placeholder image.");
  const blob = await res.blob();
  return new File([blob], "placeholder.png", { type: "image/png" });
}

/// Pins everything a launch needs besides the token images themselves, and returns the
/// argument object for CollectionFactory.createCollection.
///
///   banner            -> ipfs image
///   placeholder       -> ipfs image + placeholder.json (only when a reveal is scheduled)
///   whitelist.json    -> the published address list (root goes on-chain)
///   token folder      -> one metadata file per token id ("0", "1", ...)
///   collection.json   -> its own file (never inside the token folder, so it can't leak it)
export async function pinLaunch(o: {
  name: string;
  symbol: string;
  description: string;
  firstImageUri: string;
  tokenFiles: { filename: string; content: Blob }[];
  maxSupply: number;
  royaltyBps: number;
  banner: File | null;
  placeholder: File | null;
  launch: LaunchBuild;
  onProgress?: (message: string) => void;
}) {
  const say = o.onProgress ?? (() => {});
  const { launch } = o;

  let bannerUri: string | undefined;
  if (o.banner) {
    say("Uploading banner");
    bannerUri = `ipfs://${await pinFile(o.banner)}`;
  }

  let placeholderURI = "";
  let placeholderImageUri: string | undefined;
  if (launch.reveal) {
    say("Uploading placeholder image");
    const file = o.placeholder ?? (await defaultPlaceholderFile());
    placeholderImageUri = `ipfs://${await pinFile(file)}`;
    const placeholderJson = {
      name: `${o.name} (unrevealed)`,
      description: `This NFT will be revealed on ${new Date(launch.reveal.iso).toUTCString()}.`,
      image: placeholderImageUri,
      attributes: [],
    };
    placeholderURI = `ipfs://${await pinFile(new File([JSON.stringify(placeholderJson)], "placeholder.json", { type: "application/json" }))}`;
  }

  let whitelistRoot: Hex = ("0x" + "00".repeat(32)) as Hex;
  let whitelistInfo: { uri: string; root: string; count: number } | undefined;
  if (launch.whitelist) {
    say("Publishing the whitelist");
    const tree = buildMerkleTree(launch.whitelist.addresses);
    whitelistRoot = tree.root;
    const list = { version: 1, root: tree.root, addresses: launch.whitelist.addresses };
    const uri = `ipfs://${await pinFile(new File([JSON.stringify(list)], "whitelist.json", { type: "application/json" }))}`;
    whitelistInfo = { uri, root: tree.root, count: launch.whitelist.addresses.length };
  }

  say("Pinning token metadata");
  const folderCid = await pinDirectory(o.tokenFiles, "tokens");

  say("Pinning collection details");
  const collectionJson = {
    name: o.name,
    description: o.description,
    // never show a real token image here while a reveal is pending
    image: placeholderImageUri ?? o.firstImageUri,
    banner: bannerUri,
    links: launch.links,
    mint: launch.mint,
    whitelist: whitelistInfo,
    reveal: launch.reveal ? { at: launch.reveal.iso } : undefined,
  };
  const infoURI = `ipfs://${await pinFile(new File([JSON.stringify(collectionJson)], "collection.json", { type: "application/json" }))}`;

  return {
    name: o.name,
    symbol: o.symbol,
    baseURI: `ipfs://${folderCid}/`,
    infoURI,
    placeholderURI,
    maxSupply: BigInt(o.maxSupply),
    royaltyBps: BigInt(o.royaltyBps),
    mintPrice: launch.chain.mintPrice,
    mintStart: launch.chain.start,
    mintEnd: launch.chain.end,
    maxPerWallet: launch.chain.perWallet,
    whitelistRoot,
    whitelistStart: launch.whitelist?.start ?? 0n,
    whitelistEnd: launch.whitelist?.end ?? 0n,
    whitelistPrice: launch.whitelist?.price ?? 0n,
    revealTime: launch.reveal?.at ?? 0n,
  };
}
