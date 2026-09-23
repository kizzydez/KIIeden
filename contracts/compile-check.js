const solc = require("solc");
const fs = require("fs");
const path = require("path");

const contractsDir = path.join(__dirname, "contracts");
const files = fs.readdirSync(contractsDir).filter((f) => f.endsWith(".sol"));

const sources = {};
for (const f of files) {
  sources[`contracts/${f}`] = { content: fs.readFileSync(path.join(contractsDir, f), "utf8") };
}

function findImports(importPath) {
  try {
    let resolved;
    if (importPath.startsWith("contracts/")) {
      resolved = path.join(__dirname, importPath);
    } else {
      resolved = path.join(__dirname, "node_modules", importPath);
    }
    return { contents: fs.readFileSync(resolved, "utf8") };
  } catch (e) {
    return { error: "File not found: " + importPath };
  }
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.severity.toUpperCase() + ":", err.formattedMessage);
    if (err.severity === "error") hasError = true;
  }
}

if (!hasError) {
  console.log("\n✅ All contracts compiled successfully with no errors.");
  for (const f in output.contracts) {
    for (const c in output.contracts[f]) {
      const bytecodeLen = output.contracts[f][c].evm.bytecode.object.length / 2;
      console.log(`  ${c}: ${bytecodeLen} bytes bytecode`);
    }
  }
} else {
  console.log("\n❌ Compilation failed.");
  process.exit(1);
}
