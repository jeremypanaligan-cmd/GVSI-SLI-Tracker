# GVSI SLI Tracker — App Icon Set

Minimalist flat-vector icon: an **Electric Cyan fiber line** flowing from a
service source point up to an **Emerald Green target checkpoint node** with a
checkmark, signifying a completed/verified service line installation. Set on
a **Dark Slate Navy** field per GVSI NETPULSE branding.

- Background: `#0F172A`
- Primary Accent (fiber line / signal): `#00F2FE`
- Status / Target Accent (checkpoint node): `#10B981`

## Files

| File | Size | Purpose |
|---|---|---|
| `icon-512x512.png` | 512×512 | High-res display & PWA splash logo |
| `icon-192x192.png` | 192×192 | Standard mobile home screen icon |
| `apple-touch-icon-180x180.png` | 180×180 | iOS Safari home screen |
| `favicon-96x96.png` | 96×96 | Web favicon / push notification |
| `favicon-48x48.png` | 48×48 | Web favicon / push notification |
| `icon-512x512-maskable.png` | 512×512 | Maskable icon — safe zone padded for circle/squircle/teardrop crop |
| `favicon.ico` | 16/32/48 multi-res | Bonus — legacy browser tab icon |
| `icon-standard.svg` | vector | Editable source for all "any" purpose icons |
| `icon-maskable.svg` | vector | Editable source for the maskable icon |
| `manifest-icons-snippet.json` | — | Drop-in `icons` array for your `manifest.json` |

## Integration

**`manifest.json`** — merge in the `icons` array from
`manifest-icons-snippet.json`.

**HTML `<head>`** (favicon + iOS):
```html
<link rel="icon" href="/icons/favicon.ico" sizes="any">
<link rel="icon" href="/icons/favicon-96x96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png">
<meta name="theme-color" content="#0F172A">
```

## Notes on the maskable icon

The maskable artwork is scaled and centered so all critical shapes sit
inside the ~80%-diameter safe-zone circle (per the W3C/Android adaptive
icon spec), so it survives being cropped to a circle, squircle, or
teardrop without clipping the line or the checkpoint node. This was
verified by simulating both a full circle mask and a squircle mask over
the artwork.

The two `.svg` source files are fully editable if you need to retune
colors, proportions, or produce additional sizes later.
