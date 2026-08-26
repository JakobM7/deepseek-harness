// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import {
  AUXILIARY_PANEL_SIZING,
  DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

const PERSIST_KEY = 'dsh.layout.panels'
const initialAuxiliary = { activeId: null, width: 0, sizing: AUXILIARY_PANEL_SIZING }

beforeEach(() => { localStorage.clear() })

describe('createLayoutStore', () => {
  it('initializes ordinary panels and the auxiliary surface independently', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      narrow: false,
      narrowExpanded: false,
      auxiliary: initialAuxiliary,
    })
  })

  it('each create() is an independent instance', () => {
    const a = createLayoutStore().create()
    const b = createLayoutStore().create()
    a.actions.setSidebar(400)
    expect(b.store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('setSidebar/setDetails clamp into their legacy ranges', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MIN)
    actions.setSidebar(9999)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    actions.setDetails(1)
    expect(store.getSnapshot().details).toBe(DETAILS_MIN)
    actions.setDetails(9999)
    expect(store.getSnapshot().details).toBe(DETAILS_MAX)
  })

  it('toggleSidebar preserves the existing wide/narrow behavior', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: 400, narrow: true, narrowExpanded: true })
    actions.toggleSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: 400, narrowExpanded: false })
  })

  it('crossing the narrow breakpoint drops only the override', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(false)
    expect(store.getSnapshot()).toMatchObject({ narrow: false, narrowExpanded: false })
  })

  it('ordinary details keeps its own preference', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    actions.setDetails(500)
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(500)
    actions.closeDetails()
    expect(store.getSnapshot().details).toBe(0)
  })

  it('opens a named auxiliary owner with an independent wide sizing contract', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    actions.setDetails(500)
    actions.openAuxiliary('studio', { preferredWidth: 900, minWidth: 480, maxWidth: 1200 })
    expect(store.getSnapshot()).toMatchObject({
      details: 500,
      auxiliary: {
        activeId: 'studio',
        width: 900,
        sizing: { preferredWidth: 900, minWidth: 480, maxWidth: 1200 },
      },
    })
    actions.setAuxiliary(9999)
    expect(store.getSnapshot().auxiliary.width).toBe(1200)
    actions.setAuxiliary(1)
    expect(store.getSnapshot().auxiliary.width).toBe(480)
  })

  it('owner-scoped close cannot close another auxiliary panel and preserves details width', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    actions.setDetails(500)
    actions.openAuxiliary('studio', { preferredWidth: 840 })
    actions.closeAuxiliary('debugger')
    expect(store.getSnapshot().auxiliary.activeId).toBe('studio')
    actions.closeAuxiliary('studio')
    expect(store.getSnapshot().auxiliary).toMatchObject({ activeId: null, width: 0 })
    expect(store.getSnapshot().details).toBe(500)
  })

  it('does not persist panel geometry', () => {
    const first = createLayoutStore().create()
    first.actions.setSidebar(400)
    first.actions.openDetails()
    first.actions.openAuxiliary('studio')
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()

    const second = createLayoutStore().create()
    expect(second.store.getSnapshot()).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      narrow: false,
      narrowExpanded: false,
      auxiliary: initialAuxiliary,
    })
  })
})
