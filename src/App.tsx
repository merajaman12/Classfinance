
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Wallet, CalendarDays, Plus, Search, Download, Menu, X,
  ChevronRight, CheckCircle2, CircleAlert, ArrowLeft,
  FileSpreadsheet
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { signInWithGitHub, signOut } from './lib/auth'

type PaymentMethod = 'Online' | 'Cash' | 'Bank transfer' | 'Unpaid'
type StudentPayment = {
  id: number; roll: string; name: string; amount: number
  poc: string; date: string; method: PaymentMethod; paid: boolean
}
type EventSheet = {
  id: number; name: string; date: string; poc: string
  target: number; students: StudentPayment[]
}

const today = new Date().toISOString().slice(0, 10)
const money = (n: number) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency', currency: 'PKR', maximumFractionDigits: 0
  }).format(n)

const seedStudents = (): StudentPayment[] => [
  {id:1,roll:'103',name:'Moiz Khan',amount:0,poc:'Meraj Ahmed',date:'',method:'Unpaid',paid:false},
  {id:2,roll:'107',name:'Muhammad Moosa',amount:3000,poc:'Meraj Ahmed',date:'2026-10-10',method:'Online',paid:true},
  {id:3,roll:'113',name:'Dilawar',amount:2000,poc:'Meraj Ahmed',date:'2026-10-10',method:'Cash',paid:true},
  {id:4,roll:'115',name:'Ahmed Shah',amount:3000,poc:'Meraj Ahmed',date:'2026-10-09',method:'Online',paid:true},
  {id:5,roll:'116',name:'Abdul Baseer',amount:3000,poc:'Meraj Ahmed',date:'2026-10-09',method:'Cash',paid:true},
  {id:6,roll:'122',name:'Syed Muhammad Musa',amount:3000,poc:'Meraj Ahmed',date:'2026-10-08',method:'Online',paid:true},
  {id:7,roll:'123',name:'Meraj Ahmed',amount:3000,poc:'Meraj Ahmed',date:'2026-10-08',method:'Online',paid:true},
  {id:8,roll:'124',name:'Shawal Ghaffar Kakar',amount:3000,poc:'Meraj Ahmed',date:'2026-10-08',method:'Online',paid:true},
  {id:9,roll:'126',name:'Abdul Wahab',amount:3000,poc:'Meraj Ahmed',date:'2026-10-07',method:'Online',paid:true},
  {id:10,roll:'129',name:'Ronak Sani',amount:0,poc:'Meraj Ahmed',date:'',method:'Unpaid',paid:false},
  {id:11,roll:'131',name:'Ali Haidar',amount:3000,poc:'Meraj Ahmed',date:'2026-10-07',method:'Cash',paid:true},
  {id:12,roll:'138',name:'Musawer Khan',amount:3000,poc:'Meraj Ahmed',date:'2026-10-06',method:'Cash',paid:true},
  {id:13,roll:'140',name:'Yasir Khan',amount:3000,poc:'Meraj Ahmed',date:'2026-10-06',method:'Cash',paid:true},
  {id:14,roll:'141',name:'Taimoor Ahmed',amount:3000,poc:'Meraj Ahmed',date:'2026-10-06',method:'Online',paid:true},
  {id:15,roll:'143',name:'Zohib Manzoor',amount:0,poc:'Meraj Ahmed',date:'',method:'Unpaid',paid:false},
  {id:16,roll:'145',name:'Muneer Ahmed',amount:0,poc:'Meraj Ahmed',date:'',method:'Unpaid',paid:false},
  {id:17,roll:'148',name:'Muhammad Uqail',amount:3000,poc:'Meraj Ahmed',date:'2026-10-05',method:'Online',paid:true},
  {id:18,roll:'149',name:'Adnan Ismail',amount:3000,poc:'Meraj Ahmed',date:'2026-10-05',method:'Online',paid:true},
  {id:19,roll:'150',name:'Fahad',amount:0,poc:'Meraj Ahmed',date:'',method:'Unpaid',paid:false},
  {id:20,roll:'120',name:'Hassan',amount:3000,poc:'Meraj Ahmed',date:'2026-10-04',method:'Cash',paid:true}
]

