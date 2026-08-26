import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN,
  computeColumns,
  resolvePanelSizing,
  SIDEBAR_DEFAULT,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

describe('generic auxiliary panel sizing', () => {
  it('keeps ordinary details defaults separate from a wide requested surface', () => {
    const sizing = resolvePanelSizing({ preferredWidth: 900, minWidth: 500, maxWidth: 1200 })
    expect(computeColumns(1920, SIDEBAR_DEFAULT, 900, sizing))
      .toEqual({ sidebar: 280, center: 740, details: 900 })
  })

  it('concedes a wide auxiliary surface toward its own minimum before closing it', () => {
    const sizing = resolvePanelSizing({ preferredWidth: 900, minWidth: 500, maxWidth: 1200 })
    expect(computeColumns(1500, SIDEBAR_DEFAULT, 900, sizing))
      .toEqual({ sidebar: 280, center: CENTER_MIN, details: 580 })
    expect(computeColumns(1419, SIDEBAR_DEFAULT, 900, sizing))
      .toEqual({ sidebar: 280, center: 1139, details: 0 })
  })

  it('clamps untrusted extension sizing into shell safety rails', () => {
    expect(resolvePanelSizing({ preferredWidth: 9999, minWidth: 1, maxWidth: 9999 }))
      .toEqual({ preferredWidth: 1600, minWidth: 280, maxWidth: 1600 })
  })
})
