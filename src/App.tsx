
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Wallet, CalendarDays, Plus, Search, Download, Menu, X,
  ChevronRight, CheckCircle2, CircleAlert, ArrowLeft,
  FileSpreadsheet, RefreshCw
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { signInWithGitHub, signOut } from './lib/auth'

type Student = {
  id: string
  roll_number: string
  full_name: string
}

type EventRow = {
  id: string
  name: string
  event_date: string | null
  budget_pkr: number
}

type Contribution = {
  id: string
  event_id: string
  student_id: string
  expected_pkr: number
  paid_pkr: number
  paid_on: string | null
  payment_method: string | null
  collected_by: string | null
}

const today = new Date().toISOString().slice(0, 10)

const money = (value: number) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0
  }).format(value || 0)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [students, setStudents] = useState<Student[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showEvent, setShowEvent] = useState(false)
  const [showPayment, setShowPayment] = useState(false)

  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(today)
  const [target, setTarget] = useState('3000')
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [paymentDate, setPaymentDate] = useState(today)

  const current = events.find(e => e.id === selected) ?? null

  const loadData = useCallback(async () => {
    if (!supabase) return

    setBusy(true)
    setError('')

    try {
      const [studentResult, eventResult, contributionResult] =
        await Promise.all([
          supabase.from('students')
            .select('id,roll_number,full_name')
            .order('full_name'),
          supabase.from('events')
            .select('id,name,event_date,budget_pkr')
            .order('event_date'),
          supabase.from('event_contributions')
            .select('id,event_id,student_id,expected_pkr,paid_pkr,paid_on,payment_method,collected_by')
        ])

      if (studentResult.error) throw studentResult.error
      if (eventResult.error) throw eventResult.error
      if (contributionResult.error) throw contributionResult.error

      setStudents((studentResult.data ?? []) as Student[])
      setEvents((eventResult.data ?? []) as EventRow[])
      setContributions((contributionResult.data ?? []) as Contribution[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load database records.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    async function checkSession(next: Session | null) {
      if (!active) return
      setSession(next)
      setRole('')

      if (!next) {
        setLoading(false)
        return
      }

      const { data, error: profileError } = await supabase!
        .from('profiles')
        .select('role')
        .eq('id', next.user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        setError('Unable to verify your account role: ' + profileError.message)
      } else if (
        data?.role === 'finance_manager' ||
        data?.role === 'cr'
      ) {
        setRole(data.role)
      } else {
        setError('This GitHub account does not have an authorized profile.')
      }

      setLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message)
      void checkSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        void checkSession(next)
      }
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session && role) void loadData()
  }, [session, role, loadData])

  const rows = current
    ? students.map(student => ({
        student,
        contribution: contributions.find(c =>
          c.event_id === current.id && c.student_id === student.id
        )
      })).filter(row => {
        const c = row.contribution
        const paid = Boolean(c && Number(c.paid_pkr) > 0)
        const text = `${row.student.roll_number} ${row.student.full_name}`
          .toLowerCase()

        return text.includes(search.toLowerCase()) &&
          (filter === 'All' ||
           (filter === 'Paid' && paid) ||
           (filter === 'Unpaid' && !paid))
      })
    : []

  const eventContributions = current
    ? contributions.filter(c => c.event_id === current.id)
    : []

  const collected = eventContributions.reduce(
    (sum, c) => sum + Number(c.paid_pkr || 0), 0
  )

  const paidCount = eventContributions.filter(
    c => Number(c.paid_pkr) > 0
  ).length

  const unpaidCount = Math.max(0, students.length - paidCount)

  const allCollected = contributions.reduce(
    (sum, c) => sum + Number(c.paid_pkr || 0), 0
  )

  async function initializeRegister(event: EventRow) {
    if (!supabase || role !== 'finance_manager') return

    const existingIds = new Set(
      contributions
        .filter(c => c.event_id === event.id)
        .map(c => c.student_id)
    )

    const missing = students.filter(s => !existingIds.has(s.id))

    if (!missing.length) {
      setNotice('This event already has a register for every student.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const { error } = await supabase
        .from('event_contributions')
        .insert(missing.map(student => ({
          event_id: event.id,
          student_id: student.id,
          expected_pkr: Number(target) > 0
            ? Number(target)
            : Math.round(Number(event.budget_pkr || 0) /
                Math.max(students.length, 1)),
          paid_pkr: 0,
          paid_on: null,
          payment_method: null,
          collected_by: null
        })))

      if (error) throw error

      await loadData()
      setNotice(`Added ${missing.length} unpaid student entries.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not initialize register.')
    } finally {
      setBusy(false)
    }
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault()

    if (!supabase || role !== 'finance_manager') return
    if (!eventName.trim() || Number(target) <= 0) return

    if (!students.length) {
      setError('No students found. Add the student roster before creating an event.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('events')
        .insert({
          name: eventName.trim(),
          event_date: eventDate || null,
          budget_pkr: Number(target) * students.length
        })
        .select('id,name,event_date,budget_pkr')
        .single()

      if (error) throw error

      const newEvent = data as EventRow

      const { error: contributionError } = await supabase
        .from('event_contributions')
        .insert(students.map(student => ({
          event_id: newEvent.id,
          student_id: student.id,
          expected_pkr: Number(target),
          paid_pkr: 0,
          paid_on: null,
          payment_method: null,
          collected_by: null
        })))

      if (contributionError) {
        setNotice('Event was saved, but register creation failed. Open the event and retry register setup.')
        await loadData()
        setSelected(newEvent.id)
        setShowEvent(false)
        return
      }

      setEventName('')
      setShowEvent(false)
      await loadData()
      setSelected(newEvent.id)
      setSearch('')
      setFilter('All')
      setNotice('Event and unpaid student register saved to Supabase.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save event.')
    } finally {
      setBusy(false)
    }
  }

  async function savePayment(e: FormEvent) {
    e.preventDefault()

    if (!supabase || !session || role !== 'finance_manager') return

    const payment = contributions.find(c => c.id === paymentId)
    const received = Number(amount)

    if (!payment || !Number.isFinite(received) || received <= 0) {
      setError('Choose a student entry and enter a valid positive amount.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const { error } = await supabase
        .from('event_contributions')
        .update({
          paid_pkr: received,
          paid_on: paymentDate,
          payment_method: method,
          collected_by: session.user.id
        })
        .eq('id', payment.id)
        .eq('event_id', payment.event_id)

      if (error) throw error

      setShowPayment(false)
      setPaymentId('')
      setAmount('')
      await loadData()
      setNotice('Payment saved permanently to Supabase.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save payment.')
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    if (!current) return

    const data = [
      ['Event', current.name],
      ['Roll No', 'Student Name', 'Expected PKR', 'Paid PKR', 'Status', 'Date', 'Method'],
      ...students.map(student => {
        const c = contributions.find(item =>
          item.event_id === current.id && item.student_id === student.id
        )
        const paid = Number(c?.paid_pkr || 0)

        return [
          student.roll_number,
          student.full_name,
          String(c?.expected_pkr ?? 0),
          String(paid),
          paid > 0 ? 'Paid' : 'Unpaid',
          c?.paid_on ?? '',
          c?.payment_method ?? ''
        ]
      })
    ]

    const csv = data.map(row => row.map(value =>
      `"${String(value ?? '').replace(/"/g, '""')}"`
    ).join(',')).join('\r\n')

    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `mrj-${current.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="event-app" style={{ padding: 32 }}>Checking login…</div>
  }

  if (!supabase) {
    return <div className="event-app" style={{ padding: 32 }}>
      Supabase is not configured. Check GitHub Actions variables.
    </div>
  }

  if (!session || !role) {
    return <div className="event-app" style={{ padding: 32, textAlign: 'center' }}>
      <div className="ev-logo" style={{ margin: '0 auto 16px' }}><Wallet /></div>
      <h1>MrJ Treasury</h1>
      <p>Sign in with your authorized GitHub account.</p>
      {error && <p role="alert">{error}</p>}
      {!session
        ? <button className="ev-btn primary" onClick={() =>
            signInWithGitHub().catch(e =>
              setError(e instanceof Error ? e.message : 'Login failed.')
            )
          }>Continue with GitHub</button>
        : <button className="ev-btn secondary" onClick={() =>
            signOut().catch(e => setError(String(e)))
          }>Sign out</button>}
    </div>
  }

  return (
    <div className="event-app">
      <header className="ev-top">
        <button className="ev-iconbtn" onClick={() => setMenu(true)} aria-label="Open menu"><Menu /></button>
        <div className="ev-brand">
          <div className="ev-logo"><Wallet /></div>
          <div><b>MrJ Treasury</b><span>CLASS FINANCE PORTAL</span></div>
        </div>
        <button className="ev-btn secondary" onClick={() => signOut()}>Sign out</button>
      </header>

      {menu && <div className="ev-menu-back" onClick={() => setMenu(false)}>
        <nav className="ev-menu" onClick={e => e.stopPropagation()}>
          <button className="ev-close" onClick={() => setMenu(false)}><X /></button>
          <h2>MrJ Treasury</h2>
          <button onClick={() => { setSelected(null); setMenu(false) }}>Overview</button>
          <button onClick={() => { setSelected(null); setMenu(false) }}>Events & registers</button>
          <p>Signed in as {session.user.email || session.user.id}</p>
        </nav>
      </div>}

      <main className="ev-main">
        <div className="ev-warning">
          <CircleAlert size={18} />
          <span><b>LIVE DATABASE:</b> Events and payments are read from and saved to Supabase.</span>
        </div>

        {error && <div className="ev-notice" role="alert">{error}<button onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="ev-notice">{notice}<button onClick={() => setNotice('')}><X size={16} /></button></div>}

        <div className="ev-heading">
          <div>
            <div className="ev-kicker">CLASS FINANCE WORKSPACE</div>
            <h1>{current ? current.name : 'Event collection registers'}</h1>
            <p>{current ? `Event date: ${current.event_date || 'Not set'}` : 'Manage separate event registers and student payments.'}</p>
          </div>
          <div className="ev-head-actions">
            <button className="ev-btn secondary" onClick={() => void loadData()} disabled={busy}><RefreshCw size={16} /> Refresh</button>
            {!current && role === 'finance_manager' && <button className="ev-btn primary" onClick={() => setShowEvent(true)}><Plus size={17} /> Create event</button>}
          </div>
        </div>

        {!current ? <>
          <section className="ev-stats">
            <article><span>Total collected across events</span><b>{money(allCollected)}</b></article>
            <article><span>Students</span><b>{students.length}</b></article>
            <article><span>Events</span><b>{events.length}</b></article>
            <article><span>Role</span><b>{role === 'finance_manager' ? 'Finance Manager' : 'CR'}</b></article>
          </section>

          {!students.length && <div className="ev-warning">
            No students were found in the database. Add your roster in Supabase before creating an event.
          </div>}

          <div className="ev-section-title"><div><h2>Events from Supabase</h2><p>Each event has its own independent register.</p></div><FileSpreadsheet /></div>

          <div className="ev-event-grid">
            {events.map(event => {
              const items = contributions.filter(c => c.event_id === event.id)
              const total = items.reduce((sum, c) => sum + Number(c.paid_pkr || 0), 0)
              const paid = items.filter(c => Number(c.paid_pkr) > 0).length

              return <article className="ev-event-card" key={event.id}>
                <div className="ev-event-icon"><CalendarDays /></div>
                <span className="ev-chip">DATABASE REGISTER</span>
                <h3>{event.name}</h3>
                <p className="ev-event-date">{event.event_date || 'Date not set'}</p>
                <div className="ev-event-metrics">
                  <div><span>Collected</span><b>{money(total)}</b></div>
                  <div><span>Paid entries</span><b>{paid}</b></div>
                </div>
                <button className="ev-btn secondary full" onClick={() => { setSelected(event.id); setSearch(''); setFilter('All') }}>
                  Open collection sheet <ChevronRight size={16} />
                </button>
              </article>
            })}
          </div>
        </> : <>
          <button className="ev-back" onClick={() => setSelected(null)}><ArrowLeft size={16} /> All events</button>

          <section className="ev-stats three">
            <article><span>Total collected</span><b>{money(collected)}</b></article>
            <article><span>Paid entries</span><b>{paidCount} <small>/ {students.length}</small></b></article>
            <article><span>Unpaid entries</span><b>{unpaidCount}</b></article>
          </section>

          <section className="ev-register">
            <div className="ev-register-head">
              <div><h2>Student collection register</h2><p>Real student records · Payment values from Supabase</p></div>
              <div className="ev-tools">
                <label className="ev-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search roll no. or student" /></label>
                <select value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Paid</option><option>Unpaid</option></select>
              </div>
            </div>

            {role === 'finance_manager' && <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ev-btn secondary" onClick={() => void initializeRegister(current)} disabled={busy}><RefreshCw size={16} /> Add missing student entries</button>
              <button className="ev-btn secondary" onClick={exportCsv}><Download size={16} /> Export CSV</button>
              <button className="ev-btn primary" onClick={() => { setPaymentId(''); setAmount(''); setShowPayment(true) }}><Plus size={16} /> Record payment</button>
            </div>}

            <div className="ev-table-scroll">
              <table className="ev-table">
                <thead><tr><th>S</th><th>Roll No</th><th>Name</th><th>Expected</th><th>Paid</th><th>Date</th><th>Method</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{rows.map(({ student, contribution }, index) => {
                  const paid = Number(contribution?.paid_pkr || 0)

                  return <tr key={student.id}>
                    <td>{index + 1}</td>
                    <td>{student.roll_number}</td>
                    <td className="ev-student-name">{student.full_name}</td>
                    <td>{money(Number(contribution?.expected_pkr || 0))}</td>
                    <td className={paid > 0 ? 'ev-paid-amount' : 'ev-unpaid-amount'}>{money(paid)}</td>
                    <td>{contribution?.paid_on || '—'}</td>
                    <td>{contribution?.payment_method || '—'}</td>
                    <td><span className={`ev-status ${paid > 0 ? 'paid' : 'unpaid'}`}>{paid > 0 ? 'Paid' : 'Unpaid'}</span></td>
                    <td>{role === 'finance_manager' && contribution && <button className="ev-row-action" onClick={() => {
                      setPaymentId(contribution.id)
                      setAmount(String(paid || contribution.expected_pkr || ''))
                      setPaymentDate(today)
                      setMethod('Cash')
                      setShowPayment(true)
                    }}>Record</button>}</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
            {!eventContributions.length && <div style={{ padding: 16 }}>
              This event has no contribution entries yet. A finance manager can select “Add missing student entries”.
            </div>}
            <div className="ev-mobile-note">Swipe horizontally to view all columns.</div>
          </section>
        </>}

        <footer className="ev-footer">MrJ Treasury · Supabase database · PKR</footer>
      </main>

      {showEvent && <div className="ev-modal-back" onClick={() => setShowEvent(false)}>
        <section className="ev-modal" onClick={e => e.stopPropagation()}>
          <button className="ev-modal-x" onClick={() => setShowEvent(false)}><X /></button>
          <div className="ev-kicker">NEW DATABASE REGISTER</div>
          <h2>Create event</h2>
          <p>This creates a separate unpaid entry for each current student.</p>
          <form className="ev-form" onSubmit={createEvent}>
            <label>Event name<input value={eventName} onChange={e => setEventName(e.target.value)} required /></label>
            <label>Event date<input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required /></label>
            <label>Expected contribution per student (PKR)<input type="number" min="1" value={target} onChange={e => setTarget(e.target.value)} required /></label>
            <div className="ev-modal-actions">
              <button type="button" className="ev-btn secondary" onClick={() => setShowEvent(false)}>Cancel</button>
              <button className="ev-btn primary" type="submit" disabled={busy}><Plus size={16} /> Save event</button>
            </div>
          </form>
        </section>
      </div>}

      {showPayment && current && <div className="ev-modal-back" onClick={() => setShowPayment(false)}>
        <section className="ev-modal" onClick={e => e.stopPropagation()}>
          <button className="ev-modal-x" onClick={() => setShowPayment(false)}><X /></button>
          <div className="ev-kicker">{current.name}</div>
          <h2>Record payment</h2>
          <p>Only use this form for a payment you have actually received.</p>
          <form className="ev-form" onSubmit={savePayment}>
            <label>Student entry
              <select value={paymentId} onChange={e => setPaymentId(e.target.value)} required>
                <option value="">Select student</option>
                {students.map(student => {
                  const c = contributions.find(item => item.event_id === current.id && item.student_id === student.id)
                  if (!c) return null
                  return <option key={c.id} value={c.id}>{student.roll_number} — {student.full_name}</option>
                })}
              </select>
            </label>
            <label>Amount received (PKR)<input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
            <label>Payment method<select value={method} onChange={e => setMethod(e.target.value)}><option>Cash</option><option>Online</option><option>Bank transfer</option></select></label>
            <label>Payment date<input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required /></label>
            <div className="ev-modal-actions">
              <button type="button" className="ev-btn secondary" onClick={() => setShowPayment(false)}>Cancel</button>
              <button className="ev-btn primary" type="submit" disabled={busy}><CheckCircle2 size={16} /> Save payment</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  )
}
