const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// KiiEden deploy script.
//
//   npx hardhat run scripts/deploy.js --network kiiTestnet
//   npx hardhat run scripts/deploy.js --network kiiMainnet     (needs CONFIRM_MAINNET=yes)
//
// Protocol-usage fee (charged on every NFT / collection creation):
//   - KiiChain testnet (1336): 2 KII
//   - KiiChain mainnet (1783): 1 KII
//   - override with FEE_KII=<number> (hard on-chain ceiling: 50 KII)
//
// After deploying, this script writes the addresses straight into
// ../frontend/.env.local, so nobody has to copy them by hand (a single
// mistyped character in an address silently points the app at nothing).
// ---------------------------------------------------------------------------

const DEFAULT_FEE_KII = { 1336: "2", 1783: "1" };
const MAX_FEE_KII = 50;

const RWA_ADMIN_ADDRESS = process.env.RWA_ADMIN_ADDRESS; // optional, see below

function upsertEnv(file, updates) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text += (text && !text.endsWith("\n") ? "\n" : "") + line + "\n";
  }
  fs.writeFileSync(file, text);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId: chainIdBig } = await ethers.provider.getNetwork();
  const chainId = Number(chainIdBig);
  const isMainnet = chainId === 1783;

  if (isMainnet && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error(
      "Refusing to deploy to KiiChain MAINNET without CONFIRM_MAINNET=yes. " +
        "Set TREASURY_ADDRESS to your multisig first, and make sure the audit is done."
    );
  }

  // On testnet the deployer can be the treasury/fee recipient to keep setup short.
  // On mainnet the treasury MUST be set explicitly (ideally a multisig).
  const TREASURY = process.env.TREASURY_ADDRESS || (isMainnet ? undefined : deployer.address);
  if (!TREASURY) throw new Error("Set TREASURY_ADDRESS (your multisig) before deploying to mainnet.");
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT_ADDRESS || TREASURY;

  const feeKii = (process.env.FEE_KII || DEFAULT_FEE_KII[chainId] || "2").trim();
  if (!(Number(feeKii) >= 0 && Number(feeKii) <= MAX_FEE_KII)) {
    throw new Error(`FEE_KII must be between 0 and ${MAX_FEE_KII} (got "${feeKii}").`);
  }
  const feeWei = ethers.parseEther(feeKii);

  console.log("Network chainId:", chainId);
  console.log("Deploying with:", deployer.address);
  console.log("Treasury:", TREASURY, "| Trade-fee recipient:", FEE_RECIPIENT);
  console.log(`Protocol usage fee: ${feeKii} KII`);

  const startBlock = await ethers.provider.getBlockNumber();

  const FeeManager = await ethers.getContractFactory("FeeManager");
  const feeManager = await FeeManager.deploy(TREASURY, feeWei);
  await feeManager.waitForDeployment();
  const feeManagerAddr = await feeManager.getAddress();
  console.log("FeeManager:", feeManagerAddr);

  // The marketplace is deployed BEFORE the factory: the factory hands its address to
  // every collection so listing needs no approval transaction.
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(FEE_RECIPIENT);
  await marketplace.waitForDeployment();
  const marketplaceAddr = await marketplace.getAddress();
  console.log("Marketplace:", marketplaceAddr);

  const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
  const factory = await CollectionFactory.deploy(feeManagerAddr, marketplaceAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("CollectionFactory:", factoryAddr);

  const RWAFactory = await ethers.getContractFactory("RWAFactory");
  const rwaFactory = await RWAFactory.deploy();
  await rwaFactory.waitForDeployment();
  const rwaFactoryAddr = await rwaFactory.getAddress();
  console.log("RWAFactory:", rwaFactoryAddr);

  const RWAUnitMarketplace = await ethers.getContractFactory("RWAUnitMarketplace");
  const rwaMarket = await RWAUnitMarketplace.deploy(rwaFactoryAddr, FEE_RECIPIENT);
  await rwaMarket.waitForDeployment();
  const rwaMarketAddr = await rwaMarket.getAddress();
  console.log("RWAUnitMarketplace:", rwaMarketAddr);

  const RWACurveMarket = await ethers.getContractFactory("RWACurveMarket");
  const rwaCurve = await RWACurveMarket.deploy(rwaFactoryAddr, FEE_RECIPIENT);
  await rwaCurve.waitForDeployment();
  const rwaCurveAddr = await rwaCurve.getAddress();
  console.log("RWACurveMarket:", rwaCurveAddr);

  const RWAChat = await ethers.getContractFactory("RWAChat");
  const rwaChat = await RWAChat.deploy(rwaFactoryAddr);
  await rwaChat.waitForDeployment();
  const rwaChatAddr = await rwaChat.getAddress();
  console.log("RWAChat:", rwaChatAddr);

  // Sanity check straight from the chain.
  const onChainFee = await feeManager.feeInKii();
  console.log(`\nOn-chain fee check: feeInKii() = ${ethers.formatEther(onChainFee)} KII`);

  // ---- Persist the addresses --------------------------------------------
  const addresses = {
    chainId,
    deployBlock: startBlock,
    feeManager: feeManagerAddr,
    collectionFactory: factoryAddr,
    marketplace: marketplaceAddr,
    rwaFactory: rwaFactoryAddr,
    rwaUnitMarketplace: rwaMarketAddr,
    rwaCurveMarket: rwaCurveAddr,
    rwaChat: rwaChatAddr,
    feeKii,
    treasury: TREASURY,
    deployer: deployer.address,
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(addresses, null, 2));
  console.log("Saved", path.relative(process.cwd(), outFile));

  if (process.env.WRITE_FRONTEND_ENV !== "0") {
    const frontendDir = path.join(__dirname, "..", "..", "frontend");
    if (fs.existsSync(frontendDir)) {
      const envFile = path.join(frontendDir, ".env.local");
      if (!fs.existsSync(envFile)) {
        const example = path.join(frontendDir, ".env.example");
        if (fs.existsSync(example)) fs.copyFileSync(example, envFile);
      }
      upsertEnv(envFile, {
        NEXT_PUBLIC_CHAIN_ID: String(chainId),
        NEXT_PUBLIC_FEE_MANAGER_ADDRESS: feeManagerAddr,
        NEXT_PUBLIC_FACTORY_ADDRESS: factoryAddr,
        NEXT_PUBLIC_MARKETPLACE_ADDRESS: marketplaceAddr,
        NEXT_PUBLIC_RWA_FACTORY_ADDRESS: rwaFactoryAddr,
        NEXT_PUBLIC_RWA_MARKETPLACE_ADDRESS: rwaMarketAddr,
        NEXT_PUBLIC_RWA_CURVE_ADDRESS: rwaCurveAddr,
        NEXT_PUBLIC_RWA_CHAT_ADDRESS: rwaChatAddr,
        NEXT_PUBLIC_DEPLOY_BLOCK: String(startBlock),
      });
      console.log("Wrote contract addresses into frontend/.env.local (restart `npm run dev` to pick them up)");
    }
  }

  if (RWA_ADMIN_ADDRESS && RWA_ADMIN_ADDRESS.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`\nHanding RWAFactory admin control to ${RWA_ADMIN_ADDRESS}...`);
    const tx = await rwaFactory.transferOwnership(RWA_ADMIN_ADDRESS);
    await tx.wait();
    console.log(
      `Step 1/2 done: transferOwnership() called. Step 2/2 (required): from the ${RWA_ADMIN_ADDRESS} wallet itself, ` +
        `call rwaFactory.acceptOwnership() - Ownable2Step deliberately won't let the deployer finish this for you, ` +
        `so a typo'd address can't accidentally lock everyone out.`
    );
  }

  console.log("\n--- Next steps ---");
  console.log("1. Restart the frontend (cd ../frontend && npm run dev). Addresses are already in .env.local.");
  console.log(
    RWA_ADMIN_ADDRESS
      ? "2. RWAFactory handoff to RWA_ADMIN_ADDRESS was started above - finish it with acceptOwnership() from that wallet."
      : "2. RWAFactory ownership IS your RWA-listing admin gate - it defaults to the deployer. Set RWA_ADMIN_ADDRESS and re-run if another wallet should hold it."
  );
  console.log("3. To change the fee later: FEE_KII=<0-50> npx hardhat run scripts/setFee.js --network <network>");
  console.log("4. Verify the contracts on the KiiChain explorer.");
  if (isMainnet) {
    console.log("5. MAINNET: transfer ownership of FeeManager, CollectionFactory, Marketplace, RWAFactory, RWAUnitMarketplace, RWACurveMarket and RWAChat to your multisig (Ownable2Step: multisig must then call acceptOwnership()).");
  } else {
    console.log("5. Before mainnet: move ownership of every contract to a multisig (transferOwnership -> acceptOwnership).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
