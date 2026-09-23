const { ethers } = require("hardhat");

// Change the protocol-usage fee on an already-deployed FeeManager.
// Must be run by the FeeManager owner (your deployer on testnet, your multisig
// on mainnet - for a multisig, submit the same call from the Safe UI instead).
//
//   FEE_MANAGER_ADDRESS=0x... FEE_KII=50 npx hardhat run scripts/setFee.js --network kiiMainnet
//
// The contract itself refuses anything above 50 KII.

async function main() {
  const addr = process.env.FEE_MANAGER_ADDRESS;
  const feeKii = process.env.FEE_KII;
  if (!addr || !feeKii) throw new Error("Set FEE_MANAGER_ADDRESS and FEE_KII (e.g. FEE_KII=1).");

  const feeManager = await ethers.getContractAt("FeeManager", addr);
  const before = await feeManager.feeInKii();
  console.log(`Current fee: ${ethers.formatEther(before)} KII`);

  const tx = await feeManager.setFee(ethers.parseEther(feeKii));
  await tx.wait();

  const after = await feeManager.feeInKii();
  console.log(`New fee:     ${ethers.formatEther(after)} KII`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
