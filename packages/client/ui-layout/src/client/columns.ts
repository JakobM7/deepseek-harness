/**
 * Pure concession-chain solver for the three-column AppFrame. The right-hand
 * column can be owned either by the ordinary Details panel or by a temporary
 * auxiliary surface. Sizing is data, not feature-specific conditionals.
 */

export interface Columns { sidebar: number; center: number; details: number }

export interface PanelSizing {
  readonly preferredWidth: number
  readonly minWidth: number
  readonly maxWidth: number
}

export type PanelSizingRequest = Partial<PanelSizing>

export const CENTER_MIN = 640
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_COLLAPSED = 56
export const SIDEBAR_AUTO_COLLAPSE = 1024
export const DETAILS_MIN = 300
export const DETAILS_MAX = 520
export const DETAILS_DEFAULT = 360

/** Hard safety rails for extension-provided auxiliary sizing requests. */
export const AUXILIARY_ABSOLUTE_MIN = 280
export const AUXILIARY_ABSOLUTE_MAX = 1600

export const DETAILS_PANEL_SIZING: PanelSizing = {
  preferredWidth: DETAILS_DEFAULT,
  minWidth: DETAILS_MIN,
  maxWidth: DETAILS_MAX,
}

export const AUXILIARY_PANEL_SIZING: PanelSizing = {
  preferredWidth: 820,
  minWidth: 500,
  maxWidth: 1200,
}

export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

export function resolvePanelSizing(
  request: PanelSizingRequest | undefined,
  fallback: PanelSizing = DETAILS_PANEL_SIZING,
): PanelSizing {
  const requestedMin = Number.isFinite(request?.minWidth) ? request?.minWidth ?? fallback.minWidth : fallback.minWidth
  const requestedMax = Number.isFinite(request?.maxWidth) ? request?.maxWidth ?? fallback.maxWidth : fallback.maxWidth
  const minWidth = clampWidth(requestedMin, AUXILIARY_ABSOLUTE_MIN, AUXILIARY_ABSOLUTE_MAX)
  const maxWidth = clampWidth(Math.max(requestedMax, minWidth), minWidth, AUXILIARY_ABSOLUTE_MAX)
  const requestedPreferred = Number.isFinite(request?.preferredWidth)
    ? request?.preferredWidth ?? fallback.preferredWidth
    : fallback.preferredWidth
  return {
    minWidth,
    maxWidth,
    preferredWidth: clampWidth(requestedPreferred, minWidth, maxWidth),
  }
}

export function samePanelSizing(a: PanelSizing, b: PanelSizing): boolean {
  return a.preferredWidth === b.preferredWidth && a.minWidth === b.minWidth && a.maxWidth === b.maxWidth
}

/**
 * Solve the frame widths. `details` is the active right-column width
 * preference (0 = no right-hand surface). `detailsSizing` describes whichever
 * surface currently owns that column, so the normal Details panel keeps its
 * historical 300–520 contract while a generic auxiliary panel may request a
 * wider range.
 */
export function computeColumns(
  viewport: number,
  sidebar: number,
  details: number,
  detailsSizing: PanelSizing = DETAILS_PANEL_SIZING,
): Columns {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const sizing = resolvePanelSizing(detailsSizing, DETAILS_PANEL_SIZING)
  const d0 = details === 0 ? 0 : clampWidth(details, sizing.minWidth, sizing.maxWidth)

  if (s + d0 + CENTER_MIN <= viewport) return { sidebar: s, center: viewport - s - d0, details: d0 }

  const d1 = d0 === 0 ? 0 : Math.max(sizing.minWidth, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 }

  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}
