import { useState, useEffect, useCallback, useMemo } from 'react'
import { walletAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, Alert, Spinner, Button } from '../shared/UI'
import { fmtDate, fmtTime, fmtDateTime } from '../../utils/formatDate'

const TYPE_COLORS = { CREDIT: 'var(--success)', DEBIT: 'var(--danger)', LOAD: 'var(--accent)', REVERSAL: 'var(--warning)', REFUND: 'var(--purple)' }
const PER_PAGE = 15

// Finance treats PPI + internal-ledger transactions as one consolidated view
// (the internal ledger is just the local mirror of PPI events). Other roles
// continue to see the two-tab layout because they care about the distinction
// between system-side and PPI-side activity for their own wallet.
function normalisePpi(t) {
  return {
    id: 'ppi-' + (t.id || t.txn_ref_number || Math.random()),
    source: 'PPI',
    date: t.created_at,
    type: (t.transaction_type || 'UNKNOWN').toUpperCase(),
    description: t.merchant_name || t.transaction_type || '',
    mode: t.transaction_mode || '',
    amount: Number(t.amount || 0),
    reference: t.txn_ref_number || '',
    status: t.transaction_status || '',
    fee: Number(t.fee_amount || 0) + Number(t.gst_amount || 0),
  }
}
function normaliseLocal(t) {
  return {
    id: 'loc-' + (t.id || Math.random()),
    source: 'Internal',
    date: t.created_at,
    type: (t.txn_type || 'UNKNOWN').toUpperCase(),
    description: t.description || '',
    mode: t.category || '',
    amount: Number(t.amount || 0),
    reference: t.reference || '',
    status: 'SUCCESS',
    fee: 0,
  }
}

