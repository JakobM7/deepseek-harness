import { describe, expect, it, vi } from 'vitest'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'
import type { PanelActions } from '@deepseek-ai/dsh-client-ui-layout/src/client/service.ts'

function fakePanels(): PanelActions {
  return {
    setSidebar: vi.fn(),
    setDetails: vi.fn(),
    setAuxiliary: vi.fn(),
    toggleSidebar: vi.fn(),
    setNarrow: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    openAuxiliary: vi.fn(),
    closeAuxiliary: vi.fn(),
  }
}

describe('LayoutController', () => {
  it('forwards ordinary panel actions', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)
    service.toggleSidebar()
    service.openDetails()
    service.closeDetails()
    expect(panels.toggleSidebar).toHaveBeenCalledOnce()
    expect(panels.openDetails).toHaveBeenCalledOnce()
    expect(panels.closeDetails).toHaveBeenCalledOnce()
  })

  it('forwards a generic auxiliary sizing request and owner-scoped close', () => {
    const service = new LayoutController()
    const panels = fakePanels()
    service.attachPanels(panels)
    service.openAuxiliary({ id: 'graph-editor', preferredWidth: 860, minWidth: 500, maxWidth: 1200 })
    expect(panels.openAuxiliary).toHaveBeenCalledWith('graph-editor', {
      preferredWidth: 860,
      minWidth: 500,
      maxWidth: 1200,
    })
    service.closeAuxiliary('graph-editor')
    expect(panels.closeAuxiliary).toHaveBeenCalledWith('graph-editor')
  })

  it('fails loud before the root entry wired its actions', () => {
    const service = new LayoutController()
    expect(() => { service.toggleSidebar() }).toThrow(/panel actions not wired/)
    expect(() => { service.openDetails() }).toThrow(/panel actions not wired/)
    expect(() => { service.openAuxiliary({ id: 'x' }) }).toThrow(/panel actions not wired/)
  })

  it('re-attach overwrites a stale action set', () => {
    const service = new LayoutController()
    const stale = fakePanels()
    const fresh = fakePanels()
    service.attachPanels(stale)
    service.attachPanels(fresh)
    service.openAuxiliary({ id: 'fresh' })
    expect(stale.openAuxiliary).not.toHaveBeenCalled()
    expect(fresh.openAuxiliary).toHaveBeenCalledOnce()
  })
})
