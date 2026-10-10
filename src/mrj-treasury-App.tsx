import { useEffect, useMemo, useState, type FormEvent, type CSSProperties } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'

type Profile = { id: string; full_name: string; role: 'pending' | 'finance_manager' | 'cr' }
type Transaction = { id: string; kind: 'contribution' | 'expense' | 'refund'; amount_pkr: number; description: string; occurred_on: string; reference: string; created_at: string }
type Student = { id: string; roll_no: string; full_name: string; is_active: boolean }
type EventRow = { id: string; title: string; event_date: string | null; budget_pkr: number; status: string }
type Task = { id: string; title: string; assignee: string; due_date: string | null; status: string }

const money = (amount: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount || 0)
const today = () => new Date().toISOString().slice(0, 10)
const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f3f6fa', color: '#172338', fontFamily: 'Arial, sans-serif', padding: 16 },
  wrap: { maxWidth: 1100, margin: '0 auto' },
  header: { background: '#101d32', color: 'white', padding: '20px', borderRadius: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  card: { background: 'white', border: '1px solid #e1e7ef', borderRadius: 14, padding: 16, boxShadow: '0 4px 16px #13233a0a' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, margin: '16px 0' },
  input: { width: '100%', boxSizing: 'border-box', padding: 11, borderRadius: 9, border: '1px solid #cbd5e1', marginTop: 5, marginBottom: 10, fontSize: 15 },
  button: { background: '#167653', color: 'white', border: 0, borderRadius: 9, padding: '11px 14px', fontWeight: 700, cursor: 'pointer' },
  secondary: { background: '#e8eef5', color: '#172338', border: 0, borderRadius: 9, padding: '10px 13px', fontWeight: 700, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  thtd: { textAlign: 'left' as const, padding: '10px 8px', borderBottom: '1px solid #e7ecf2' },
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState('Overview')
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<Transaction['kind']>('contribution')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setProfile(null) })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function load() {
      if (!supabase || !session?.user) return
      setLoading(true)
      const [p, t, s, e, task] = await Promise.all([
        supabase.from('profiles').select('id,full_name,role').eq('id', session.user.id).maybeSingle(),
        supabase.from('transactions').select('id,kind,amount_pkr,description,occurred_on,reference,created_at').order('occurred_on', { ascending: false }).limit(200),
        supabase.from('students').select('id,roll_no,full_name,is_active').order('roll_no'),
        supabase.from('events').select('id,title,event_date,budget_pkr,status').order('event_date', { ascending: true }),
        supabase.from('committee_tasks').select('id,title,assignee,due_date,status').order('due_date', { ascending: true }),
      ])
      if (p.data) setProfile(p.data as Profile)
      setTransactions((t.data || []) as Transaction[]); setStudents((s.data || []) as Student[]); setEvents((e.data || []) as EventRow[]); setTasks((task.data || []) as Task[])
      const errors = [p.error, t.error, s.error, e.error, task.error].filter(Boolean)
      if (errors.length) setNotice('Some data could not load. Check that the Supabase schema and permissions are configured.')
      setLoading(false)
    }
    void load()
  }, [session])

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.kind === 'contribution').reduce((sum, t) => sum + Number(t.amount_pkr), 0)
    const refunds = transactions.filter(t => t.kind === 'refund').reduce((sum, t) => sum + Number(t.amount_pkr), 0)
    const expenses = transactions.filter(t => t.kind === 'expense').reduce((sum, t) => sum + Number(t.amount_pkr), 0)
    return { income, refunds, expenses, balance: income + refunds - expenses }
  }, [transactions])

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setNotice(error ? error.message : 'Signed in successfully.'); setBusy(false)
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setSession(null); setProfile(null) }
  async function addTransaction(event: FormEvent) {
    event.preventDefault(); if (!supabase || !session?.user) return
    const numericAmount = Number(amount)
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) { setNotice('Enter a description and an amount greater than zero.'); return }
    setBusy(true); setNotice('')
    const { error } = await supabase.from('transactions').insert({ kind, amount_pkr: numericAmount, description: description.trim(), reference: reference.trim(), occurred_on: date, created_by: session.user.id })
    if (error) setNotice(error.message)
    else { setNotice('Transaction saved.'); setAmount(''); setDescription(''); setReference(''); setShowForm(false); const { data } = await supabase.from('transactions').select('id,kind,amount_pkr,description,occurred_on,reference,created_at').order('occurred_on', { ascending: false }).limit(200); setTransactions((data || []) as Transaction[]) }
    setBusy(false)
  }
  function exportCsv() {
    const rows = [['Date', 'Type', 'Description', 'Amount PKR', 'Reference'], ...filteredTransactions.map(t => [t.occurred_on, t.kind, t.description, String(t.amount_pkr), t.reference || ''])]
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = 'mrj-treasury-transactions.csv'; link.click(); URL.revokeObjectURL(url)
  }
  const filteredTransactions = transactions.filter(t => `${t.description} ${t.kind} ${t.reference}`.toLowerCase().includes(search.toLowerCase()))

  if (!isSupabaseConfigured) return <div style={styles.page}><div style={{ ...styles.wrap, maxWidth: 650 }}><header style={styles.header}><div><div style={{ fontSize: 12, color: '#a8c8bd', letterSpacing: 2 }}>CLASS FINANCE PORTAL</div><h1 style={{ margin: '8px 0' }}>MrJ Treasury</h1><div>Simple, organized class finance management</div></div></header><section style={{ ...styles.card, marginTop: 16 }}><h2>Setup needed</h2><p>The website is ready, but it is not connected to Supabase yet. Add your Supabase project URL and publishable key as GitHub Actions repository variables, then redeploy.</p><p><b>Do not enter real financial data until the database and access policies are configured.</b></p></section></div></div>
  if (loading) return <div style={styles.page}>Loading MrJ Treasury…</div>
  if (!session) return <div style={styles.page}><div style={{ ...styles.wrap, maxWidth: 460 }}><header style={styles.header}><div><div style={{ fontSize: 12, color: '#a8c8bd', letterSpacing: 2 }}>CLASS FINANCE PORTAL</div><h1 style={{ margin: '8px 0' }}>MrJ Treasury</h1><div>Secure finance dashboard for Finance Manager and CR</div></div></header><form onSubmit={signIn} style={{ ...styles.card, marginTop: 16 }}><h2>Sign in</h2><label>Email<input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label><button style={{ ...styles.button, width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{notice && <p>{notice}</p>}<p style={{ color: '#637188', fontSize: 13 }}>Accounts are created and invited by the project administrator.</p></form></div></div>

  const isManager = profile?.role === 'finance_manager'
  const isMember = isManager || profile?.role === 'cr'
  return <div style={styles.page}><div style={styles.wrap}>
    <header style={styles.header}><div><div style={{ fontSize: 12, color: '#a8c8bd', letterSpacing: 2 }}>CLASS FINANCE PORTAL</div><h1 style={{ margin: '8px 0' }}>MrJ Treasury</h1><div>Welcome, {profile?.full_name || session.user.email}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span style={{ background: '#243650', borderRadius: 20, padding: '8px 12px', fontSize: 13 }}>{profile?.role === 'finance_manager' ? 'Finance Manager' : profile?.role === 'cr' ? 'Class Representative' : 'Access pending'}</span><button style={styles.secondary} onClick={signOut}>Sign out</button></div></header>
    {notice && <div style={{ ...styles.card, marginTop: 12, borderColor: '#e9c46a' }}>{notice}<button style={{ ...styles.secondary, marginLeft: 8 }} onClick={() => setNotice('')}>Dismiss</button></div>}
    {!isMember && <section style={{ ...styles.card, marginTop: 16 }}><h2>Access pending</h2><p>Your account has not been assigned the Finance Manager or CR role yet. Ask the project owner to assign your role in Supabase.</p></section>}
    {isMember && <>
      <nav style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0' }}>{['Overview', 'Transactions', 'Students', 'Events', 'Committee'].map(item => <button key={item} style={tab === item ? styles.button : styles.secondary} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {tab === 'Overview' && <><div style={styles.grid}>{[{ label: 'Available balance', value: money(totals.balance), color: '#13734f' }, { label: 'Contributions', value: money(totals.income), color: '#245fc4' }, { label: 'Expenses', value: money(totals.expenses), color: '#b54747' }, { label: 'Students', value: String(students.filter(s => s.is_active).length), color: '#6747a8' }].map(c => <div style={styles.card} key={c.label}><div style={{ color: '#66758b', fontSize: 13 }}>{c.label}</div><div style={{ fontSize: 25, fontWeight: 800, color: c.color, marginTop: 9 }}>{c.value}</div></div>)}</div><div style={styles.grid}><section style={styles.card}><h3>Recent transactions</h3>{transactions.slice(0, 5).length ? transactions.slice(0, 5).map(t => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid #edf0f5' }}><div><b>{t.description}</b><div style={{ color: '#68758a', fontSize: 12 }}>{t.occurred_on} · {t.kind}</div></div><b>{money(Number(t.amount_pkr))}</b></div>) : <p>No transactions recorded yet.</p>}</section><section style={styles.card}><h3>Upcoming events</h3>{events.slice(0, 5).map(e => <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #edf0f5' }}><b>{e.title}</b><div style={{ color: '#68758a', fontSize: 13 }}>{e.event_date || 'Date not set'} · Budget {money(Number(e.budget_pkr))}</div></div>)}{!events.length && <p>No events added yet.</p>}<h3 style={{ marginTop: 20 }}>Committee tasks</h3><p>{tasks.filter(t => t.status !== 'done').length} tasks remaining</p></section></div></>}
      {tab === 'Transactions' && <section style={styles.card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h2>Transactions</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button style={styles.secondary} onClick={exportCsv}>Export CSV</button>{isManager && <button style={styles.button} onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ Add transaction'}</button>}</div></div>{showForm && <form onSubmit={addTransaction} style={{ background: '#f5f8fb', padding: 14, borderRadius: 12, marginBottom: 16 }}><label>Type<select style={styles.input} value={kind} onChange={e => setKind(e.target.value as Transaction['kind'])}><option value="contribution">Contribution / income</option><option value="expense">Expense</option><option value="refund">Refund</option></select></label><label>Amount (PKR)<input style={styles.input} type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} required /></label><label>Description<input style={styles.input} value={description} onChange={e => setDescription(e.target.value)} required /></label><label>Date<input style={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} required /></label><label>Reference / receipt number<input style={styles.input} value={reference} onChange={e => setReference(e.target.value)} /></label><button style={styles.button} disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</button></form>}<input style={styles.input} placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)} /><div style={{ overflowX: 'auto' }}><table style={styles.table}><thead><tr>{['Date', 'Type', 'Description', 'Reference', 'Amount'].map(x => <th key={x} style={styles.thtd}>{x}</th>)}</tr></thead><tbody>{filteredTransactions.map(t => <tr key={t.id}><td style={styles.thtd}>{t.occurred_on}</td><td style={styles.thtd}>{t.kind}</td><td style={styles.thtd}>{t.description}</td><td style={styles.thtd}>{t.reference || '—'}</td><td style={styles.thtd}>{money(Number(t.amount_pkr))}</td></tr>)}</tbody></table></div>{!filteredTransactions.length && <p>No matching transactions.</p>}</section>}
      {tab === 'Students' && <section style={styles.card}><h2>Students</h2><p>Active students: {students.filter(s => s.is_active).length}</p><div style={{ overflowX: 'auto' }}><table style={styles.table}><thead><tr><th style={styles.thtd}>Roll number</th><th style={styles.thtd}>Name</th><th style={styles.thtd}>Status</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td style={styles.thtd}>{s.roll_no}</td><td style={styles.thtd}>{s.full_name}</td><td style={styles.thtd}>{s.is_active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div><p style={{ color: '#68758a' }}>Student creation can be added after the basic deployment and database are verified.</p></section>}
      {tab === 'Events' && <section style={styles.card}><h2>Events & budgets</h2><div style={{ overflowX: 'auto' }}><table style={styles.table}><thead><tr><th style={styles.thtd}>Event</th><th style={styles.thtd}>Date</th><th style={styles.thtd}>Budget</th><th style={styles.thtd}>Status</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td style={styles.thtd}>{e.title}</td><td style={styles.thtd}>{e.event_date || '—'}</td><td style={styles.thtd}>{money(Number(e.budget_pkr))}</td><td style={styles.thtd}>{e.status}</td></tr>)}</tbody></table></div><p style={{ color: '#68758a' }}>Event creation will be added after the basic deployment and database are verified.</p></section>}
      {tab === 'Committee' && <section style={styles.card}><h2>Committee coordination</h2>{tasks.map(t => <div key={t.id} style={{ padding: '12px 0', borderBottom: '1px solid #edf0f5' }}><b>{t.title}</b><div style={{ color: '#68758a', fontSize: 13 }}>{t.assignee || 'Unassigned'} · Due {t.due_date || 'not set'} · {t.status}</div></div>)}{!tasks.length && <p>No committee tasks recorded.</p>}</section>}
    </>}
    <footer style={{ color: '#738096', fontSize: 12, textAlign: 'center', padding: 20 }}>MrJ Treasury · PKR · Keep regular backups and reconcile with actual cash/bank records.</footer>
  </div></div>
}
