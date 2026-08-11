# Preview to Export Parity Contract

The React preview is an operator interface. FFmpeg final render is the delivery
authority. Both consume the same HRC Recipe v1, but browser and FFmpeg font
rasterizers cannot promise pixel-identical typography.

## Contract States

| State | Meaning |
| --- | --- |
| `EXACT_PARITY_REQUIRED` | Recipe semantics, timing, and geometry must agree at the selected frame. |
| `BOUNDED_VISUAL_PARITY` | Semantic layout agrees; bounded glyph/font-metric differences are allowed. |
| `EXPORT_AUTHORITATIVE` | The final FFmpeg pixels decide delivery truth. |
| `UNSUPPORTED_REMOVE_FROM_UI` | V1 must not expose the control. |

## V1 Matrix

| Surface | State | Enforced behavior |
| --- | --- | --- |
| Timing, ordering, visibility | `EXACT_PARITY_REQUIRED` | One timeline clock and shared track activation. |
| Position, scale, rotation, opacity | `EXACT_PARITY_REQUIRED` | One transform and keyframe model. |
| Trim and playback rate | `EXACT_PARITY_REQUIRED` | Preview seeks source time; export trims the managed source. |
| Visual/audio fades | `EXACT_PARITY_REQUIRED` | Clip-local fade timing in both engines. |
| LTR and Arabic/RTL text | `BOUNDED_VISUAL_PARITY` | Explicit line breaks, direction, shaping, alignment, line height, and transforms. |
| Text tracking | `UNSUPPORTED_REMOVE_FROM_UI` | Recipe requires `letterSpacing: 0`; the Inspector has no tracking control. |
| Typography rasterization | `EXPORT_AUTHORITATIVE` | Final FFmpeg antialiasing and glyph pixels govern delivery. |
| Signal/shape | `EXACT_PARITY_REQUIRED` | Geometry, color, transforms, fades, and opacity; no preview-only glow. |
| Audio track state | `EXACT_PARITY_REQUIRED` | Mute, solo, gain, fades, and optional normalization are compiler truth. |

Multiline text uses explicit newline characters only. Preview auto-wrap is
disabled because it cannot be reproduced deterministically by FFmpeg drawtext.

## Verification

```bash
npm run build
npm run test:parity
```

The parity runner uses only the installed local stack: Chrome Headless captures
the React preview, FFmpeg renders the same Recipe, and ImageMagick compares
selected frames at `9:16` and `16:9`. The fixtures cover media transforms and
trim, fades, keyframes, mixed RTL/LTR text, multiline text, signal geometry,
hidden/muted/solo state, and disabled clips. A normalized whole-frame RMSE of
`0.24` is the maximum guardrail; semantic contract tests remain stricter than
that broad raster tolerance.
