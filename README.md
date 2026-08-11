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

The Preview is an operator surface. Final FFmpeg render is visibly identified
as the delivery authority wherever bounded typography rasterization differences
remain.

The original Hints Brand Studio remains the canonical official identity-motion
workspace. Reel Composer does not redraw or replace the logo system.

## V1 Boundary

This release is the production-capable Golden Reel slice: project-safe media
ingestion, visual timeline assembly, frame-accurate transforms and keyframes,
editable typography, deterministic FFmpeg rendering, multi-ratio sequences,
and delivery QA all work without a terminal after launch.

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
