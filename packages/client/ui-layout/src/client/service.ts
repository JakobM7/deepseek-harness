/**
 * LayoutController: cross-plugin panel actions behind ctx.layout. Ordinary
 * Details and generic auxiliary surfaces share the right column without
 * exposing AppFrame/store internals to feature plugins.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelSizingRequest } from './columns.ts'
import type { createLayoutStore } from './stores.ts'

export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

export interface AuxiliaryPanelOptions extends PanelSizingRequest {
  /** Stable owner id used so one feature cannot accidentally close another. */
  readonly id: string
}

export interface ILayout {
  toggleSidebar(): void
  openDetails(): void
  closeDetails(): void
  /** Open or replace the generic right-hand auxiliary surface. */
  openAuxiliary(options: AuxiliaryPanelOptions): void
  /** Close the auxiliary surface. Supplying an id only closes that owner. */
  closeAuxiliary(id?: string): void
}

export class LayoutController implements ILayout {
  #panels: PanelActions | undefined

  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  openDetails(): void {
    this.#require().openDetails()
  }

  closeDetails(): void {
    this.#require().closeDetails()
  }

  openAuxiliary(options: AuxiliaryPanelOptions): void {
    const { id, ...sizing } = options
    this.#require().openAuxiliary(id, sizing)
  }

  closeAuxiliary(id?: string): void {
    this.#require().closeAuxiliary(id)
  }

  #require(): PanelActions {
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
