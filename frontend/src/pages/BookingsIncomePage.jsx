import React, { useState } from 'react'
import { incomingBookings, income, incomeSummary, setBookingStatus } from '../api/bookings'
import { parseApiError } from '../api/client'
import { useAsync } from '../lib/useAsync'
import CategoryArt from '../components/CategoryArt'
import { formatMonth, formatRand, formatDate, displayName, initials } from '../lib/format'

const STATUS_LABEL = { Confirmed: 'Confirmed', Pending: 'Pending', Completed: 'Completed', Cancelled: 'Cancelled' }
const STATUS_DOT = { Confirmed: '●', Pending: '●', Completed: '●', Cancelled: '○' }

function statusClass(s) {
    const map = { Confirmed: 'confirmed', Pending: 'pending', Completed: 'completed', Cancelled: 'cancelled' }
    return map[s] || s?.toLowerCase() || ''
}

function centsToRand(cents) {
    return (cents || 0) / 100
}

export default function BookingsIncomePage() {
    const [tab, setTab] = useState('bookings')

    return (
        <main className="page-content">
            <h1 className="page-title">Bookings &amp; income</h1>
            <p className="page-subtitle">Track your earnings, manage client bookings and view your income history.</p>

            <div className="tabs">
                <button className={`tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>Bookings</button>
                <button className={`tab ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>Income</button>
                <button className={`tab ${tab === 'tax' ? 'active' : ''}`} onClick={() => setTab('tax')}>Tax estimate</button>
            </div>

            {tab === 'bookings' && <IncomingTab />}
            {tab === 'transactions' && <IncomeTab />}
            {tab === 'tax' && <TaxTab />}
        </main>
    )
}

function IncomingTab() {
    const [page, setPage] = useState(1)
    const list = useAsync(() => incomingBookings({ page, limit: 8 }), [page])
    const [pendingId, setPendingId] = useState(null)
    const [actionError, setActionError] = useState('')

    const rows = list.data?.data || []
    const meta = list.data?.meta

    async function markComplete(booking) {
        setPendingId(booking.id)
        setActionError('')
        try {
            await setBookingStatus(booking.id, 'Completed')
            list.reload()
        } catch (err) {
            setActionError(parseApiError(err).message)
        } finally {
            setPendingId(null)
        }
    }

    return (
        <div className="income-layout">
            <div className="table-card" style={{ marginTop: 0 }}>
                <h3 className="table-heading">Incoming bookings</h3>
                {actionError && <p className="error-msg" style={{ marginBottom: 8 }}>{actionError}</p>}
                {list.error ? (
                    <p className="error-msg">Failed to load bookings: {list.error.message}</p>
                ) : list.loading && !list.data ? (
                    <p className="loading-msg">Loading…</p>
                ) : rows.length === 0 ? (
                    <p className="text-muted" style={{ padding: '24px 0' }}>No bookings yet. When a client books one of your gigs it will show up here.</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Gig</th><th>Client</th><th>Amount</th><th>Status</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {rows.map(b => {
                                const open = ['Pending', 'Confirmed'].includes(b.status)
                                return (
                                    <tr key={b.id}>
                                        <td>
                                            <div className="table-gig-cell">
                                                <div className="table-gig-icon">
                                                    <CategoryArt category={b.gig?.category} className="table-cat-img" />
                                                </div>
                                                <div>
                                                    <p className="table-gig-title">{b.gig?.title || 'Removed gig'}</p>
                                                    <p className="table-gig-cat">{formatDate(b.createdAt)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="table-user-cell">
                                                <div className="avatar-sm">{initials(b.client?.name)}</div>
                                                <span>{displayName(b.client?.name)}</span>
                                            </div>
                                        </td>
                                        <td className="text-gold">{formatRand(b.transaction?.amount ?? b.gig?.rate)}</td>
                                        <td>
                                            <span className={`status-badge ${statusClass(b.status)}`}>
                                                {STATUS_DOT[b.status] || '●'} {STATUS_LABEL[b.status] || b.status}
                                            </span>
                                        </td>
                                        <td>
                                            {open
                                                ? <button className="btn-table-action" disabled={pendingId === b.id} onClick={() => markComplete(b)}>Mark complete</button>
                                                : <span className="text-muted">—</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
                {meta && (
                    <div className="pagination">
                        <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                        <span className="pagination-info">Page {page} of {meta.totalPages || 1}</span>
                        <button className="page-btn" disabled={page >= (meta.totalPages || 1)} onClick={() => setPage(p => p + 1)}>›</button>
                    </div>
                )}
            </div>
        </div>
    )
}

function IncomeTab() {
    const { data, error, loading, reload } = useAsync(() => income(), [])

    if (error) return <p className="error-msg">Failed to load income: {error.message} <button className="btn-ghost" onClick={reload}>Retry</button></p>
    if (loading && !data) return <p className="loading-msg">Loading…</p>

    const d = data?.data || {}
    const byMonth = d.byMonth || []
    const recent = d.recent || []

    return (
        <>
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-icon gold">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFC400" strokeWidth="1.8">
                            <circle cx="8" cy="8" r="5" />
                            <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
                            <path d="M7 6h1v4" />
                            <path d="m16.71 13.88.7.71-2.82 2.82" />
                        </svg>
                    </div>
                    <div>
                        <p className="stat-label">Total earnings</p>
                        <p className="stat-value">{formatRand(d.totalEarned)}</p>
                        <p className="stat-sub">All time</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#19E58A" strokeWidth="1.8">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>
                    <div>
                        <p className="stat-label">Completed</p>
                        <p className="stat-value">{d.completedCount ?? 0}</p>
                        <p className="stat-sub">All time</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon purple">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <div>
                        <p className="stat-label">Pending</p>
                        <p className="stat-value">{d.pendingCount ?? 0}</p>
                        <p className="stat-sub">In progress</p>
                    </div>
                </div>
            </div>

            <div className="income-layout">
                <div className="table-card" style={{ marginTop: 0 }}>
                    <h3 className="table-heading">By month</h3>
                    {byMonth.length === 0 ? (
                        <p className="text-muted" style={{ padding: '16px 0' }}>No income data yet.</p>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr><th>Month</th><th>Bookings</th><th>Earned</th></tr>
                            </thead>
                            <tbody>
                                {byMonth.map(m => (
                                    <tr key={m.month}>
                                        <td>{formatMonth(m.month)}</td>
                                        <td>{m.count}</td>
                                        <td className="text-gold">{formatRand(m.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="table-card" style={{ marginTop: 0 }}>
                    <h3 className="table-heading">Recent transactions</h3>
                    {recent.length === 0 ? (
                        <p className="text-muted" style={{ padding: '16px 0' }}>No transactions yet.</p>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr><th>Gig</th><th>Client</th><th>Amount</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {recent.map(t => (
                                    <tr key={t.id}>
                                        <td>
                                            <div className="table-gig-cell">
                                                <div className="table-gig-icon">
                                                    <CategoryArt category={t.gig?.category} className="table-cat-img" />
                                                </div>
                                                <div>
                                                    <p className="table-gig-title">{t.gig?.title || 'Removed gig'}</p>
                                                    <p className="table-gig-cat">{t.gig?.category}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="table-user-cell">
                                                <div className="avatar-sm">{initials(t.client?.name)}</div>
                                                <span>{displayName(t.client?.name)}</span>
                                            </div>
                                        </td>
                                        <td className="text-gold">{formatRand(t.amount)}</td>
                                        <td>
                                            <span className={`status-badge ${statusClass(t.status)}`}>
                                                {STATUS_DOT[t.status] || '●'} {STATUS_LABEL[t.status] || t.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    )
}

function TaxTab() {
    const { data, error, loading, reload } = useAsync(() => incomeSummary(), [])

    if (error) return <p className="error-msg">Failed to load tax estimate: {error.message} <button className="btn-ghost" onClick={reload}>Retry</button></p>
    if (loading && !data) return <p className="loading-msg">Loading…</p>

    const summary = data?.summary || []

    if (summary.length === 0) {
        return (
            <div className="table-card" style={{ marginTop: 0 }}>
                <p className="text-muted" style={{ padding: '24px 0' }}>No completed transactions yet. Tax estimates will appear once you have completed bookings.</p>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="table-card" style={{ marginTop: 0 }}>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 0 }}>
                    Estimates based on SARS 2026/27 individual income tax tables. This is an indication only — consult a tax professional for official advice.
                </p>
            </div>
            {summary.map(yr => (
                <TaxYearCard key={yr.taxYear} yr={yr} />
            ))}
        </div>
    )
}

function TaxYearCard({ yr }) {
    const te = yr.taxEstimate
    const prov = te.provisionalTax

    const gross = centsToRand(yr.grossIncomeCents)
    const fee = centsToRand(yr.platformFeeCents)
    const net = centsToRand(yr.netIncomeCents)
    const annualNet = centsToRand(yr.annualNetIncomeCents)
    const taxBefore = centsToRand(te.taxBeforeRebateCents)
    const rebate = centsToRand(te.rebateCents)
    const annualPayable = centsToRand(te.annualTaxPayableCents)
    const proratedTax = centsToRand(te.proratedTaxCents)
    const first = centsToRand(prov.firstPaymentCents)
    const second = centsToRand(prov.secondPaymentCents)

    const taxPct = annualNet > 0 ? (annualPayable / annualNet) * 100 : 0
    const feePct = gross > 0 ? (fee / gross) * 100 : 0
    const keepPct = Math.max(0, 100 - taxPct - feePct)

    return (
        <div className="table-card" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                <div>
                    <h3 className="table-heading" style={{ marginBottom: 2 }}>Tax year {yr.taxYear}</h3>
                    <p className="text-muted" style={{ fontSize: 13 }}>
                        {yr.taxYearPeriod.start} → {yr.taxYearPeriod.end} · {yr.transactionCount} completed transaction{yr.transactionCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p className="stat-label">Effective rate</p>
                    <p className="stat-value" style={{ fontSize: 22 }}>{te.effectiveRatePct}</p>
                    <p className="text-muted" style={{ fontSize: 12 }}>Marginal: {te.marginalRatePct}</p>
                </div>
            </div>

            <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ width: `${keepPct}%`, background: '#19E58A' }} />
                    <div style={{ width: `${taxPct}%`, background: '#F87171' }} />
                    <div style={{ width: `${feePct}%`, background: '#FFC400' }} />
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: '#19E58A' }}>■ You keep ({keepPct.toFixed(1)}%)</span>
                    <span style={{ color: '#F87171' }}>■ Est. tax ({taxPct.toFixed(1)}%)</span>
                    <span style={{ color: '#FFC400' }}>■ Platform fee ({feePct.toFixed(1)}%)</span>
                </div>
            </div>

            <table className="data-table" style={{ marginBottom: 20 }}>
                <thead>
                    <tr><th>Income breakdown</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Gross income (completed transactions)</td>
                        <td className="text-gold" style={{ textAlign: 'right' }}>{formatRand(gross)}</td>
                    </tr>
                    <tr>
                        <td>Platform fee ({(yr.platformFeeRateBps / 100).toFixed(0)}%)</td>
                        <td style={{ textAlign: 'right', color: '#F87171' }}>−{formatRand(fee)}</td>
                    </tr>
                    <tr>
                        <td><strong>Net income (YTD)</strong></td>
                        <td style={{ textAlign: 'right' }}><strong>{formatRand(net)}</strong></td>
                    </tr>
                    {yr.annualNetIncomeCents !== yr.netIncomeCents && (
                        <tr>
                            <td style={{ color: '#A78BFA' }}>Projected annual net income</td>
                            <td style={{ textAlign: 'right', color: '#A78BFA' }}>{formatRand(annualNet)}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <table className="data-table" style={{ marginBottom: 20 }}>
                <thead>
                    <tr><th>Tax calculation (SARS 2026/27)</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Tax before rebate</td>
                        <td style={{ textAlign: 'right' }}>{formatRand(taxBefore)}</td>
                    </tr>
                    <tr>
                        <td>Primary rebate</td>
                        <td style={{ textAlign: 'right', color: '#19E58A' }}>−{formatRand(rebate)}</td>
                    </tr>
                    <tr>
                        <td><strong>Estimated annual tax payable</strong></td>
                        <td style={{ textAlign: 'right' }}><strong className="text-gold">{formatRand(annualPayable)}</strong></td>
                    </tr>
                    {te.proratedTaxCents !== te.annualTaxPayableCents && (
                        <tr>
                            <td style={{ color: '#A78BFA' }}>Pro-rated to {yr.taxYearPeriod.ytdDays} days elapsed</td>
                            <td style={{ textAlign: 'right', color: '#A78BFA' }}>{formatRand(proratedTax)}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div style={{ background: 'rgba(255,196,0,0.07)', border: '1px solid rgba(255,196,0,0.2)', borderRadius: 8, padding: '16px 20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#FFC400' }}>Provisional tax (IRP6)</h4>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                    As a freelancer you are a provisional taxpayer. You pay in two instalments per year.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div>
                        <p className="stat-label">1st payment (due {prov.dates.firstDeadline})</p>
                        <p className="stat-value" style={{ fontSize: 20 }}>{formatRand(first)}</p>
                    </div>
                    <div>
                        <p className="stat-label">2nd payment (due {prov.dates.secondDeadline})</p>
                        <p className="stat-value" style={{ fontSize: 20 }}>{formatRand(second)}</p>
                    </div>
                    <div>
                        <p className="stat-label">Voluntary top-up deadline</p>
                        <p style={{ fontSize: 14, marginTop: 4 }}>{prov.dates.topUpDeadline}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}