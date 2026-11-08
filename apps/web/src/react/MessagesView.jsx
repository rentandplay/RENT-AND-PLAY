import React, { useState, useEffect, useRef } from './react-shim.js';

const retryKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const when = value => new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const initials = name => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const QUICK_REPLIES = [
  { label: '🪪 Accepted IDs', text: 'Tumatanggap po kami ng National ID, Driver\'s License, Passport, UMID, Postal ID, o Valid School ID (basta currently enrolled with proof of registration).' },
  { label: '📋 Rental Requirements', text: 'Kailangan lamang po ng 1 Valid ID (Government o School ID), pirma sa rental agreement, at active contact details.' },
  { label: '⏰ Store Hours', text: 'Bukas po ang aming rental desk mula 8:00 AM hanggang 8:00 PM araw-araw para sa pickup at return.' },
  { label: '📍 Pickup & Return', text: 'Maaari ninyong i-pickup at i-return ang equipment sa aming shop desk habang operating hours.' },
];

export function MessagesView({ api, user }) {
  const storageKey = `rental-support-drafts:${user.id}`;
  function saved(kind) { try { return new Map(JSON.parse(sessionStorage.getItem(`${storageKey}:${kind}`) || '[]')); } catch { return new Map(); } }
  const [threads, setThreads] = useState([]), [active, setActive] = useState(() => { try { const id = sessionStorage.getItem('rental-support-open'); sessionStorage.removeItem('rental-support-open'); return id; } catch { return null; } });
  const [status, setStatus] = useState(''), [search, setSearch] = useState('');
  const [next, setNext] = useState(null), [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]), [older, setOlder] = useState(null);
  const [draft, setDraft] = useState(''), [pending, setPending] = useState(null);
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [synced, setSynced] = useState(null);
  const [listError, setListError] = useState('');
  const [typing, setTyping] = useState(null);
  const listVersion = useRef(0), statusRef = useRef(status), retryConversation = useRef(() => {});
  statusRef.current = status;
  const generation = useRef(0), sequence = useRef(0), busy = useRef(false), listBusy = useRef(false), bottom = useRef(null);
  const drafts = useRef(saved('drafts')), failures = useRef(saved('pending'));
  const atBottom = useRef(true), hasOlderThreads = useRef(false);
  const typingTimer = useRef(0);
  function persist() { try { sessionStorage.setItem(`${storageKey}:drafts`, JSON.stringify([...drafts.current])); sessionStorage.setItem(`${storageKey}:pending`, JSON.stringify([...failures.current])); } catch {} }
  const currentId = useRef(active); currentId.current = active;
  const apiRef = useRef(api); apiRef.current = api;
  const request = (path, method, body) => apiRef.current(path, method ? { method, body: JSON.stringify(body) } : {});
  useEffect(() => { const open = event => setActive(event.detail); window.addEventListener('rental-support-open', open); return () => window.removeEventListener('rental-support-open', open); }, []);

  async function loadThreads(before = null) {
    const version = listVersion.current, selectedStatus = statusRef.current;
    if (listBusy.current?.version === version) return;
    const operation = { version }; listBusy.current = operation;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus) params.set('status', selectedStatus);
      if (before) params.set('before', before);
      const result = await request(`/chat/threads?${params}`);
      if (version !== listVersion.current) return;
      setListError('');
      if (before) hasOlderThreads.current = true;
      setThreads(old => before || hasOlderThreads.current ? [...new Map([...old, ...result.threads].map(row => [row.id, row])).values()].sort((a,b) => b.sort_key.localeCompare(a.sort_key)) : result.threads);
      if (before || !hasOlderThreads.current) setNext(result.next_cursor);
    } catch (problem) { if (version === listVersion.current) setListError(problem.message); }
    finally { if (listBusy.current === operation) listBusy.current = null; if (version === listVersion.current) setLoading(false); }
  }
  useEffect(() => {
    hasOlderThreads.current = false;
    setThreads([]); setNext(null); setListError('');
    loadThreads();
    const timer = setInterval(() => { if (!document.hidden) loadThreads(); }, 7000);
    const refresh = () => { if (!document.hidden) loadThreads(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { listVersion.current++; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [status]);

  useEffect(() => {
    const version = ++generation.current;
    sequence.current = 0; busy.current = false;
    atBottom.current = true;
    setMessages([]); setThread(null); setOlder(null); setError(''); setSynced(null); setTyping(null);
    setDraft(drafts.current.get(active) || ''); setPending(failures.current.get(active) || null);
    if (!active) return;
    async function sync() {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const last = sequence.current;
        const result = await request(`/chat/threads/${active}/messages${last ? `?after=${last}` : ''}`);
        if (version !== generation.current) return;
        setThread(result.thread);
        setTyping(result.typing || null);
        if (!last) setOlder(result.next_cursor);
        if (result.messages.length) {
          sequence.current = result.messages.at(-1).seq;
          setMessages(old => [...new Map([...old, ...result.messages].map(row => [row.id, row])).values()].sort((a, b) => a.seq - b.seq));
        }
        setError(''); setSynced(new Date());
        if (sequence.current && !document.hidden && atBottom.current) {
          const read = await request(`/chat/threads/${active}/read`, 'POST', { through: sequence.current });
          if (version === generation.current) setThread(read.thread);
        }
        if (result.has_more && last) setTimeout(() => { if (version === generation.current) sync(); }, 0);
      } catch (problem) { if (version === generation.current) setError(problem.message); }
      finally { if (version === generation.current) busy.current = false; }
    }
    retryConversation.current = sync;
    sync();
    const timer = setInterval(sync, 4000);
    const wake = () => sync();
    window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake);
    return () => { generation.current++; retryConversation.current = () => {}; clearInterval(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); };
  }, [active]);
  useEffect(() => { if (atBottom.current) bottom.current?.scrollIntoView({ block: 'nearest' }); }, [active, messages.at(-1)?.id, typing?.is_typing]);

  function handleDraftChange(value) {
    setDraft(value);
    drafts.current.set(active, value);
    persist();
    if (!active || !value.trim()) return;
    const now = Date.now();
    if (now - typingTimer.current > 2500) {
      typingTimer.current = now;
      request(`/chat/threads/${active}/typing`, 'POST', { typing: true }).catch(() => {});
    }
  }

  async function send(event) {
    if (event?.preventDefault) event.preventDefault();
    if (sending || !active) return;
    const operation = pending || { text: draft.trim(), requestKey: retryKey() };
    if (!operation.text) return;
    const id = active; setSending(true); setError('');
    failures.current.set(id, operation); setPending(operation); persist();
    try {
      const result = await request(`/chat/threads/${id}/messages`, 'POST', operation);
      failures.current.delete(id); drafts.current.delete(id); persist();
      if (currentId.current === id) {
        setPending(null); setDraft(''); setThread(result.thread);
        setMessages(old => [...new Map([...old, result.message].map(row => [row.id, row])).values()].sort((a, b) => a.seq - b.seq));
      }
      loadThreads();
    } catch (problem) {
      if (problem.status >= 400 && problem.status < 500) { failures.current.delete(id); persist(); if (currentId.current === id) setPending(null); }
      if (currentId.current === id) setError(`${problem.message} Your message is kept; try again below.`);
    }
    finally { setSending(false); }
  }

  async function loadOlder() {
    const id = active, cursor = older;
    try {
      const result = await request(`/chat/threads/${id}/messages?before=${cursor}`);
      if (currentId.current !== id) return;
      setMessages(old => [...new Map([...result.messages, ...old].map(row => [row.id, row])).values()].sort((a, b) => a.seq - b.seq)); setOlder(result.next_cursor);
    } catch (problem) { setError(problem.message); }
  }

  async function changeStatus() {
    const id = active;
    try {
      const result = await request(`/chat/threads/${id}/status`, 'PATCH', { status: thread.status === 'OPEN' ? 'RESOLVED' : 'OPEN' });
      if (currentId.current === id) setThread(result.thread); loadThreads();
    } catch (problem) { setError(problem.message); }
  }

  const filtered = threads.filter(row => `${row.customer_name} ${row.subject} ${row.rental_code || ''}`.toLowerCase().includes(search.toLowerCase()));

  return <section className="support-chat panel" aria-label="Customer rental support">
    <aside className="support-inbox">
      <h2>Customer inbox</h2>
      <label>Search shown conversations<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer or rental reference" /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All conversations</option><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></label>
      <div className="support-thread-list">{filtered.map(row => <button key={row.id} className={`support-thread ${active === row.id ? 'selected' : ''}`} onClick={() => setActive(row.id)}>
        <span><strong>{row.customer_name}</strong>{row.unread_count > 0 && <b className="support-unread">{row.unread_count}</b>}</span>
        <span>{row.subject}</span><small>{row.rental_code || 'General inquiry'} · {row.status.toLowerCase()}</small>
        <p>{row.last_message || 'No messages yet'}</p><time>{when(row.updated_at)}</time>
      </button>)}</div>
      {listError && <div role="alert" className="support-error"><p>{listError}{threads.length ? ' Showing previously loaded conversations.' : ''}</p><button type="button" disabled={loading} onClick={() => loadThreads()}>Try again</button></div>}
      {!filtered.length && !listError && <p className="support-muted" role="status">{loading ? 'Loading conversations…' : search ? 'No conversations match your search. Try another name or rental reference.' : 'No conversations yet. Customer inquiries will appear here.'}</p>}
      {next && <button disabled={loading} onClick={() => loadThreads(next)}>{loading ? 'Loading…' : 'Load more conversations'}</button>}
    </aside>
    <div className="support-conversation">
      {error && <div role="alert" className="support-error"><p>{error}</p><button type="button" onClick={() => retryConversation.current()}>Refresh conversation</button></div>}
      {!active ? <div className="support-empty"><h2>Rental support</h2><p>Select a conversation to help a customer.</p><p>Replies are saved and customers receive an alert. Staff share this inbox.</p></div> : <>
        <header className="support-header"><div><h2>{thread?.customer_name || 'Loading conversation…'}</h2><p>{thread?.subject} {thread?.rental_code && `· ${thread.rental_code}`}</p><small>{synced ? `Last synced ${synced.toLocaleTimeString()}` : 'Connecting…'}</small></div>
          {thread && <button disabled={sending} onClick={changeStatus}>{thread.status === 'OPEN' ? 'Resolve conversation' : 'Reopen conversation'}</button>}</header>
        <div className="support-conversation-body">
          <div className="support-conversation-main">
            <div className="support-messages" role="log" aria-label="Messages" aria-live="polite" onScroll={e => { atBottom.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 80; }}>
              {older && <button onClick={loadOlder}>Load earlier messages</button>}
              {messages.map(message => <article key={message.id} className={`support-bubble ${message.sender_role === 'STAFF' ? 'outgoing' : ''}`}>
                <div className="support-bubble-header">
                  <strong>{message.sender_role === 'STAFF' ? `${message.sender_name}${message.sender_id === user?.id ? ' (you)' : ''}` : thread?.customer_name}</strong>
                  <span className={`support-role-tag role-${message.sender_role.toLowerCase()}`}>{message.sender_role === 'STAFF' ? 'Staff' : 'Customer'}</span>
                </div>
                <p>{message.text}</p>
                <small>{when(message.created_at)}{message.sender_role === 'STAFF' ? ` · ${thread?.customer_read_seq >= message.seq ? 'Read' : 'Sent'}` : ''}</small>
              </article>)}
              {typing?.is_typing && <article className="support-bubble support-typing-bubble" role="status" aria-label={`${typing.name} is typing`}>
                <div className="typing-indicator-row">
                  <span className="typing-dots"><span className="dot"></span><span className="dot"></span><span className="dot"></span></span>
                  <span className="typing-label"><strong>{typing.name}</strong> is typing…</span>
                </div>
              </article>}
              {!messages.length && <p className="support-muted">{error ? 'Messages could not be updated. Your reply is kept below.' : thread ? 'No messages yet.' : 'Loading messages…'}</p>}<div ref={bottom} />
            </div>
            {thread?.status === 'RESOLVED' && <p className="support-muted">Resolved. Reopen to reply. A new customer message also reopens this conversation.</p>}
            <form className="support-composer" onSubmit={send}>
              <div className="support-composer-header">
                <label htmlFor="support-reply">Reply to customer</label>
                <div className="support-quick-chips">
                  {QUICK_REPLIES.map(qr => <button key={qr.label} type="button" className="quick-chip-btn" disabled={!thread || thread?.status === 'RESOLVED'} onClick={() => handleDraftChange(qr.text)}>{qr.label}</button>)}
                </div>
              </div>
              <textarea id="support-reply" rows="3" maxLength={2000} value={pending?.text ?? draft} disabled={!!pending || !thread || thread?.status === 'RESOLVED'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sending && !pending && (pending?.text ?? draft).trim()) send(e); } }} onChange={e => handleDraftChange(e.target.value)} placeholder="Help with availability, pricing, or a rental… (Press Enter to send)" />
              <div><small>{(pending?.text ?? draft).length}/2000 · Press Enter to send, Shift+Enter for new line</small><button type="submit" disabled={sending || !thread || thread.status === 'RESOLVED' || !(pending?.text ?? draft).trim()}>{sending ? 'Sending…' : pending ? 'Retry message' : 'Send reply'}</button></div>
            </form>
          </div>
          {thread && <aside className="support-context-rail">
            <div className="context-card-header">
              <div className="context-avatar">{initials(thread.customer_name)}</div>
              <h3>{thread.customer_name}</h3>
              <span className={`context-status-pill status-${thread.status.toLowerCase()}`}>{thread.status}</span>
            </div>
            <div className="context-details-group">
              <h4>Inquiry Summary</h4>
              <div className="context-row"><span>Type</span><strong>{thread.subject}</strong></div>
              <div className="context-row"><span>Rental Reference</span><strong>{thread.rental_code || 'General inquiry'}</strong></div>
              <div className="context-row"><span>Last Updated</span><time>{when(thread.updated_at)}</time></div>
            </div>
            <div className="context-details-group">
              <h4>Operator Tips</h4>
              <p className="context-tip-text">Customer views replies live in the mobile app. Double-check equipment availability, condition, and valid ID before confirming pickup.</p>
            </div>
          </aside>}
        </div>
      </>}
    </div>
  </section>;
}