import { useTheme } from '../../context/ThemeContext'

export default function ThemeSwitcher({ compact = false }) {
  const { theme, setTheme, themes } = useTheme()

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        background: 'var(--bg-card-deep)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={`${t.label} — ${t.desc}`}
            style={{
              border: 0,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: theme === t.id ? 'var(--bg-card)' : 'transparent',
              color: theme === t.id ? 'var(--text-primary)' : 'var(--text-faint)',
              boxShadow: theme === t.id ? 'var(--shadow-xs)' : 'none',
              transition: 'all var(--duration-fast) var(--ease)',
            }}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span>
            {t.label}
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
            padding: '10px 12px',
            border: `1px solid ${theme === t.id ? 'var(--accent)' : 'var(--border)'}`,
            background: theme === t.id ? 'var(--accent-soft)' : 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            color: theme === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 13,
            transition: 'all var(--duration-fast) var(--ease)',
          }}
        >
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{t.desc}</div>
          </div>
          {theme === t.id && <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}
