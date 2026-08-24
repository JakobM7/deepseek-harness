// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope, type StubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocaleSettings, LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import { FALLBACK_LOCALE, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'

const make = (host?: StubSettingsScope<LocaleSettings>): {
  ctx: Context
  svc: LocaleRuntime
  events: LocaleSnapshot[]
} => {
  const ctx = new Context()
  const events: LocaleSnapshot[] = []
  ctx.on('locale/change', (snapshot) => { events.push(snapshot) })
  return { ctx, svc: new LocaleRuntime(ctx, host?.scope), events }
}

describe('LocaleRuntime', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('opens in English regardless of browser language', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' })
    expect(make().svc.getLocale().active).toBe('en')
    expect(FALLBACK_LOCALE).toBe('en')
  })

  it('translates through the English dictionary and exposes missing keys', () => {
    const { svc } = make()
    svc.register('ns', 'en', { hello: 'Hello', onlyEn: 'English only' })
    const t = svc.bind('ns')
    expect(t('hello')).toBe('Hello')
    expect(t('onlyEn')).toBe('English only')
    expect(t('missing.key')).toBe('missing.key')
  })

  it('falls through to the common vocabulary after the namespace misses', () => {
    const { svc } = make()
    svc.register('common', 'en', { retry: 'Retry' })
    svc.register('ns', 'en', { own: 'Own' })
    const t = svc.bind('ns')
    expect(t('retry')).toBe('Retry')
    expect(t('own')).toBe('Own')
    expect(svc.bind('common' as string)('nope')).toBe('nope')
  })

  it('interpolates parameters and leaves unknown placeholders intact', () => {
    const { svc } = make()
    svc.register('ns', 'en', { greet: 'Hello, {name}! Attempt {n}', partial: '{known} and {unknown}' })
    const t = svc.bind('ns')
    expect(t('greet', { name: 'World', n: 2 })).toBe('Hello, World! Attempt 2')
    expect(t('partial', { known: 'A' })).toBe('A and {unknown}')
  })

  it('returns a stable function per namespace', () => {
    const { svc } = make()
    expect(svc.bind('a')).toBe(svc.bind('a'))
    expect(svc.bind('a')).not.toBe(svc.bind('b'))
  })

  it('rejects duplicate English dictionaries and disposes only its own registration', () => {
    const { svc } = make()
    const dispose = svc.register('ns', 'en', { k: 'v1' })
    expect(() => svc.register('ns', 'en', { k: 'v2' })).toThrow('already has locale')
    dispose()
    expect(svc.bind('ns')('k')).toBe('k')
    svc.register('ns', 'en', { k: 'v2' })
    expect(svc.bind('ns')('k')).toBe('v2')
    dispose()
    expect(svc.bind('ns')('k')).toBe('v2')
  })

  it('publishes registration revisions and isolates a throwing subscriber', () => {
    const { svc } = make()
    const seen: number[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const off = svc.subscribe(() => { throw new Error('boom') })
    svc.subscribe(() => { seen.push(svc.getSnapshot().revision) })
    svc.register('ns', 'en', { k: 'v' })
    expect(seen).toEqual([1])
    expect(spy).toHaveBeenCalledOnce()
    off()
    spy.mockRestore()
  })

  it('republishes when a dictionary is disposed and keeps the disposer idempotent', () => {
    const { svc } = make()
    const dispose = svc.register('ns', 'en', { k: 'v' })
    const before = svc.getSnapshot().revision
    dispose()
    expect(svc.getSnapshot().revision).toBe(before + 1)
    dispose()
    expect(svc.getSnapshot().revision).toBe(before + 1)
  })

  it('writes an explicit English preference without republishing an unchanged locale', () => {
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    svc.setLocale('en')
    expect(svc.getLocale().active).toBe('en')
    expect(host.set).toHaveBeenCalledWith('preference', 'en')
    expect(events).toHaveLength(0)
    svc.setLocale('en')
    expect(host.set).toHaveBeenCalledTimes(2)
  })

  it('adopts an English Host preference without writing it back', () => {
    const host = stubSettingsScope<LocaleSettings>()
    const { svc, events } = make(host)
    host.publish({ status: 'ready', value: { preference: 'en' }, revision: 1, writable: true })
    expect(svc.getLocale().active).toBe('en')
    expect(events).toHaveLength(0)
    expect(host.set).not.toHaveBeenCalled()
  })

  it('runs outside a browser and rejects unknown locale ids', () => {
    vi.stubGlobal('window', undefined)
    const { svc } = make()
    expect(svc.getLocale().active).toBe('en')
    expect(() => svc.setLocale('fr')).toThrow('not registered')
  })

  it('exposes one shipped locale with its self-described label', () => {
    expect(make().svc.getLocale().locales).toEqual([{ id: 'en', label: 'English' }])
  })
})
