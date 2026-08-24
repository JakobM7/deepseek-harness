/** `settings.locale` namespace dictionaries (the Language row's copy). */

/** The settings.locale namespace key union. */
/** English dictionary. */
export const en = {
  'language.title': 'Language',
} satisfies Record<string, string>

/** The settings.locale namespace key union. */
export type SettingsLocaleKey = keyof typeof en
