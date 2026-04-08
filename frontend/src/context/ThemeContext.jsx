import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'td3_theme'

export const THEMES = [
  { id: 'neon',  label: 'Neon Glow',       icon: '⚡', desc: 'Electric blue + purple' },
  { id: 'royal', label: 'Royal Gradient',  icon: '👑', desc: 'Gold and royal purple' },
  { id: 'glass', label: 'Glassmorphism',   icon: '✦',  desc: 'Frosted glass aqua' },
]

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && THEMES.some(t => t.id === saved)) return saved
    return 'neon'
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
