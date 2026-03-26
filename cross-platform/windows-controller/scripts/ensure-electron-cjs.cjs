const fs = require("fs");
const path = require("path");

const distElectronDir = path.join(__dirname, "..", "dist-electron");
const pkgJsonPath = path.join(distElectronDir, "package.json");

fs.mkdirSync(distElectronDir, { recursive: true });
fs.writeFileSync(
  pkgJsonPath,
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  "utf-8"
);
