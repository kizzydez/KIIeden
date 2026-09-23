require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Accept the key with or without a 0x prefix (pasting it without one used to
// make Hardhat throw a confusing "invalid account" error).
function normalizeKey(raw) {
  const k = (raw || "").trim();
  if (!k) return "0x" + "11".repeat(32); // dummy key so `hardhat test` / compile work with no .env
  return k.startsWith("0x") ? k : "0x" + k;
}
const PRIVATE_KEY = normalizeKey(process.env.DEPLOYER_PRIVATE_KEY);

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // NOTE: OpenZeppelin 5.x uses the `mcopy` opcode (EVM Cancun). The testnet deploy
      // worked with this setting; re-verify on mainnet before deploying. If it ever
      // fails, pin @openzeppelin/contracts to <5.1 and set evmVersion to "shanghai".
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    kiiTestnet: {
      url: process.env.KII_TESTNET_RPC || "https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com",
      chainId: 1336,
      accounts: [PRIVATE_KEY],
    },
    kiiMainnet: {
      url: process.env.KII_MAINNET_RPC || "https://evmrpc.kiichain.nodestake.org",
      chainId: 1783,
      accounts: [PRIVATE_KEY],
    },
  },
};
