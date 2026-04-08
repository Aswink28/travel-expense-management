import { useTheme } from '../../context/ThemeContext'

export default function ThemeSwitcher({ compact = false }) {
  const { theme, setTheme, themes } = useTheme()

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        gap: 4,
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 4,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}>
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={`${t.label} — ${t.desc}`}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 7,
              padding: '7px 4px',
              fontSize: 14,
              cursor: 'pointer',
              background: theme === t.id ? 'var(--accent-grad)' : 'transparent',
              color: theme === t.id ? '#fff' : 'var(--text-faint)',
              boxShadow: theme === t.id ? 'var(--accent-glow)' : 'none',
              transition: 'all .25s ease',
            }}
          >
            {t.icon}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {themes.map(t => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            border: `1px solid ${theme === t.id ? 'var(--accent)' : 'var(--border)'}`,
            background: theme === t.id ? 'var(--bg-input)' : 'transparent',
            borderRadius: 10,
            cursor: 'pointer',
            color: theme === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 12,
            transition: 'all .25s ease',
            boxShadow: theme === t.id ? 'var(--accent-glow)' : 'none',
          }}
        >
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{t.desc}</div>
          </div>
          {theme === t.id && <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓</span>}
        </button>
      ))}
    </div>
  )
}
