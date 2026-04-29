import { useTheme } from '../../context/ThemeContext'

export default function ThemeSwitcher({ compact = false }) {
  const { theme, setTheme, themes } = useTheme()

  if (compact) {
    return (
      <div className="theme-switch" role="tablist" aria-label="Theme">
        {themes.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={theme === t.id}
            onClick={() => setTheme(t.id)}
            title={`${t.label} — ${t.desc}`}
            className={`theme-switch-btn${theme === t.id ? ' active' : ''}`}
          >
            <span className="theme-switch-btn-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="theme-stack" role="radiogroup" aria-label="Theme">
      {themes.map(t => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => setTheme(t.id)}
          className={`theme-stack-btn${theme === t.id ? ' active' : ''}`}
        >
          <span className="theme-stack-icon">{t.icon}</span>
          <span className="theme-stack-main">
            <span className="theme-stack-label">{t.label}</span>
            <span className="theme-stack-desc">{t.desc}</span>
          </span>
          {theme === t.id && <span className="theme-stack-check">✓</span>}
        </button>
      ))}
    </div>
  )
}
