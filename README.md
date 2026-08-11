# Hints Reel Composer

Local-first, non-destructive reel assembly and finishing workspace for Hints.
It consumes externally generated shots and gives the operator frame-accurate
control over timeline structure, text, transforms, sound, and final delivery.

## Source Governance

Version `0.1.0` entered the parent repository as an audited filesystem snapshot
on the Hints Reel Composer hardening branch. This establishes a real rollback
boundary from that point forward; it does not claim retroactive Git history.
Build outputs, dependencies, runtime uploads, generated proxies, renders, QA,
logs, and user `.hintsreel` projects remain deliberately excluded from Git.

## Start

```bash
cd /home/jemy/Documents/my_work/x_port_x/hints_brand_studio/reel_composer
npm install
npm run build
npm start
```

Open `http://127.0.0.1:8090`.

Or launch the verified local stack with:

```bash
./start-reel-composer.sh
```

For live frontend development:

```bash
npm run dev
```

## Golden Reel

Create a managed, editable project from the retained OBI v03 source plates:

```bash
npm run seed:golden
```

The script copies every source into a new `.hintsreel` project. It does not
modify the experiment source folder.

## Project Contract

- `project.json` is the canonical HRC Recipe v1.
- Imported media is copied into `media/` and checksum protected.
- `proxies/`, `thumbnails/`, and `waveforms/` are derived caches.
- Every render retains the recipe, manifest, filter graph, FFmpeg log, and QA frames.
- Text export uses managed UTF-8 line files and independent glyph runs for
  multiline copy, so official Bomstad typography does not leak newline glyphs;
  those text inputs are included in the provenance bundle.
- QA writes a four-beat contact sheet, FFprobe metadata, audio loudness/true-peak evidence, and format-specific frame-count checks.
- The local API binds to `127.0.0.1` and never accepts arbitrary shell commands.
- Recipe validation is deep and fail-closed: unknown fields, unsafe IDs/files,
  malformed timing, non-finite values, unsupported controls, and dangling
  references are rejected before apply or render.
- Recipe apply cannot invent managed assets or silently change project identity;
  media must enter through the asset-import contract first.
- FFprobe, not upload MIME or extension, is the media-type authority. Failed
  imports roll back temporary and managed files transactionally.
- Upload limits are configurable with `HRC_MAX_IMPORT_BYTES`; JSON body limits
  are configurable with `HRC_JSON_LIMIT`.

## Current Editing Surface

- Four managed ratio sequences: 9:16, 16:9, 1:1, and 4:5.
- Multitrack media, audio, text, and Hints signal layers.
- Move, trim, split, duplicate, delete, mute, solo, hide, lock, and snap.
- Frame stepping, safe guides, direct preview movement, transform inspector, and keyframes.
- Synchronized visual editor and validated JSON Recipe drawer.
- Native FFmpeg draft, review, delivery, ProRes, WebM, palette GIF, animated WebP, and zipped PNG-sequence renders.
- Hints Guide Mode with on-demand info markers, Arabic ghost cards, `?` toggle, and `Shift + Click` quick help outside the Timeline.
- Governed Preview to Export parity contract with a local Chrome/FFmpeg/ImageMagick golden suite. See [`docs/PREVIEW_EXPORT_PARITY.md`](docs/PREVIEW_EXPORT_PARITY.md).
- Governed headless API/CLI operations with durable bounded render jobs,
  revision-safe saves, source-bound preview proxies, output retrieval, and
  provenance bundles. See [`docs/HEADLESS_OPERATIONS.md`](docs/HEADLESS_OPERATIONS.md).

The Preview is an operator surface. Final FFmpeg render is visibly identified
as the delivery authority wherever bounded typography rasterization differences
remain.

The original Hints Brand Studio remains the canonical official identity-motion
workspace. Reel Composer does not redraw or replace the logo system.

## V1 Boundary

Version `0.1.0` is now a production-qualified, provider-neutral local assembly
and render engine. Project-safe media ingestion, strict HRC Recipe validation,
visual timeline assembly, frame-accurate transforms and keyframes, editable
multiline LTR/RTL typography, deterministic FFmpeg rendering, multi-ratio
sequences, durable render jobs, provenance, and delivery QA have all passed a
fresh headless production qualification. The GUI remains the human review and
override surface; it is not required for the governed machine production path.

Run the isolated qualification with:

```bash
npm run test:production
```

The qualification creates only fresh sandboxed projects, imports the approved
already-rendered identity motion as ordinary managed media, produces review and
delivery outputs plus an alternate ratio, exercises restart/retry behavior, and
verifies that source media and Founder projects remain unchanged.

Advanced finishing controls remain a deliberate next wave: editable masks and
feathering, LUT/curves UI, speed ramps, full EQ/ducking controls, offline-media
relink, and visual-regression recovery. Until those controls land, use the
trusted adapters or a dedicated finishing application rather than embedding
free-form shell commands in a Recipe.

Official Hints identity motion must be rendered by Hints Brand Studio and then
imported here as an ordinary managed media asset with the optional
`official-brand-motion` role. That role records provenance only: trimming,
positioning, and composition remain ordinary media operations, and Reel
Composer never reconstructs the official wordmark internally.
