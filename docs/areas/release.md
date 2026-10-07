# Area — release

How the app becomes downloadable: the icon artefacts packaging reads, the tag-driven release workflow, and the download page that links to it.

## Decisions

- The icon is a hand-written SVG in `assets/`, rasterised by a script rather than committed as a binary from a design tool — the artwork is a ring and four bars, which is geometry a text file states exactly, and a reviewable diff beats an opaque PNG
- Rasterisation runs through Electron's own offscreen `BrowserWindow`, not a new image dependency — Chromium is already in the tree and renders the SVG identically to the panel that inspired the mark, so the icon cannot drift from the UI it belongs to
- The generated PNG and `.icns` artefacts are committed, not built on demand — `electron-forge` reads `packagerConfig.icon` from disk at package time, and a packaged build must never depend on a rasterisation step having been run first
- `assets/` and `scripts/` are added to the forge ignore list — the icon reaches the bundle through `packagerConfig.icon`, so shipping its sources inside the asar would be dead weight
- Releases are built by GitHub Actions on a pushed `v*` tag and attached to a GitHub Release, never uploaded by hand — the artifact anyone downloads is reproducible from the tag, and the tag must match `package.json`'s version or the job fails
- The app ships unsigned and un-notarised — there is no Apple Developer account; the download page and README carry the one-time "Open Anyway" instructions instead, and nothing in the build depends on signing so adding it later is a CI-secrets change only
- One universal (`arm64` + `x64`) build per release — the author's Mac is Intel and most current Macs are Apple silicon, and one file avoids asking a non-technical user which chip they have
- The GitHub Pages site links to `releases/latest/download/<fixed asset name>`, never a versioned URL — the page never needs editing when a new version ships
- The Windows build is a Squirrel `Setup.exe` built on a `windows-latest` runner, unsigned — a per-user install needs no admin rights, and SmartScreen's "More info → Run anyway" is documented exactly as Gatekeeper's Open Anyway is
- The icon test checks determinism by rasterising twice on the same machine, and checks the committed artwork against a fresh run by decoded pixels within a small per-channel tolerance, not by file hash (T-101) — Chromium's rasteriser is stable run-to-run on one Mac but not byte-identical across Macs, so a hash comparison failed the macOS release runner on artwork no one changed
