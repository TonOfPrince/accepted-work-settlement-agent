import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
// Supply confidential-term patterns locally; never embed private labels in this file.
const forbiddenName = new RegExp(process.env.PUBLIC_EXPORT_FORBIDDEN_PATTERN ?? "(?!)", "i");
const requiredFiles = [
  "README.md",
  "package.json",
  "agent.ts",
  "agent-test.ts",
  "awx-receipt.ts",
  "awx-receipt-test.ts",
  "demo.ts",
  "server.ts",
  "server-test.ts",
  "settlement.ts",
  "settlement-test.ts",
  "verify-public-export.mjs",
  "SUBMISSION_READINESS.md",
  "JUDGING_PACKET.md",
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    assert.equal(forbiddenName.test(relative(root, path)), false, `confidential internal name in export path: ${relative(root, path)}`);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isSymbolicLink()) throw new Error(`public export contains symlink: ${relative(root, path)}`);
    else out.push(path);
  }
  return out;
}

for (const file of requiredFiles) {
  assert.equal(await exists(join(root, file)), true, `missing required public-export file: ${file}`);
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(packageJson.private, true, "package must stay private to prevent accidental npm publication");
for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  const deps = packageJson[group] ?? {};
  for (const [name, version] of Object.entries(deps)) {
    assert.equal(
      String(version).startsWith("file:") || String(version).startsWith("workspace:"),
      false,
      `public export cannot depend on local/private package ${name}: ${version}`,
    );
  }
}

const allFiles = await walk(root);
for (const path of allFiles) {
  // Scan every file, including unknown extensions and readable binary metadata.
  // Compressed containers need a separate inspection of their extracted members.
  const text = (await readFile(path)).toString("utf8");
  assert.equal(
    forbiddenName.test(text),
    false,
    `confidential internal name in public export: ${relative(root, path)}`,
  );
  assert.equal(
    /\bBrett\b/.test(text),
    false,
    `personal owner name in public export: ${relative(root, path)}`,
  );
}

const sourceFiles = allFiles.filter((path) => [".ts", ".mjs", ".js"].includes(extname(path)));
let importsChecked = 0;
for (const path of sourceFiles) {
  const text = await readFile(path, "utf8");
  const specs = [
    ...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);

  for (const spec of specs) {
    importsChecked += 1;
    assert.equal(spec.startsWith("../"), false, `private parent import in ${relative(root, path)}: ${spec}`);
    assert.equal(spec.startsWith("/"), false, `absolute import in ${relative(root, path)}: ${spec}`);
    if (spec.startsWith("./") || spec.startsWith("node:")) continue;
    throw new Error(`external package import must be explicitly reviewed before public export: ${spec} in ${relative(root, path)}`);
  }

}

console.log(`PASS: public-export source is self-contained; checked ${sourceFiles.length} source files and ${importsChecked} imports.`);
if (await exists(join(root, "LICENSE"))) {
  console.log("PASS: LICENSE is present.");
} else {
  console.log("GATED: LICENSE is not present. Choose an open-source license before publication/submission.");
}