export default function TransactionsPage() {
  const { user } = useAuth()
  // Roles that see a single consolidated "PPI Wallet" view instead of the
  // PPI / Internal split. The internal ledger is just the local mirror of
  // PPI events, so every role that can reach this page (Employee / Finance /
  // Super Admin per role_pages) now gets the merged list. The two-tab path
  // is kept in code as a fallback in case a future role gets the page and
  // needs the split view.
  const useCombinedWallet = ['Employee', 'Finance', 'Super Admin'].includes(user?.role)
  const [ppiTxns,   setPpiTxns]   = useState([])
  const [localTxns, setLocalTxns] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  // Finance never switches tabs — pinned to a synthetic 'combined' view that
  // merges both datasets under the "PPI Wallet" label.
  const [tab,       setTab]       = useState(useCombinedWallet ? 'combined' : 'ppi')
  const [filter,    setFilter]    = useState('all')        // 'all' | 'CREDIT' | 'DEBIT' | 'LOAD' etc.
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('')
      const [ppi, local] = await Promise.all([
        walletAPI.ppiTransactions().catch(() => ({ data: [] })),
        walletAPI.transactions().catch(() => ({ data: [] })),
      ])
      setPpiTxns(ppi.data || [])
      setLocalTxns(local.data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [tab, filter, search])

  const accent = user.color || 'var(--accent)'

  // Combined dataset for Finance — both sources normalised into one shape and
  // sorted newest-first. Memoised so we don't re-sort on every keystroke in
  // the search box.
  const combinedTxns = useMemo(() => {
    if (!useCombinedWallet) return []
    return [...ppiTxns.map(normalisePpi), ...localTxns.map(normaliseLocal)]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [useCombinedWallet, ppiTxns, localTxns])

  // Current dataset based on tab. Finance always uses the combined view.
  const rawData = tab === 'combined' ? combinedTxns
                : tab === 'ppi'      ? ppiTxns
                                     : localTxns

  // Extract unique types for filter buttons
  const typeKeys = tab === 'combined'
    ? [...new Set(combinedTxns.map(t => t.type))]
    : tab === 'ppi'
      ? [...new Set(ppiTxns.map(t => t.transaction_type || 'UNKNOWN'))]
      : ['credit', 'debit']

  // Filter + search
  const filtered = rawData.filter(t => {
    const txnType = tab === 'combined' ? t.type
                  : tab === 'ppi'      ? (t.transaction_type || '')
                                       : t.txn_type
    if (filter !== 'all' && (txnType || '').toLowerCase() !== filter.toLowerCase()) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = tab === 'combined'
        ? `${t.reference || ''} ${t.type || ''} ${t.mode || ''} ${t.description || ''}`.toLowerCase()
        : tab === 'ppi'
          ? `${t.txn_ref_number || ''} ${t.transaction_type || ''} ${t.transaction_mode || ''} ${t.merchant_name || ''}`.toLowerCase()
          : `${t.description || ''} ${t.reference || ''} ${t.category || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  // Pagination
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // Stats
  const totalCredit = rawData.reduce((s, t) => {
    const type = (tab === 'combined' ? t.type
                : tab === 'ppi'      ? (t.transaction_type || '')
                                     : t.txn_type).toLowerCase()
    return s + (type === 'credit' || type === 'load' || type === 'refund' ? Number(t.amount || 0) : 0)
  }, 0)
  const totalDebit = rawData.reduce((s, t) => {
    const type = (tab === 'combined' ? t.type
                : tab === 'ppi'      ? (t.transaction_type || '')
                                     : t.txn_type).toLowerCase()
    return s + (type === 'debit' ? Number(t.amount || 0) : 0)
  }, 0)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle
        title="Transactions"
        sub={useCombinedWallet
          ? 'PPI wallet activity — system credits, allowances, and PPI events in one view'
          : 'Complete transaction history from PPI wallet and internal system'}
      />

      {error && <Alert type="error">{error}</Alert>}

      {/* Tab switcher — Finance sees a single PPI Wallet pill (no toggle), other
         roles get the existing PPI / Internal tabs. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(useCombinedWallet
          ? [{ id: 'combined', label: 'PPI Wallet', icon: '💳', count: combinedTxns.length }]
          : [
              { id: 'ppi', label: 'PPI Wallet', icon: '💳', count: ppiTxns.length },
              { id: 'internal', label: 'Internal Wallet', icon: '◉', count: localTxns.length },
            ]
        ).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 20px', borderRadius: 10, border: `1px solid ${tab === t.id ? `color-mix(in srgb, ${accent} 33%, transparent)` : 'var(--border)'}`,
            background: tab === t.id ? `color-mix(in srgb, ${accent} 9%, transparent)` : 'var(--bg-card)', color: tab === t.id ? 'var(--text-body)' : 'var(--text-dim)',
            cursor: useCombinedWallet ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{t.icon}</span> {t.label}
            <span style={{ fontSize: 10, background: tab === t.id ? `color-mix(in srgb, ${accent} 19%, transparent)` : 'var(--bg-input)', color: tab === t.id ? accent : 'var(--text-dim)', padding: '2px 8px', borderRadius: 10 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Total Transactions</div>
          <div className="syne" style={{ fontSize: 28, fontWeight: 800, color: accent }}>{rawData.length}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Total Credited</div>
          <div className="syne" style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-success)' }}>+{fmtDateTime(totalCredit)}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Total Debited</div>
          <div className="syne" style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-danger)' }}>-{fmtDateTime(totalDebit)}</div>
        </Card>
      </div>

      {/* Filters + Search */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Type filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setFilter('all')} style={{
              padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter === 'all' ? `color-mix(in srgb, ${accent} 33%, transparent)` : 'var(--border)'}`,
              background: filter === 'all' ? `color-mix(in srgb, ${accent} 13%, transparent)` : 'var(--bg-card)', color: filter === 'all' ? accent : 'var(--text-dim)',
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
            }}>All</button>
            {typeKeys.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter === t ? (TYPE_COLORS[t.toUpperCase()] || accent) + '55' : 'var(--border)'}`,
                background: filter === t ? (TYPE_COLORS[t.toUpperCase()] || accent) + '22' : 'var(--bg-card)',
                color: filter === t ? (TYPE_COLORS[t.toUpperCase()] || accent) : 'var(--text-dim)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
              }}>{t.toLowerCase()}</button>
            ))}
          </div>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by reference, description..."
              style={{
                width: '100%', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-body)', fontSize: 12, padding: '8px 12px', outline: 'none',
              }}
            />
          </div>
          <button onClick={load} style={{ background: 'none', border: `1px solid var(--border)`, borderRadius: 8, padding: '8px 12px', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11 }}>
            Refresh
          </button>
        </div>
      </Card>

      {/* Transaction table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {paged.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)', fontSize: 13 }}>
            {rawData.length === 0 ? 'No transaction history available' : 'No transactions match your filters'}
          </div>
        ) : tab === 'combined' ? (
          /* Combined PPI Wallet view (Finance) — both sources rendered through
             the same normalised row shape. The Source column lets auditors see
             which side a row came from without splitting the table back into
             two tabs. */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Description', 'Mode / Category', 'Type', 'Amount', 'Reference', 'Source', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: 'var(--border-strong)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((t, i) => {
                const color = TYPE_COLORS[t.type] || 'var(--text-faint)'
                const sourceColor = t.source === 'PPI' ? 'var(--accent)' : 'var(--purple)'
                return (
                  <tr key={t.id} style={{ borderBottom: i < paged.length - 1 ? '1px solid var(--bg-card)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)' }}>
                      {t.date ? fmtDate(t.date) : '-'}
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        {t.date ? fmtTime(t.date) : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-body)', maxWidth: 280 }}>
                      <div>{t.description || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>
                      {t.mode || '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: `color-mix(in srgb, ${color} 9%, transparent)`, color, fontWeight: 600, textTransform: 'uppercase' }}>
                        {t.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color }}>
                        {t.type === 'DEBIT' ? '-' : '+'}{fmtDateTime(t.amount)}
                      </span>
                      {t.fee > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>
                          fee ₹{fmtDateTime(t.fee)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {t.reference || '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `color-mix(in srgb, ${sourceColor} 9%, transparent)`, color: sourceColor, fontWeight: 600 }}>
                        {t.source}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: t.status.toUpperCase() === 'SUCCESS' ? 'color-mix(in srgb, var(--success) 9%, transparent)' : 'color-mix(in srgb, var(--warning) 9%, transparent)', color: t.status.toUpperCase() === 'SUCCESS' ? 'var(--success)' : 'var(--warning)' }}>
                        {t.status || '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : tab === 'ppi' ? (
          /* PPI Transactions Table */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Type', 'Mode', 'Amount', 'Fee', 'TXN Ref', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: 'var(--border-strong)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((t, i) => {
                const type = t.transaction_type || 'UNKNOWN'
                const color = TYPE_COLORS[type.toUpperCase()] || 'var(--text-faint)'
                const date = t.created_at
                const fee = Number(t.fee_amount || 0) + Number(t.gst_amount || 0)
                return (
                  <tr key={t.id || i} style={{ borderBottom: i < paged.length - 1 ? '1px solid var(--bg-card)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)' }}>
                      {date ? fmtDate(date) : '-'}
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        {date ? fmtTime(date) : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: `color-mix(in srgb, ${color} 9%, transparent)`, color, fontWeight: 600, textTransform: 'uppercase' }}>
                        {type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)' }}>
                      {t.transaction_mode || '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color }}>
                        {type.toLowerCase() === 'debit' ? '-' : '+'}{Number(t.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: fee > 0 ? 'var(--warning)' : 'var(--text-dim)' }}>
                      {fee > 0 ? `₹${fmtDateTime(fee)}` : '-'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{t.txn_ref_number || '-'}</div>
                      {t.merchant_name && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{t.merchant_name}</div>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (t.transaction_status || '').toUpperCase() === 'SUCCESS' ? 'color-mix(in srgb, var(--success) 9%, transparent)' : 'color-mix(in srgb, var(--warning) 9%, transparent)', color: (t.transaction_status || '').toUpperCase() === 'SUCCESS' ? 'var(--success)' : 'var(--warning)' }}>
                        {t.transaction_status || '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          /* Internal Transactions Table */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Description', 'Category', 'Type', 'Amount', 'Balance After'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, color: 'var(--border-strong)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((t, i) => {
                const catIcons = { travel: '✈️', hotel: '🏨', allowance: '🎯', credit: '💳', other: '📋' }
                return (
                  <tr key={t.id || i} style={{ borderBottom: i < paged.length - 1 ? '1px solid var(--bg-card)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)' }}>
                      {fmtDate(t.created_at)}
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        {fmtTime(t.created_at)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-body)', maxWidth: 240 }}>
                      <div>{t.description}</div>
                      {t.reference && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>Ref: {t.reference}</div>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13 }}>{catIcons[t.category] || '📋'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 6, textTransform: 'capitalize' }}>{t.category}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: t.txn_type === 'credit' ? 'color-mix(in srgb, var(--success) 9%, transparent)' : 'color-mix(in srgb, var(--danger) 9%, transparent)', color: t.txn_type === 'credit' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {t.txn_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: t.txn_type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                        {t.txn_type === 'credit' ? '+' : '-'}{Number(t.amount).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-faint)' }}>{Number(t.balance_after).toLocaleString('en-IN')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: page === 1 ? 'var(--text-dim)' : 'var(--text-faint)', cursor: page === 1 ? 'default' : 'pointer', fontSize: 12 }}>
            Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p
            if (totalPages <= 7) p = i + 1
            else if (page <= 4) p = i + 1
            else if (page >= totalPages - 3) p = totalPages - 6 + i
            else p = page - 3 + i
            return (
              <button key={p} onClick={() => setPage(p)} style={{
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${page === p ? `color-mix(in srgb, ${accent} 33%, transparent)` : 'var(--border)'}`,
                background: page === p ? `color-mix(in srgb, ${accent} 13%, transparent)` : 'var(--bg-card)', color: page === p ? accent : 'var(--text-dim)',
                cursor: 'pointer', fontSize: 12, fontWeight: page === p ? 700 : 400,
              }}>{p}</button>
            )
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: page === totalPages ? 'var(--text-dim)' : 'var(--text-faint)', cursor: page === totalPages ? 'default' : 'pointer', fontSize: 12 }}>
            Next
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>
            Page {page} of {totalPages} ({filtered.length} transactions)
          </span>
        </div>
      )}
    </div>
  )
}
