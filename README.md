# Hints Reel Composer

A local-first workspace for assembling and finishing short-form video from existing media. It provides a visual timeline editor, a validated project recipe, FFmpeg rendering, and render quality and provenance records.

## Project status

This public snapshot is based on the `codex/hints-reel-composer-hardening` project branch. The originating workspace records version `0.1.0` as production-qualified after a headless qualification run. That historical result is part of the project record; it has not been rerun as part of this publication.

The application is designed for local operation. It binds to `127.0.0.1`, does not call media-generation providers, and does not expose arbitrary shell execution. It is an assembly and rendering tool; official Hints identity motion must be produced by the Hints brand workflow and imported as media.

## Features

- Timeline editing across 9:16, 16:9, 1:1, and 4:5 sequences
- Managed media import, recipe validation, and project-safe writes
- Text, audio, shape, and video layers with frame-based editing
- FFmpeg render presets, including review, delivery, WebM, GIF, WebP, and PNG sequence
- Headless CLI/API operations, durable render jobs, QA artifacts, and provenance bundles

See [`docs/HEADLESS_OPERATIONS.md`](docs/HEADLESS_OPERATIONS.md) and [`docs/PREVIEW_EXPORT_PARITY.md`](docs/PREVIEW_EXPORT_PARITY.md) for the operation contracts.

## Architecture

The React timeline edits a versioned Recipe through an Express API. Shared validation and render compilation feed a local FFmpeg job pipeline; project revisions prevent stale writes, render state is persisted locally, and QA/provenance artifacts are available through the same API. Preview communicates the editing state, while final FFmpeg output is authoritative for delivery.

## Requirements

- Node.js and npm
- FFmpeg and FFprobe for media rendering and inspection
- Hints canonical font assets supplied by the operator in the expected sibling `brand_canon/source/fonts/` directory; font files are not included in this repository

The repository does not include media projects, uploaded files, rendered outputs, or Hints brand source assets.

## Run locally

```bash
npm ci
npm run build
npm start
```

Then open `http://127.0.0.1:8090`. For frontend development, use `npm run dev`. The CLI is available through `npm run hrc -- <command>`; for example:

```bash
npm run hrc -- health --json
```

To store projects elsewhere, set `HINTS_REEL_PROJECTS_DIR` before starting the server. Generated projects, uploads, renders, and runtime data are local and should not be committed.

## Verification

Verified from a clean staging clone on 2026-10-16:

- `npm test`: 64 tests passed across 15 files.
- `npm run build`: passed; Vite reports canonical Hints font assets unresolved because those files are intentionally supplied outside this repository.
- `npm run test:headless`: passed with an isolated synthetic project, local server, render, QA, provenance, and restart checks.
- `npm run test:exports`: passed the keyframe render smoke and all eight export presets.

The dedicated production qualification and preview/export parity runners were not executed in this clone because they require official Hints identity/font assets that are not included. These checks are not claimed as passed.

## Limitations

The app uses operator-supplied canonical font assets. Browser and FFmpeg text rasterization can differ within the documented parity contract. No full production qualification result is claimed by this curation.

## License

No project license has been selected. Public visibility does not grant permission to reuse or redistribute this code; all rights remain reserved by the copyright holder unless a license is added.
