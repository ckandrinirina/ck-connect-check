// Fails the release job when the pushed tag is not `v` + package.json's version.
import { readFileSync } from "node:fs";

const tag = process.argv[2];
if (!tag) {
  console.error("usage: check-release-tag.mjs <tag>");
  process.exit(2);
}

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const expected = `v${version}`;

if (tag !== expected) {
  console.error(
    `Tag ${tag} does not match package.json version ${version} (expected ${expected}).`,
  );
  process.exit(1);
}
