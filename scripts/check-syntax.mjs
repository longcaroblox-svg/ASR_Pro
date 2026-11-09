import fs from "node:fs";

const files = fs
  .readdirSync("src", { recursive: true })
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.replaceAll("\\", "/"));
let failed = false;
for (const f of files) {
  try {
    await import(`../src/${f}`);
  } catch (exc) {
    console.log("FAIL", f, exc.message);
    failed = true;
  }
}
console.log(failed ? "SYNTAX FAIL" : `SYNTAX OK: ${files.length} files`);
process.exit(failed ? 1 : 0);
