const { ethers } = require("hardhat");

// Immediate unblock for an ALREADY-DEPLOYED FeeManager stuck on StalePrice
// (e.g. the old 30-minute-staleness version): re-pushes the same price,
// which resets `priceUpdatedAt` to now and passes the 0%-deviation check
// trivially. Run this manually, or on a cron/scheduled task, from the wallet
// set as PRICE_UPDATER_ADDRESS at deploy time.
//
// Usage: FEE_MANAGER_ADDRESS=0x... [NEW_PRICE_1E8=2000000] npx hardhat run scripts/refreshPrice.js --network kiiTestnet

const FEE_MANAGER_ADDRESS = process.env.FEE_MANAGER_ADDRESS;
const NEW_PRICE_1E8 = process.env.NEW_PRICE_1E8?.replace(/,/g, "");

async function main() {
  if (!FEE_MANAGER_ADDRESS) throw new Error("Set FEE_MANAGER_ADDRESS env var.");

  const feeManager = await ethers.getContractAt("FeeManager", FEE_MANAGER_ADDRESS);
  const current = await feeManager.kiiUsdPrice();
  const priceToSet = NEW_PRICE_1E8 || current;

  console.log(`Pushing price ${priceToSet} (1e8-scaled) to FeeManager at ${FEE_MANAGER_ADDRESS}...`);
  const tx = await feeManager.updatePrice(priceToSet);
  await tx.wait();
  console.log("Done — feeInKii() is unblocked for another `maxPriceStaleness` window (24h by default on the fixed contract, 30min on older deploys).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
