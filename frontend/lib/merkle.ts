import { concatHex, encodePacked, isAddress, keccak256 } from "viem";

/// Whitelist Merkle tree. Must match NFTCollection.whitelistMint exactly:
///   leaf  = keccak256(abi.encodePacked(address))
///   node  = keccak256(sorted(left, right))         (OpenZeppelin MerkleProof, commutative)
/// The creator publishes the full address list on IPFS; the root goes on-chain. The app
/// rebuilds the tree from the published list to give each wallet its proof.

type Hex = `0x${string}`;

export function leafOf(address: string): Hex {
  return keccak256(encodePacked(["address"], [address as Hex]));
}

function hashPair(a: Hex, b: Hex): Hex {
  return BigInt(a) <= BigInt(b) ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}

export type MerkleTree = {
  root: Hex;
  layers: Hex[][];
  proofFor: (address: string) => Hex[] | null;
};

export function buildMerkleTree(addresses: string[]): MerkleTree {
  const leaves = addresses.map(leafOf);
  const index = new Map<string, number>();
  leaves.forEach((l, i) => {
    if (!index.has(l)) index.set(l, i);
  });

  const layers: Hex[][] = [leaves];
  let layer = leaves;
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
    layers.push(next);
    layer = next;
  }

  return {
    root: (layer[0] ?? ("0x" + "00".repeat(32))) as Hex,
    layers,
    proofFor(address: string) {
      let idx = index.get(leafOf(address));
      if (idx === undefined) return null;
      const proof: Hex[] = [];
      for (let l = 0; l < layers.length - 1; l++) {
        const sib = idx ^ 1;
        if (sib < layers[l].length) proof.push(layers[l][sib]);
        idx = idx >> 1;
      }
      return proof;
    },
  };
}

/// Parse pasted / uploaded text into a clean, de-duplicated address list.
/// Accepts any mix of spaces, commas, semicolons, tabs and new lines (so a CSV column works).
export function parseAddressList(text: string): { valid: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (isAddress(p)) {
      const k = p.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        valid.push(p);
      }
    } else if (!/^address$/i.test(p) && !/^wallet$/i.test(p)) {
      invalid.push(p);
    }
  }
  return { valid, invalid };
}
