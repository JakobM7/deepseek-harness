/**
 * Root transient layout store. Ordinary Details and temporary auxiliary
 * surfaces keep independent width preferences so opening Studio-like panels
 * does not destroy a user's normal Details width.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  AUXILIARY_PANEL_SIZING,
  clampWidth,
  DETAILS_DEFAULT,
  DETAILS_MAX,
  DETAILS_MIN,
  resolvePanelSizing,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  type PanelSizing,
  type PanelSizingRequest,
} from './columns.ts'

type AuxiliaryState = {
  activeId: string | null
  width: number
  sizing: PanelSizing
}

type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  auxiliary: AuxiliaryState
}

type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  setAuxiliary: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
  openAuxiliary: (draft: LayoutState, id: string, sizing?: PanelSizingRequest) => void
  closeAuxiliary: (draft: LayoutState, id?: string) => void
}

export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      narrow: false,
      narrowExpanded: false,
      auxiliary: { activeId: null, width: 0, sizing: AUXILIARY_PANEL_SIZING },
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      setAuxiliary: (d, px: number) => {
        const sizing = d.auxiliary.sizing
        d.auxiliary.width = clampWidth(px, sizing.minWidth, sizing.maxWidth)
      },
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      closeDetails: (d) => { d.details = 0 },
      openAuxiliary: (d, id: string, request?: PanelSizingRequest) => {
        const normalizedId = id.trim()
        if (!normalizedId) throw new Error('layout: auxiliary panel id must be non-empty')
        const sizing = resolvePanelSizing(request, AUXILIARY_PANEL_SIZING)
        const changedOwner = d.auxiliary.activeId !== normalizedId
        const changedSizing = d.auxiliary.sizing.preferredWidth !== sizing.preferredWidth
          || d.auxiliary.sizing.minWidth !== sizing.minWidth
          || d.auxiliary.sizing.maxWidth !== sizing.maxWidth
        d.auxiliary.activeId = normalizedId
        d.auxiliary.sizing = sizing
        if (d.auxiliary.width === 0 || changedOwner || changedSizing) d.auxiliary.width = sizing.preferredWidth
        else d.auxiliary.width = clampWidth(d.auxiliary.width, sizing.minWidth, sizing.maxWidth)
      },
      closeAuxiliary: (d, id?: string) => {
        if (id !== undefined && d.auxiliary.activeId !== id) return
        d.auxiliary.activeId = null
        d.auxiliary.width = 0
      },
    },
  })
  return handle
}
