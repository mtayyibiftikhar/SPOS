const fs = require("fs");
const path = require("path");
const { zipSync, strToU8 } = require("fflate");

const workspace = path.resolve(__dirname, "..");
const source = path.join(workspace, "wordpress-plugin", "global-fsms-commerce-bridge");
const output = path.join(workspace, "output", "global-fsms-commerce-bridge-1.0.0.zip");
const excluded = new Set(["tests"]);
const archive = {};

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else {
      const relative = path.relative(path.dirname(source), full).replaceAll(path.sep, "/");
      archive[relative] = new Uint8Array(fs.readFileSync(full));
    }
  }
}

collect(source);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.from(zipSync(archive, { level: 9 })));
console.log(output);
