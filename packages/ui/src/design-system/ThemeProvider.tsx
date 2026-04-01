import React, { createContext, useContext, useMemo, useState } from 'react'

export type ThemeName = 'dark' | 'light'
export type ThemeSetting = ThemeName | 'auto'

export type Theme = {
  text: string
  dimText: string
  border: string
  accent: string
  success: string
  warning: string
  error: string
  assistant: string
  inactive: string
  inverseText: string
  permission: string
}

const themes: Record<ThemeName, Theme> = {
  dark: {
    text: '#E0E0E0',
    dimText: '#666666',
    border: '#444444',
    accent: '#5B9BD5',
    success: '#6BC76B',
    warning: '#E5C07B',
    error: '#E06C75',
    assistant: '#DA7756',
    inactive: '#666666',
    inverseText: '#1E1E1E',
    permission: '#5B9BD5',
  },
  light: {
    text: '#1E1E1E',
    dimText: '#999999',
    border: '#CCCCCC',
    accent: '#0066CC',
    success: '#2E7D32',
    warning: '#F57C00',
    error: '#C62828',
    assistant: '#DA7756',
    inactive: '#999999',
    inverseText: '#FFFFFF',
    permission: '#0066CC',
  },
}

export function getTheme(name: ThemeName): Theme {
  return themes[name] ?? themes.dark
}

type ThemeContextValue = {
  themeSetting: ThemeSetting
  setThemeSetting: (setting: ThemeSetting) => void
  setPreviewTheme: (setting: ThemeSetting) => void
  savePreview: () => void
  cancelPreview: () => void
  currentTheme: ThemeName
}

const DEFAULT_THEME: ThemeName = 'dark'

const ThemeContext = createContext<ThemeContextValue>({
  themeSetting: DEFAULT_THEME,
  setThemeSetting: () => {},
  setPreviewTheme: () => {},
  savePreview: () => {},
  cancelPreview: () => {},
  currentTheme: DEFAULT_THEME,
})

type Props = {
  children: React.ReactNode
  initialState?: ThemeSetting
  onThemeSave?: (setting: ThemeSetting) => void
}

export function ThemeProvider({
  children,
  initialState = 'dark',
  onThemeSave,
}: Props) {
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(initialState)
  const [previewTheme, setPreviewTheme] = useState<ThemeSetting | null>(null)

  const activeSetting = previewTheme ?? themeSetting
  const currentTheme: ThemeName =
    activeSetting === 'auto' ? 'dark' : activeSetting

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeSetting,
      setThemeSetting: (newSetting: ThemeSetting) => {
        setThemeSetting(newSetting)
        setPreviewTheme(null)
        onThemeSave?.(newSetting)
      },
      setPreviewTheme: (newSetting: ThemeSetting) => {
        setPreviewTheme(newSetting)
      },
      savePreview: () => {
        if (previewTheme !== null) {
          setThemeSetting(previewTheme)
          setPreviewTheme(null)
          onThemeSave?.(previewTheme)
        }
      },
      cancelPreview: () => {
        if (previewTheme !== null) {
          setPreviewTheme(null)
        }
      },
      currentTheme,
    }),
    [themeSetting, previewTheme, currentTheme, onThemeSave],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): [ThemeName, (setting: ThemeSetting) => void] {
  const { currentTheme, setThemeSetting } = useContext(ThemeContext)
  return [currentTheme, setThemeSetting]
}

export function useThemeSetting(): ThemeSetting {
  return useContext(ThemeContext).themeSetting
}

export function usePreviewTheme() {
  const { setPreviewTheme, savePreview, cancelPreview } =
    useContext(ThemeContext)
  return { setPreviewTheme, savePreview, cancelPreview }
}
