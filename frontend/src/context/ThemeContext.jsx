import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'td3_theme'

// Three themes. Migration: any saved value not in this list (e.g. legacy
// "neon" / "royal" / "glass") falls back to "dark" so existing sessions
// don't show an empty UI.
export const THEMES = [
  { id: 'dark',    label: 'Dark',    icon: '◐', desc: 'Deep neutral, vibrant violet accent' },
  { id: 'light',   label: 'Light',   icon: '◑', desc: 'Clean, crisp white surfaces' },
  { id: 'neutral', label: 'Neutral', icon: '◍', desc: 'Soft warm professional — easy on the eyes' },
]

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && THEMES.some(t => t.id === saved)) return saved
    return 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function setTheme(id) {
    if (THEMES.some(t => t.id === id)) setThemeState(id)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