const seedEvents: EventSheet[] = [
  {id:1,name:'Welcome Party',date:'2026-11-02',poc:'Meraj Ahmed',target:3000,students:seedStudents()},
  {id:2,name:'Class Dinner',date:'2026-11-20',poc:'Meraj Ahmed',target:2500,students:seedStudents().map(s=>({...s,id:s.id+100,amount:s.paid?2500:0,method:s.paid?s.method:'Unpaid'}))},
  {id:3,name:'Class Trip',date:'2026-12-05',poc:'CR Committee',target:5000,students:seedStudents().map(s=>({...s,id:s.id+200,amount:s.paid?5000:0,method:s.paid?s.method:'Unpaid'}))}
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const [events, setEvents] = useState<EventSheet[]>(seedEvents)
  const [selected, setSelected] = useState<number | null>(null)
  const [tab, setTab] = useState<'Overview' | 'Events & registers'>('Overview')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showPayment, setShowPayment] = useState(false)
  const [showEvent, setShowEvent] = useState(false)
  const [notice, setNotice] = useState('')

  const [studentId, setStudentId] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('Online')
  const [payDate, setPayDate] = useState(today)
  const [payPoc, setPayPoc] = useState('Meraj Ahmed')

  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(today)
  const [eventTarget, setEventTarget] = useState('3000')
  const [eventPoc, setEventPoc] = useState('Meraj Ahmed')

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let active = true

    async function loadSession(currentSession: Session | null) {
      if (!active) return
      setSession(currentSession)
      setRole(null)

      if (!currentSession) {
        setAuthLoading(false)
        return
      }

      const { data, error } = await supabase!
        .from('profiles')
        .select('role')
        .eq('id', currentSession.user.id)
        .maybeSingle()

      if (!active) return

      if (error) {
        setAuthError('Could not verify your account role. Please try again.')
      } else if (data?.role === 'finance_manager' || data?.role === 'cr') {
        setRole(data.role)
        setAuthError('')
      } else {
        setAuthError('Your account has no authorized role. Contact the finance manager.')
      }

      setAuthLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message)
      void loadSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        void loadSession(newSession)
      }
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const current = events.find(e => e.id === selected) ?? null

  const allStats = useMemo(() => events.reduce((acc, e) => {
    const paid = e.students.filter(s => s.paid)
    acc.collected += paid.reduce((a, s) => a + s.amount, 0)
    acc.paidCount += paid.length
    acc.unpaidCount += e.students.length - paid.length
    acc.due += e.students.filter(s => !s.paid).length * e.target
    return acc
  }, {collected:0,paidCount:0,unpaidCount:0,due:0}), [events])

  const currentStats = current ? {
    collected: current.students.filter(s => s.paid).reduce((a,s) => a+s.amount,0),
    paid: current.students.filter(s => s.paid).length,
    unpaid: current.students.filter(s => !s.paid).length,
    target: current.students.length * current.target
  } : null

  const visibleStudents = current
    ? current.students.filter(s =>
        (`${s.roll} ${s.name} ${s.method} ${s.poc}`)
          .toLowerCase().includes(search.toLowerCase()) &&
        (statusFilter === 'All' || (statusFilter === 'Paid' ? s.paid : !s.paid))
      )
    : []

  function openEvent(id: number) {
    setSelected(id)
    setTab('Events & registers')
    setSearch('')
    setStatusFilter('All')
    setMenu(false)
  }

  function addPayment(e: FormEvent) {
    e.preventDefault()
    if (!current || !studentId) return

    const amount = Number(paidAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Enter a valid payment amount.')
      return
    }

    setEvents(prev => prev.map(ev => ev.id !== current.id ? ev : {
      ...ev,
      students: ev.students.map(s => String(s.id) === studentId
        ? {...s,amount,poc:payPoc,date:payDate,method,paid:true}
        : s)
    }))

    setShowPayment(false)
    setStudentId('')
    setPaidAmount('')
    setNotice('Demo payment recorded. It is temporary and will reset when the page reloads.')
  }

  function addEvent(e: FormEvent) {
    e.preventDefault()
    if (!eventName.trim() || Number(eventTarget) <= 0) return

    const id = Date.now()
    const newEvent: EventSheet = {
      id,
      name: eventName.trim(),
      date: eventDate,
      poc: eventPoc,
      target: Number(eventTarget),
      students: seedStudents().map(s => ({
        ...s, id: s.id + id, amount: 0, method: 'Unpaid', paid: false, date: ''
      }))
    }

    setEvents(prev => [newEvent, ...prev])
    setEventName('')
    setShowEvent(false)
    openEvent(id)
    setNotice('Demo event created. It will reset when the page reloads.')
  }

  function exportCsv() {
    if (!current) return

    const rows = [
      ['Event', current.name],
      ['Roll No','Student Name','Expected Amount PKR','Amount Paid PKR','Payment Status','POC','Date','Payment Method'],
      ...current.students.map(s => [
        s.roll, s.name, String(current.target), String(s.paid ? s.amount : 0),
        s.paid ? 'Paid' : 'Unpaid', s.poc, s.date, s.method
      ])
    ]

    const csv = rows.map(r => r.map(c =>
      `"${String(c ?? '').replace(/"/g,'""')}"`
    ).join(',')).join('\r\n')

    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}))
    const a = document.createElement('a')
    a.href = url
    a.download = `mrj-${current.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-register.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading) {
    return <div className="event-app" style={{padding:32}}>Checking your login…</div>
  }

  if (!supabase) {
    return (
      <div className="event-app" style={{padding:32}}>
        <h1>MrJ Treasury</h1>
        <p>Supabase is not configured. Check your GitHub Actions variables.</p>
      </div>
    )
  }

  if (!session || !role) {
    return (
      <div className="event-app" style={{padding:32,textAlign:'center'}}>
        <div className="ev-logo" style={{margin:'0 auto 16px'}}><Wallet/></div>
        <h1>MrJ Treasury</h1>
        <p>Sign in with your authorized GitHub account to continue.</p>
        {authError && <p role="alert">{authError}</p>}
        {!session ? (
          <button className="ev-btn primary" onClick={() => {
            setAuthError('')
            signInWithGitHub().catch(e => setAuthError(e.message))
          }}>
            Continue with GitHub
          </button>
        ) : (
          <>
            <p>Your account is signed in, but its role has not been authorized.</p>
            <button className="ev-btn secondary" onClick={() => signOut().catch(e=>setAuthError(e.message))}>
              Sign out
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="event-app">
      <header className="ev-top">
        <button className="ev-iconbtn" onClick={() => setMenu(true)} aria-label="Open menu"><Menu/></button>
        <div className="ev-brand">
          <div className="ev-logo"><Wallet/></div>
          <div><b>MrJ Treasury</b><span>CLASS FINANCE PORTAL</span></div>
        </div>
        <button className="ev-btn secondary" onClick={() => signOut().catch(e=>setNotice(e.message))}>Sign out</button>
      </header>

      {menu && <div className="ev-menu-back" onClick={() => setMenu(false)}>
        <nav className="ev-menu" onClick={e => e.stopPropagation()}>
          <button className="ev-close" onClick={() => setMenu(false)}><X/></button>
          <h2>MrJ Treasury</h2>
          <button onClick={() => {setTab('Overview');setSelected(null);setMenu(false)}}>Overview</button>
          <button onClick={() => {setTab('Events & registers');setSelected(null);setMenu(false)}}>Events & registers</button>
          <p>Each event has its own separate demo register.</p>
        </nav>
      </div>}

      <main className="ev-main">
        <div className="ev-warning">
          <CircleAlert size={18}/>
          <span><b>DEMO MODE:</b> Sample records only. Changes are temporary and reset when the page reloads. Do not enter real finance records yet.</span>
        </div>

        {notice && <div className="ev-notice">{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}

        {tab === 'Overview' && !selected && <>
          <div className="ev-heading">
            <div><div className="ev-kicker">CLASS FINANCE WORKSPACE</div><h1>Event collection registers</h1><p>Keep every event's student payments and totals separate.</p></div>
            <button className="ev-btn primary" onClick={() => setShowEvent(true)}><Plus size={17}/> Create event</button>
          </div>

          <section className="ev-stats">
            <article><span>Total collected across events</span><b>{money(allStats.collected)}</b></article>
            <article><span>Paid entries</span><b>{allStats.paidCount}</b></article>
            <article><span>Unpaid entries</span><b>{allStats.unpaidCount}</b></article>
            <article><span>Events</span><b>{events.length}</b></article>
          </section>

          <div className="ev-section-title"><div><h2>Separate event sheets</h2><p>Open an event to view its own collection register.</p></div><FileSpreadsheet/></div>

          <div className="ev-event-grid">
            {events.map(ev => {
              const collected = ev.students.filter(s=>s.paid).reduce((a,s)=>a+s.amount,0)
              const paid = ev.students.filter(s=>s.paid).length
              const unpaid = ev.students.length-paid
              return <article className="ev-event-card" key={ev.id}>
                <div className="ev-event-icon"><CalendarDays/></div>
                <span className="ev-chip">SEPARATE REGISTER</span>
                <h3>{ev.name}</h3>
                <p className="ev-event-date">{ev.date || 'Date not set'} · POC: {ev.poc}</p>
                <div className="ev-event-metrics">
                  <div><span>Collected</span><b>{money(collected)}</b></div>
                  <div><span>Expected / student</span><b>{money(ev.target)}</b></div>
                </div>
                <div className="ev-progress"><i style={{width:`${Math.min(100,ev.students.length?paid/ev.students.length*100:0)}%`}}/></div>
                <div className="ev-event-foot"><span>{paid} paid · {unpaid} unpaid</span><b>{Math.round((ev.students.length?paid/ev.students.length:0)*100)}%</b></div>
                <button className="ev-btn secondary full" onClick={() => openEvent(ev.id)}>Open collection sheet <ChevronRight size={16}/></button>
              </article>
            })}
          </div>
        </>}

        {tab === 'Events & registers' && <>
          {current ? <>
            <button className="ev-back" onClick={() => {setSelected(null);setSearch('');setStatusFilter('All')}}><ArrowLeft size={16}/> All events</button>
            <div className="ev-heading">
              <div><div className="ev-kicker">EVENT COLLECTION SHEET</div><h1>{current.name}</h1><p>Separate student-by-student payment register · Event date: {current.date}</p></div>
              <div className="ev-head-actions">
                <button className="ev-btn secondary" onClick={exportCsv}><Download size={16}/> Export CSV</button>
                <button className="ev-btn primary" onClick={() => setShowPayment(true)}><Plus size={16}/> Record payment</button>
              </div>
            </div>

            <section className="ev-stats three">
              <article><span>Total amount collected</span><b>{money(currentStats!.collected)}</b></article>
              <article><span>Paid status</span><b>{currentStats!.paid} <small>/ {current.students.length}</small></b></article>
              <article><span>Unpaid status</span><b>{currentStats!.unpaid}</b></article>
            </section>

            <section className="ev-register">
              <div className="ev-register-head">
                <div><h2>Student collection register</h2><p>Expected amount per student: {money(current.target)} · Collected by: {current.poc}</p></div>
                <div className="ev-tools">
                  <label className="ev-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search roll no. or student"/></label>
                  <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option><option>Paid</option><option>Unpaid</option></select>
                </div>
              </div>

              <div className="ev-table-scroll">
                <table className="ev-table">
                  <thead><tr><th>S</th><th>Roll No</th><th>Name</th><th>Expected</th><th>Amount paid</th><th>POC</th><th>Date</th><th>Payment method</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{visibleStudents.map(s=><tr key={s.id}>
                    <td>{current.students.findIndex(x=>x.id===s.id)+1}</td><td>{s.roll}</td><td className="ev-student-name">{s.name}</td>
                    <td>{money(current.target)}</td><td className={s.paid?'ev-paid-amount':'ev-unpaid-amount'}>{money(s.paid?s.amount:0)}</td>
                    <td>{s.poc}</td><td>{s.date||'—'}</td><td><span className="ev-method">{s.paid?s.method:'—'}</span></td>
                    <td><span className={`ev-status ${s.paid?'paid':'unpaid'}`}>{s.paid?'Paid':'Unpaid'}</span></td>
                    <td>{!s.paid && <button className="ev-row-action" onClick={()=>{setStudentId(String(s.id));setPaidAmount(String(current.target));setPayPoc(current.poc);setShowPayment(true)}}>Record</button>}</td>
                  </tr>)}</tbody>
                  <tfoot><tr><td colSpan={3}>TOTALS · {visibleStudents.length} shown / {current.students.length} students</td><td>{money(current.target*current.students.length)}</td><td>{money(currentStats!.collected)}</td><td colSpan={2}>Collected by: {current.poc}</td><td colSpan={3}>{currentStats!.paid} paid · {currentStats!.unpaid} unpaid</td></tr></tfoot>
                </table>
              </div>
              <div className="ev-mobile-note">Tip: swipe the register table horizontally to view all columns.</div>
            </section>

            <section className="ev-total-banner"><div><span>Net collection for {current.name}</span><b>{money(currentStats!.collected)}</b><small>{currentStats!.paid} payments recorded · {currentStats!.unpaid} still unpaid</small></div><Wallet/></section>
          </> : <>
            <div className="ev-heading"><div><div className="ev-kicker">EVENT COLLECTION SHEETS</div><h1>Choose an event</h1><p>Every event is tracked independently; payments never mix between events.</p></div><button className="ev-btn primary" onClick={() => setShowEvent(true)}><Plus size={17}/> Create event</button></div>
            <div className="ev-event-grid">{events.map(ev=><article className="ev-event-card" key={ev.id}><div className="ev-event-icon"><CalendarDays/></div><h3>{ev.name}</h3><p className="ev-event-date">{ev.date} · POC: {ev.poc}</p><button className="ev-btn secondary full" onClick={()=>openEvent(ev.id)}>Open collection sheet <ChevronRight size={16}/></button></article>)}</div>
          </>}
        </>}

        <footer className="ev-footer">MrJ Treasury · PKR · Demo registers · Database saving not enabled yet</footer>
      </main>

      {showPayment && current && <div className="ev-modal-back" onClick={() => setShowPayment(false)}>
        <section className="ev-modal" onClick={e=>e.stopPropagation()}>
          <button className="ev-modal-x" onClick={() => setShowPayment(false)}><X/></button>
          <div className="ev-kicker">{current.name}</div><h2>Record student payment</h2><p>Updates this event's temporary demo register only.</p>
          <form onSubmit={addPayment} className="ev-form">
            <label>Student<select value={studentId} onChange={e=>setStudentId(e.target.value)} required><option value="">Select student</option>{current.students.map(s=><option key={s.id} value={s.id}>{s.roll} — {s.name}{s.paid?' (already paid)':''}</option>)}</select></label>
            <label>Amount received (PKR)<input type="number" min="1" step="1" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} required/></label>
            <label>Payment method<select value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)}><option>Online</option><option>Cash</option><option>Bank transfer</option></select></label>
            <label>Payment date<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} required/></label>
            <label>Collected by / POC<input value={payPoc} onChange={e=>setPayPoc(e.target.value)} required/></label>
            <div className="ev-modal-actions"><button type="button" className="ev-btn secondary" onClick={()=>setShowPayment(false)}>Cancel</button><button className="ev-btn primary" type="submit"><CheckCircle2 size={16}/> Save demo payment</button></div>
          </form>
        </section>
      </div>}

      {showEvent && <div className="ev-modal-back" onClick={() => setShowEvent(false)}>
        <section className="ev-modal" onClick={e=>e.stopPropagation()}>
          <button className="ev-modal-x" onClick={() => setShowEvent(false)}><X/></button>
          <div className="ev-kicker">NEW SEPARATE REGISTER</div><h2>Create event</h2><p>A new event gets its own temporary student payment sheet.</p>
          <form onSubmit={addEvent} className="ev-form">
            <label>Event name<input value={eventName} onChange={e=>setEventName(e.target.value)} placeholder="e.g. Farewell Dinner" required/></label>
            <label>Event date<input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} required/></label>
            <label>Expected contribution per student (PKR)<input type="number" min="1" value={eventTarget} onChange={e=>setEventTarget(e.target.value)} required/></label>
            <label>Collected by / POC<input value={eventPoc} onChange={e=>setEventPoc(e.target.value)} required/></label>
            <div className="ev-modal-actions"><button type="button" className="ev-btn secondary" onClick={()=>setShowEvent(false)}>Cancel</button><button className="ev-btn primary" type="submit"><Plus size={16}/> Create register</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}
