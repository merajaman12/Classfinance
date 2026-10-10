import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, CircleDollarSign, ClipboardList, Download, FileText, LayoutDashboard, LogOut, Plus, Receipt, Search, ShieldCheck, Users, Wallet, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Role = 'pending' | 'finance_manager' | 'cr'
type Profile = { id: string; full_name: string; role: Role }
type Student = { id: string; roll_no: string; full_name: string; is_active: boolean }
type EventRow = { id: string; title: string; event_date: string | null; budget_pkr: number; status: string; notes: string }
type Tx = { id: string; kind: 'contribution' | 'expense' | 'refund'; amount_pkr: number; description: string; occurred_on: string; reference: string; student_id: string | null; event_id: string | null; created_at: string; created_by: string }
type Task = { id: string; title: string; assignee: string; due_date: string | null; status: 'todo' | 'in_progress' | 'done'; event_id: string | null; notes: string }
type Notice = { id: string; title: string; body: string; read_at: string | null; created_at: string; target_user_id: string | null }
type Audit = { id: number; table_name: string; record_id: string; action: string; occurred_at: string; actor_id: string | null }
type Tab = 'Overview' | 'Transactions' | 'Students' | 'Events' | 'Committee' | 'Audit log' | 'Notifications'
const tabs: { label: Tab; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'Transactions', icon: Receipt }, { label: 'Students', icon: Users },
  { label: 'Events', icon: CalendarDays }, { label: 'Committee', icon: ClipboardList }, { label: 'Audit log', icon: ShieldCheck }, { label: 'Notifications', icon: Bell },
]
const pkr = (n: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(Number(n || 0))
const dateFmt = (s?: string | null) => s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'
const dateTimeFmt = (s: string) => new Date(s).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const errorText = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message || e)

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Overview')
  const [students, setStudents] = useState<Student[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'transaction' | 'student' | 'event' | 'task' | 'notice' | null>(null)
  const [busy, setBusy] = useState(false)
  const isManager = profile?.role === 'finance_manager'
  const isMember = profile?.role === 'finance_manager' || profile?.role === 'cr'

  const loadData = useCallback(async () => {
    if (!supabase || !session?.user?.id) return
    setError('')
    const results = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').eq('id', session.user.id).maybeSingle(),
      supabase.from('students').select('id,roll_no,full_name,is_active').order('roll_no'),
      supabase.from('events').select('id,title,event_date,budget_pkr,status,notes').order('event_date', { ascending: false }),
      supabase.from('transactions').select('id,kind,amount_pkr,description,occurred_on,reference,student_id,event_id,created_at,created_by').order('occurred_on', { ascending: false }).limit(500),
      supabase.from('committee_tasks').select('id,title,assignee,due_date,status,event_id,notes').order('due_date', { ascending: true }),
      supabase.from('notifications').select('id,title,body,read_at,created_at,target_user_id').order('created_at', { ascending: false }).limit(100),
      supabase.from('audit_logs').select('id,table_name,record_id,action,occurred_at,actor_id').order('occurred_at', { ascending: false }).limit(100),
      supabase.from('notification_reads').select('notification_id,read_at').eq('user_id', session.user.id),
    ])
    const firstError = results.find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    if (results[0].data) setProfile(results[0].data as Profile)
    if (results[1].data) setStudents(results[1].data as Student[])
    if (results[2].data) setEvents(results[2].data as EventRow[])
    if (results[3].data) setTransactions(results[3].data as Tx[])
    if (results[4].data) setTasks(results[4].data as Task[])
    if (results[5].data) {
      const reads = new Map((results[7].data || []).map((r: any) => [r.notification_id, r.read_at]))
      setNotices((results[5].data as Notice[]).map(n => ({ ...n, read_at: (reads.get(n.id) as string | undefined) || null })))
    }
    if (results[6].data) setAudit(results[6].data as Audit[])
  }, [session?.user?.id])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setProfile(null) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session?.user?.id) void loadData() }, [session?.user?.id, loadData])

  const income = useMemo(() => transactions.filter(t => t.kind === 'contribution').reduce((s, t) => s + Number(t.amount_pkr), 0), [transactions])
  const expenses = useMemo(() => transactions.filter(t => t.kind === 'expense').reduce((s, t) => s + Number(t.amount_pkr), 0), [transactions])
  const refunds = useMemo(() => transactions.filter(t => t.kind === 'refund').reduce((s, t) => s + Number(t.amount_pkr), 0), [transactions])
  const balance = income + refunds - expenses
  const eventSpend = (id: string) => transactions.filter(t => t.event_id === id && t.kind === 'expense').reduce((s, t) => s + Number(t.amount_pkr), 0)
  const unread = notices.filter(n => !n.read_at && (!n.target_user_id || n.target_user_id === session?.user?.id)).length
  const dueTasks = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length
  const filteredTransactions = transactions.filter(t => `${t.description} ${t.reference} ${t.kind}`.toLowerCase().includes(search.toLowerCase()))

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const form = new FormData(e.currentTarget)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get('email')), password: String(form.get('password')) })
    if (authError) setError(authError.message)
    setBusy(false)
  }
  async function signOut() { await supabase?.auth.signOut(); setSession(null); setProfile(null) }
  async function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return
    setBusy(true); setError(''); setSuccess('')
    const f = new FormData(e.currentTarget)
    let table = ''; let payload: Record<string, unknown> = {}
    if (modal === 'transaction') {
      table = 'transactions'; payload = { kind: f.get('kind'), amount_pkr: Number(f.get('amount_pkr')), description: String(f.get('description')), occurred_on: String(f.get('occurred_on')), reference: String(f.get('reference') || ''), student_id: String(f.get('student_id') || '') || null, event_id: String(f.get('event_id') || '') || null, created_by: session.user.id }
    } else if (modal === 'student') {
      table = 'students'; payload = { roll_no: String(f.get('roll_no')).trim(), full_name: String(f.get('full_name')).trim(), created_by: session.user.id }
    } else if (modal === 'event') {
      table = 'events'; payload = { title: String(f.get('title')).trim(), event_date: String(f.get('event_date') || '') || null, budget_pkr: Number(f.get('budget_pkr') || 0), status: f.get('status'), notes: String(f.get('notes') || ''), created_by: session.user.id }
    } else if (modal === 'task') {
      table = 'committee_tasks'; payload = { title: String(f.get('title')).trim(), assignee: String(f.get('assignee') || ''), due_date: String(f.get('due_date') || '') || null, status: f.get('status'), event_id: String(f.get('event_id') || '') || null, notes: String(f.get('notes') || ''), created_by: session.user.id }
    } else if (modal === 'notice') {
      table = 'notifications'; payload = { title: String(f.get('title')).trim(), body: String(f.get('body')).trim(), target_user_id: null, created_by: session.user.id }
    }
    const { error: insertError } = await supabase.from(table).insert(payload)
    if (insertError) setError(insertError.message)
    else { setSuccess('Saved successfully.'); setModal(null); await loadData() }
    setBusy(false)
  }
  async function markRead(id: string) {
    if (!supabase) return
    const { error: e } = await supabase.from('notification_reads').insert({ notification_id: id, user_id: session.user.id, read_at: new Date().toISOString() })
    if (e) setError(e.message); else await loadData()
  }
  async function updateTaskStatus(task: Task, status: Task['status']) {
    if (!supabase) return
    const { error: e } = await supabase.from('committee_tasks').update({ status }).eq('id', task.id)
    if (e) setError(e.message); else { setSuccess('Task updated.'); await loadData() }
  }
  function exportCsv() {
    const rows = [['Date', 'Type', 'Description', 'Amount PKR', 'Reference', 'Event'], ...filteredTransactions.map(t => [t.occurred_on, t.kind, t.description, String(t.amount_pkr), t.reference, events.find(e => e.id === t.event_id)?.title || ''])]
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'mrj-treasury-transactions.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (loading) return <div className="center-screen"><div className="spinner"/><p>Loading MrJ Treasury…</p></div>
  if (!session) return <Login onSubmit={signIn} busy={busy} error={error} />
  if (!profile || profile.role === 'pending') return <div className="center-screen"><div className="setup-card"><div className="brand-mark"><Wallet/></div><h1>Access pending</h1><p>Your account is signed in, but the project owner has not assigned a Treasury role yet.</p><p className="muted">Ask the owner to assign <b>finance_manager</b> or <b>cr</b> in the Supabase SQL Editor. Then sign out and sign in again.</p><button className="btn primary full" onClick={signOut}><LogOut size={16}/> Sign out</button></div></div>
  if (!isMember) return <div className="center-screen"><div className="setup-card"><h1>Access denied</h1><p>Your account is not assigned to this Treasury.</p><button className="btn primary" onClick={signOut}>Sign out</button></div></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wallet size={22}/></div><div><strong>MrJ Treasury</strong><span>CLASS FINANCE PORTAL</span></div></div>
      <div className="workspace"><span className="workspace-dot"/> BDS Class Workspace <ChevronDown size={14}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{tabs.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${tab === label ? 'active' : ''}`} onClick={() => setTab(label)}><Icon size={18}/><span>{label}</span>{label === 'Notifications' && unread > 0 && <em>{unread}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><ShieldCheck size={17}/><div><b>Protected ledger</b><span>Role-based access enabled</span></div></div><div className="profile-mini"><div className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{profile.full_name}</b><span>{isManager ? 'Finance Manager' : 'Class Representative'}</span></div><button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><Wallet size={19}/></div><b>MrJ Treasury</b></div><div className="breadcrumb">Treasury <span>/</span> <b>{tab}</b></div><div className="top-actions"><div className="today"><CalendarDays size={15}/>{new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</div><button className="icon-btn notification-button" aria-label="Notifications" onClick={() => setTab('Notifications')}><Bell size={19}/>{unread > 0 && <i/>}</button></div></header>
      <div className="content">
        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
        {success && <div className="alert success"><Check size={16}/><span>{success}</span><button onClick={() => setSuccess('')}><X size={16}/></button></div>}
        {tab === 'Overview' && <Overview profile={profile} income={income} expenses={expenses} refunds={refunds} balance={balance} transactions={transactions} events={events} tasks={tasks} students={students} unread={unread} dueTasks={dueTasks} onNavigate={setTab} onAdd={() => setModal('transaction')} isManager={isManager} eventSpend={eventSpend}/>}
        {tab === 'Transactions' && <section><PageHeader title="Transactions" subtitle="Every contribution, expense and refund in one ledger." action={isManager ? <button className="btn primary" onClick={() => setModal('transaction')}><Plus size={16}/> Add transaction</button> : undefined}/><div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search description, reference or type…" value={search} onChange={e => setSearch(e.target.value)}/></div><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export CSV</button></div><TransactionTable transactions={filteredTransactions} events={events} students={students}/></section>}
        {tab === 'Students' && <section><PageHeader title="Students" subtitle="Class roster and contribution tracking." action={isManager ? <button className="btn primary" onClick={() => setModal('student')}><Plus size={16}/> Add student</button> : undefined}/><div className="table-card"><table><thead><tr><th>Student</th><th>Roll number</th><th>Contributions</th><th>Status</th></tr></thead><tbody>{students.map(s => { const paid = transactions.filter(t => t.student_id === s.id && t.kind === 'contribution').reduce((n,t) => n + Number(t.amount_pkr), 0); return <tr key={s.id}><td><div className="person-cell"><div className="avatar light">{s.full_name.slice(0,1)}</div><b>{s.full_name}</b></div></td><td>{s.roll_no}</td><td className="amount">{pkr(paid)}</td><td><span className={`pill ${s.is_active ? 'green' : 'gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td></tr> })}{!students.length && <EmptyRow colSpan={4} text="No students yet. Add your class roster to get started."/>}</tbody></table></div><p className="small-note">Student contributions are calculated from recorded contribution transactions. This is not a per-student outstanding-dues figure until you configure a required contribution amount.</p></section>}
        {tab === 'Events' && <section><PageHeader title="Events & budgets" subtitle="Plan class events and compare spending against approved budgets." action={<button className="btn primary" onClick={() => setModal('event')}><Plus size={16}/> New event</button>}/><div className="event-grid">{events.map(ev => { const spent = eventSpend(ev.id); const percent = Number(ev.budget_pkr) > 0 ? Math.min(100, spent / Number(ev.budget_pkr) * 100) : 0; return <div className="event-card" key={ev.id}><div className="event-card-top"><span className="event-icon"><CalendarDays size={19}/></span><span className={`pill ${ev.status === 'completed' ? 'green' : ev.status === 'cancelled' ? 'red' : 'blue'}`}>{ev.status.replace('_',' ')}</span></div><h3>{ev.title}</h3><p className="muted">{dateFmt(ev.event_date)}</p><div className="event-money"><div><span>Budget</span><b>{pkr(Number(ev.budget_pkr))}</b></div><div><span>Spent</span><b>{pkr(spent)}</b></div></div><div className="progress-track"><div className={`progress-fill ${percent >= 100 ? 'over' : ''}`} style={{ width: `${percent}%` }}/></div><div className="progress-label"><span>{Math.round(percent)}% used</span><b>{pkr(Number(ev.budget_pkr) - spent)} left</b></div>{ev.notes && <p className="event-notes">{ev.notes}</p>}</div> })}{!events.length && <div className="empty-card"><CalendarDays size={26}/><b>No events yet</b><span>Create an event to set a budget and track spending.</span></div>}</div></section>}
        {tab === 'Committee' && <section><PageHeader title="Committee coordination" subtitle="Owners, responsibilities and deadlines for your class events." action={<button className="btn primary" onClick={() => setModal('task')}><Plus size={16}/> Add task</button>}/><div className="table-card"><table><thead><tr><th>Task</th><th>Assignee</th><th>Event</th><th>Due date</th><th>Status</th><th>Update</th></tr></thead><tbody>{tasks.map(t => <tr key={t.id}><td><b>{t.title}</b>{t.notes && <div className="subtext">{t.notes}</div>}</td><td>{t.assignee || 'Unassigned'}</td><td>{events.find(e => e.id === t.event_id)?.title || '—'}</td><td>{dateFmt(t.due_date)}</td><td><span className={`pill ${t.status === 'done' ? 'green' : t.status === 'in_progress' ? 'blue' : 'gray'}`}>{t.status.replace('_',' ')}</span></td><td><select className="inline-select" value={t.status} onChange={e => void updateTaskStatus(t, e.target.value as Task['status'])}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></td></tr>)}{!tasks.length && <EmptyRow colSpan={6} text="No committee tasks. Add the first task and assign an owner."/>}</tbody></table></div></section>}
        {tab === 'Audit log' && <section><PageHeader title="Audit history" subtitle="Database-recorded changes to financial and coordination records."/><div className="info-banner"><ShieldCheck size={18}/><span>Audit entries are written by database triggers. This page is read-only; it shows the latest 100 changes.</span></div><div className="table-card"><table><thead><tr><th>Time</th><th>Action</th><th>Table</th><th>Record ID</th><th>Actor ID</th></tr></thead><tbody>{audit.map(a => <tr key={a.id}><td>{dateTimeFmt(a.occurred_at)}</td><td><span className={`pill ${a.action === 'INSERT' ? 'green' : a.action === 'DELETE' ? 'red' : 'blue'}`}>{a.action}</span></td><td>{a.table_name}</td><td className="mono">{a.record_id}</td><td className="mono">{a.actor_id ? `${a.actor_id.slice(0,8)}…` : 'system'}</td></tr>)}{!audit.length && <EmptyRow colSpan={5} text="No audit entries yet."/>}</tbody></table></div></section>}
        {tab === 'Notifications' && <section><PageHeader title="Notifications" subtitle="Shared reminders and updates for your finance and committee team." action={<button className="btn primary" onClick={() => setModal('notice')}><Plus size={16}/> New notice</button>}/><div className="notice-list">{notices.filter(n => !n.target_user_id || n.target_user_id === session?.user?.id).map(n => <div className={`notice-card ${!n.read_at ? 'unread' : ''}`} key={n.id}><div className="notice-icon"><Bell size={18}/></div><div className="notice-content"><div className="notice-title-row"><b>{n.title}</b>{!n.read_at && <span className="pill blue">New</span>}</div><p>{n.body}</p><span className="muted tiny">{dateTimeFmt(n.created_at)}</span></div>{!n.read_at && <button className="btn small secondary" onClick={() => void markRead(n.id)}>Mark read</button>}</div>)}{!notices.length && <div className="empty-card"><Bell size={26}/><b>You're all caught up</b><span>New shared notices will appear here.</span></div>}</div></section>}
      </div>
      <footer className="footer"><span>MrJ Treasury <span className="footer-dot">•</span> PKR ledger</span><span><ShieldCheck size={13}/> Supabase-secured access</span></footer>
    </main>
    {modal && <Modal title={{ transaction: 'Record transaction', student: 'Add student', event: 'Create event', task: 'Add committee task', notice: 'Send shared notice' }[modal]} onClose={() => setModal(null)}><form onSubmit={submitForm} className="form-grid">
      {modal === 'transaction' && <><label>Transaction type<select name="kind" required><option value="contribution">Contribution / income</option><option value="expense">Expense</option><option value="refund">Refund received</option></select></label><label>Amount (PKR)<input name="amount_pkr" type="number" min="1" step="0.01" required placeholder="e.g. 1500"/></label><label className="wide">Description<input name="description" required maxLength={180} placeholder="e.g. Welcome party decoration"/></label><label>Date<input name="occurred_on" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Reference / receipt no.<input name="reference" maxLength={100} placeholder="Optional receipt or bank ref"/></label><label>Student (optional)<select name="student_id"><option value="">No student linked</option>{students.map(s => <option key={s.id} value={s.id}>{s.roll_no} — {s.full_name}</option>)}</select></label><label>Event (optional)<select name="event_id"><option value="">No event linked</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></label><p className="form-help wide">Money entries are limited to the Finance Manager. Keep the original receipt separately and enter its reference above.</p></>}
      {modal === 'student' && <><label>Roll number<input name="roll_no" required maxLength={30} placeholder="e.g. BDS-024"/></label><label>Full name<input name="full_name" required maxLength={100} placeholder="Student name"/></label></>}
      {modal === 'event' && <><label>Event name<input name="title" required maxLength={120} placeholder="e.g. Class dinner"/></label><label>Event date<input name="event_date" type="date"/></label><label>Budget (PKR)<input name="budget_pkr" type="number" min="0" step="0.01" defaultValue="0" required/></label><label>Status<select name="status"><option value="planning">Planning</option><option value="approved">Approved</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label className="wide">Notes<textarea name="notes" rows={3} maxLength={1000} placeholder="Venue, plans, approvals…"/></label></>}
      {modal === 'task' && <><label>Task title<input name="title" required maxLength={160} placeholder="e.g. Confirm catering"/></label><label>Assignee<input name="assignee" maxLength={100} placeholder="Committee member"/></label><label>Due date<input name="due_date" type="date"/></label><label>Status<select name="status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label className="wide">Related event<select name="event_id"><option value="">No event linked</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></label><label className="wide">Notes<textarea name="notes" rows={3} maxLength={1000}/></label></>}
      {modal === 'notice' && <><label className="wide">Notice title<input name="title" required maxLength={120} placeholder="e.g. Contribution deadline"/></label><label className="wide">Message<textarea name="body" required rows={4} maxLength={1000} placeholder="Write a clear reminder for the finance and CR team."/></label><p className="form-help wide">This creates an in-app shared notice. Email, push, and WhatsApp notifications need a separately configured delivery service.</p></>}
      <div className="modal-actions wide"><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save record'}</button></div>
    </form></Modal>}
  </div>
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div> }
function Overview({ profile, income, expenses, refunds, balance, transactions, events, tasks, students, unread, dueTasks, onNavigate, onAdd, isManager, eventSpend }: { profile: Profile; income: number; expenses: number; refunds: number; balance: number; transactions: Tx[]; events: EventRow[]; tasks: Task[]; students: Student[]; unread: number; dueTasks: number; onNavigate: (t: Tab) => void; onAdd: () => void; isManager: boolean; eventSpend: (id: string) => number }) {
  const max = Math.max(income, expenses, refunds, 1)
  return <section>
    <div className="welcome-row"><div><div className="eyebrow">YOUR CLASS FINANCES, IN CONTROL</div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {profile.full_name.split(' ')[0]} <span className="wave">✦</span></h1><p>Here's your class treasury at a glance. Keep every rupee accountable.</p></div><div className="welcome-actions"><button className="btn secondary" onClick={() => onNavigate('Audit log')}><Activity size={16}/> View audit</button>{isManager && <button className="btn primary" onClick={onAdd}><Plus size={16}/> Record transaction</button>}</div></div>
    <div className="stats-grid"><StatCard title="Available balance" value={pkr(balance)} note="Income + refunds − expenses" icon={<Wallet/>} tone="green"/><StatCard title="Total contributions" value={pkr(income)} note="All recorded contributions" icon={<ArrowDownLeft/>} tone="blue"/><StatCard title="Total expenses" value={pkr(expenses)} note="All recorded expenses" icon={<ArrowUpRight/>} tone="orange"/><StatCard title="Refunds received" value={pkr(refunds)} note="Recorded refunds" icon={<CircleDollarSign/>} tone="purple"/></div>
    <div className="dashboard-grid"><div className="panel cashflow-panel"><div className="panel-header"><div><h2>Financial overview</h2><p>All-time totals from your ledger</p></div><span className="pill green">Live data</span></div><div className="chart-legend"><span><i className="dot blue-dot"/> Contributions</span><span><i className="dot orange-dot"/> Expenses</span><span><i className="dot purple-dot"/> Refunds</span></div><div className="bar-chart">{[{label:'Contributions', value:income, cls:'bar-blue'},{label:'Expenses', value:expenses, cls:'bar-orange'},{label:'Refunds', value:refunds, cls:'bar-purple'}].map(item => <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><div className={`bar ${item.cls}`} style={{ width: `${Math.max(item.value > 0 ? 2 : 0, item.value / max * 100)}%` }}/></div><b>{pkr(item.value)}</b></div>)}</div><div className="balance-banner"><div><span>Net available balance</span><b>{pkr(balance)}</b></div><div className="balance-icon"><Wallet size={20}/></div></div></div>
      <div className="panel activity-panel"><div className="panel-header"><div><h2>Recent transactions</h2><p>Latest activity in your ledger</p></div><button className="text-button" onClick={() => onNavigate('Transactions')}>View all <ArrowUpRight size={14}/></button></div><div className="activity-list">{transactions.slice(0,5).map(t => <div className="activity-row" key={t.id}><div className={`activity-icon ${t.kind}`} >{t.kind === 'contribution' ? <ArrowDownLeft size={16}/> : t.kind === 'expense' ? <ArrowUpRight size={16}/> : <CircleDollarSign size={16}/>}</div><div className="activity-copy"><b>{t.description}</b><span>{dateFmt(t.occurred_on)} · {t.kind}</span></div><b className={`activity-amount ${t.kind === 'expense' ? 'negative' : 'positive'}`}>{t.kind === 'expense' ? '−' : '+'}{pkr(Number(t.amount_pkr))}</b></div>)}{!transactions.length && <div className="empty-inline">No transactions recorded yet.</div>}</div></div>
    </div>
    <div className="bottom-grid"><div className="panel"><div className="panel-header"><div><h2>Upcoming events</h2><p>Budget utilization and remaining funds</p></div><button className="text-button" onClick={() => onNavigate('Events')}>All events <ArrowUpRight size={14}/></button></div><div className="compact-events">{events.filter(e => e.status !== 'completed' && e.status !== 'cancelled').slice(0,3).map(e => { const spent = eventSpend(e.id); const budget = Number(e.budget_pkr); const percent = budget ? Math.min(100, spent / budget * 100) : 0; return <div className="compact-event" key={e.id}><div className="compact-event-top"><div><b>{e.title}</b><span>{dateFmt(e.event_date)}</span></div><b>{pkr(Math.max(0, budget - spent))} <small>left</small></b></div><div className="progress-track"><div className={`progress-fill ${percent >= 100 ? 'over' : ''}`} style={{ width: `${percent}%` }}/></div></div>})}{!events.filter(e => e.status !== 'completed' && e.status !== 'cancelled').length && <div className="empty-inline">No upcoming events. Create an event to set its budget.</div>}</div></div>
      <div className="panel priorities-panel"><div className="panel-header"><div><h2>Needs attention</h2><p>Items to keep on your radar</p></div><ClipboardList size={18} className="muted-icon"/></div><button className="priority-row" onClick={() => onNavigate('Committee')}><span className="priority-icon amber"><ClipboardList size={17}/></span><span><b>Overdue committee tasks</b><small>Tasks past their due date</small></span><strong className={dueTasks ? 'count-warn' : ''}>{dueTasks}</strong></button><button className="priority-row" onClick={() => onNavigate('Notifications')}><span className="priority-icon blue-bg"><Bell size={17}/></span><span><b>Unread notifications</b><small>Shared team updates</small></span><strong>{unread}</strong></button><button className="priority-row" onClick={() => onNavigate('Students')}><span className="priority-icon purple-bg"><Users size={17}/></span><span><b>Active students</b><small>Roster records</small></span><strong>{students.filter(s => s.is_active).length}</strong></button><button className="priority-row" onClick={() => onNavigate('Events')}><span className="priority-icon green-bg"><CalendarDays size={17}/></span><span><b>Planned events</b><small>Not completed or cancelled</small></span><strong>{events.filter(e => e.status === 'planning' || e.status === 'approved').length}</strong></button></div></div>
    <div className="disclaimer"><ShieldCheck size={15}/><span>Reports reflect recorded transactions only. Reconcile the balance with actual cash/bank holdings regularly.</span></div>
  </section>
}
function StatCard({ title, value, note, icon, tone }: { title: string; value: string; note: string; icon: React.ReactNode; tone: string }) { return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className={`stat-icon ${tone}`}>{icon}</div></div><strong>{value}</strong><small>{note}</small></div> }
function TransactionTable({ transactions, events, students }: { transactions: Tx[]; events: EventRow[]; students: Student[] }) { return <div className="table-card"><table><thead><tr><th>Date</th><th>Transaction</th><th>Linked to</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{transactions.map(t => <tr key={t.id}><td>{dateFmt(t.occurred_on)}</td><td><div className="transaction-name"><span className={`tx-icon ${t.kind}`}>{t.kind === 'contribution' ? <ArrowDownLeft size={15}/> : t.kind === 'expense' ? <ArrowUpRight size={15}/> : <CircleDollarSign size={15}/>}</span><div><b>{t.description}</b><span>{t.kind}</span></div></div></td><td>{events.find(e => e.id === t.event_id)?.title || students.find(s => s.id === t.student_id)?.full_name || '—'}</td><td>{t.reference || '—'}</td><td className={`amount ${t.kind === 'expense' ? 'negative' : ''}`}>{t.kind === 'expense' ? '−' : '+'}{pkr(Number(t.amount_pkr))}</td></tr>)}{!transactions.length && <EmptyRow colSpan={5} text="No transactions match your search."/>}</tbody></table></div> }
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) { return <tr><td colSpan={colSpan}><div className="empty-table"><FileText size={22}/><span>{text}</span></div></td></tr> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal-card"><div className="modal-header"><div><h2>{title}</h2><p>Fields marked required must be completed.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></div>{children}</div></div> }
function Login({ onSubmit, busy, error }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; busy: boolean; error: string }) { return <div className="auth-screen"><div className="auth-decoration"><div className="auth-orb orb-one"/><div className="auth-orb orb-two"/><div className="auth-grid"/></div><div className="auth-content"><div className="auth-brand"><div className="brand-mark"><Wallet size={24}/></div><div><b>MrJ Treasury</b><span>CLASS FINANCE PORTAL</span></div></div><div className="auth-card"><div className="auth-symbol"><ShieldCheck size={24}/></div><h1>Welcome back</h1><p>Sign in to manage your class funds, events and committee.</p>{error && <div className="alert error">{error}</div>}<form onSubmit={onSubmit} className="auth-form"><label>Email address<input type="email" name="email" required autoComplete="username" placeholder="you@example.com"/></label><label>Password<input type="password" name="password" required autoComplete="current-password" placeholder="Enter your password"/></label><button type="submit" className="btn primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ArrowUpRight size={16}/></button></form><div className="auth-security"><ShieldCheck size={15}/><span>Access is restricted to invited Finance Manager and CR accounts.</span></div></div><div className="auth-footer">MRJ TREASURY <span>•</span> PRIVATE CLASS WORKSPACE</div></div></div> }
function SetupScreen() { return <div className="center-screen"><div className="setup-card"><div className="brand-mark"><Wallet/></div><div className="eyebrow">FIRST-TIME SETUP</div><h1>Connect your treasury</h1><p>MrJ Treasury is ready, but the Supabase project credentials are not configured yet.</p><ol><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Add your Supabase project URL and publishable key.</li><li>Restart the development server or configure the GitHub repository variables before deploying.</li></ol><div className="setup-warning"><ShieldCheck size={16}/><span>Use only the publishable key in the frontend. Never use a service-role or secret key here.</span></div></div></div> }
