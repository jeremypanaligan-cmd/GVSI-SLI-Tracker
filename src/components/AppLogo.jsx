/**
 * Brand mark used across the app (headers, footer, login screen, install banner,
 * report header).
 *
 * The source paths live here so the artwork can be swapped or renamed in one place.
 * Sizing and rounding come from the caller via `className`.
 *
 * Two variants, both from the canonical PWA icon family:
 *   full — `public/icon-512.png` (generated from `public/icon-source.svg`): the app
 *          icon with its "SLI TRACKER" wordmark, for roomy placements (login
 *          screen, install banner, printed report) where it matches what users
 *          already see on their home screen.
 *   mark — `public/brand-mark.svg`: the same artwork with the wordmark removed and
 *          heavier strokes, for small placements (20–36px: header, navbar, footer)
 *          where the wordmark would only smudge.
 */
const LOGO_SRC = {
  full: `${import.meta.env.BASE_URL}icon-512.png`,
  mark: `${import.meta.env.BASE_URL}brand-mark.svg`,
}

export default function AppLogo({ variant = 'full', className = '', alt = '' }) {
  return (
    <img
      src={LOGO_SRC[variant] || LOGO_SRC.full}
      alt={alt}
      draggable={false}
      className={`object-cover shrink-0 ${className}`}
    />
  )
}
