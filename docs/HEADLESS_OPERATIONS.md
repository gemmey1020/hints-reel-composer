# Hints Reel Composer Headless Operations

## Operating Boundary

The Composer is a local, provider-neutral assembly and render engine. The
headless path calls the same Express API, Recipe validator, render compiler,
FFmpeg pipeline, QA layer, and project store used by the GUI. It does not call
generation providers, expose arbitrary shell execution, publish, deploy, or
rebuild official Hints identity motion.

Start the local Composer, then invoke the CLI from this directory:

```bash
npm start
npm run hrc -- health --json
```

The default endpoint is `http://127.0.0.1:8090`. Override it with `--url` or
`HRC_URL`. Add `--json` to any command for one-line machine-readable output.

## Command Surface

```bash
npm run hrc -- create --title "Reel title" --json
npm run hrc -- projects --json
npm run hrc -- get --project PROJECT_ID --json
npm run hrc -- import --project PROJECT_ID --file /absolute/source.mp4 --json
npm run hrc -- validate --file /absolute/project.hints-reel.json --json
npm run hrc -- recipe apply --project PROJECT_ID --file /absolute/project.hints-reel.json --json
npm run hrc -- recipe export --project PROJECT_ID --out /absolute/copy.hints-reel.json --json
npm run hrc -- render --project PROJECT_ID --sequence SEQUENCE_ID --preset review --wait --json
npm run hrc -- status --job JOB_ID --json
npm run hrc -- cancel --job JOB_ID --json
npm run hrc -- retry --job JOB_ID --json
npm run hrc -- qa --job JOB_ID --json
npm run hrc -- output --job JOB_ID --out /absolute/review.mp4 --json
npm run hrc -- provenance --job JOB_ID --out /absolute/provenance.zip --json
```

Supported presets are `draft`, `review`, `delivery`, `archive`, `webm`, `gif`,
`webp`, and `png`.

## API Surface

- `GET /api/v1/health`
- `GET/POST /api/v1/projects`
- `GET/PUT /api/v1/projects/:projectId`
- `POST /api/v1/validate`
- `POST /api/v1/projects/:projectId/import-recipe`
- `GET /api/v1/projects/:projectId/export-recipe`
- `POST /api/v1/assets/import`
- `POST /api/v1/assets/:assetId/proxy`
- `POST/GET /api/v1/renders`
- `GET /api/v1/renders/:jobId`
- `GET /api/v1/renders/:jobId/events`
- `DELETE /api/v1/renders/:jobId`
- `POST /api/v1/renders/:jobId/retry`
- `GET/POST /api/v1/renders/:jobId/qa`
- `GET /api/v1/renders/:jobId/output`
- `GET /api/v1/renders/:jobId/provenance`

SSE remains available for the GUI, but polling `GET /api/v1/renders/:jobId`
is the stable agent path.

## Reliability Contract

- Render concurrency defaults to one and is capped at four.
- Public job state is atomically persisted under
  `reel_projects/.render-jobs/`.
- Any queued or active state found after restart becomes `failed` with
  `failureKind=INTERRUPTED`; it never masquerades as running.
- Retry is explicit, never automatic, and defaults to one retry after the
  original attempt.
- Terminal state records are retained for 90 days or 500 jobs, whichever
  boundary is reached first. Retention removes job-state records only; project
  outputs and QA artifacts remain untouched.
- Project writes use optimistic revisions plus per-project serialization.
  Stale writers receive HTTP `409` instead of overwriting newer work.
- Video preview proxies are derived 540p caches bound to the source SHA-256.
  Preview falls back to source when proxy metadata is missing or stale. Final
  rendering always resolves the managed source asset.

## Provenance Bundle

Every successful render exposes a ZIP containing the available Recipe snapshot,
render manifest, filter graph, FFmpeg log, QA report, and contact sheet. The
render job state records both output and provenance retrieval endpoints.

## Local Verification

```bash
npm test
npm run build
npm run test:headless
npm run test:exports
```

`test:headless` creates an isolated project, ingests local generated media,
applies a Recipe, renders, reads QA, downloads output/provenance, restarts the
server, and proves the terminal job state survives. `test:exports` freshly
encodes and inspects all eight presets in an isolated project.
