import {createInventory} from './inventory.js';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const icons = {
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
 moon:'<path d="M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13Z"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 chart:'<path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-8"/>',
 chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5"/><rect x="10" y="10" width="4" height="4"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
 bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/>',out:'<path d="M10 4H4v16h6M8 12h13m-4-4 4 4-4 4"/>',
 money:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1M17 12h1"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.box}</svg>`;
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(v || 0));
const initials = name => String(name || '').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const symbol = category => /sport/i.test(category)?'🏀':/board/i.test(category)?'🎲':/card/i.test(category)?'🃏':/consol/i.test(category)?'🎮':'📦';
const date = v => v ? new Date(String(v).replace(' ','T')+'+08:00') : null;
const formatDate = v => v ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(date(v)) : 'Not recorded';
const badge = status => `<span class="badge ${escape(status.toLowerCase().replaceAll(' ','-'))}">${escape(status)}</span>`;
const stateLabel = status => ({AVAILABLE:'Available',RENTED:'Rented',UNDER_MAINTENANCE:'Under maintenance',RESERVED_PENDING:'Pending',INACTIVE:'Inactive'}[status] || status);
const brand = `<img src="/public/logo.png" alt="Rent and Play logo"/><span>rent<span class="orange">&</span>play<small>RENTAL MANAGEMENT</small></span>`;
const sportArt = `<svg class="sport-art" viewBox="0 0 320 230" aria-hidden="true"><g fill="none" stroke="#efbe8b"><circle cx="188" cy="106" r="100"/><circle cx="188" cy="106" r="80"/><path d="M50 210 280 12M94 230 320 34"/></g><g transform="rotate(-18 187 100)"><circle cx="190" cy="95" r="66" fill="#f99235" stroke="#b7561b" stroke-width="3"/><path d="M124 95h132M190 29v132M144 47c55 10 64 86 9 103M227 41c-53 23-54 87-6 112" stroke="#a74918" stroke-width="3" fill="none"/></g><g transform="rotate(21 92 166)"><rect x="39" y="127" width="109" height="67" rx="29" fill="#223957"/><path d="M62 148v23M50 159h24" stroke="#fff" stroke-width="5"/><circle cx="122" cy="153" r="5" fill="#fb9b50"/><circle cx="112" cy="166" r="5" fill="#91b7aa"/></g><g transform="rotate(14 263 166)"><rect x="236" y="136" width="54" height="54" rx="10" fill="#fff" stroke="#ddc6b0"/><g fill="#203750"><circle cx="249" cy="149" r="3"/><circle cx="277" cy="149" r="3"/><circle cx="263" cy="163" r="3"/><circle cx="249" cy="177" r="3"/><circle cx="277" cy="177" r="3"/></g></g></svg>`;
const nav = [['Dashboard','grid'],['Inventory','box'],['Rentals','clock'],['Customers','users'],['Reports','chart'],['ESP32 terminal','chip']];
let user=null, data=null, page='Dashboard', filter='All rentals', query='', period='This week', category='', connectionError='', toastTimer, refreshing=false;
let theme=document.documentElement.dataset.theme || 'light';
let sidebarCollapsed=false;
try {sidebarCollapsed=localStorage.getItem('rent-play-sidebar-collapsed')==='true';}catch {}

function configureSidebar() {
  const sidebar=document.querySelector('.sidebar'),workspace=document.querySelector('.workspace'),toggle=document.querySelector('#mobile-menu');
  sidebar.id='workspace-navigation';toggle.setAttribute('aria-controls',sidebar.id);
  sidebar.querySelectorAll('nav button,.sidebar-bottom>button').forEach(button=>{
    const name=button.dataset.page==='Settings'?'Settings & help':button.dataset.page||button.textContent.trim();button.setAttribute('aria-label',name);button.title=name;
    for(const node of Array.from(button.childNodes))if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()){
      const span=document.createElement('span');span.className='sidebar-label';span.textContent=node.textContent;node.replaceWith(span);
    }
  });
  const backdrop=document.createElement('button');backdrop.className='sidebar-backdrop';backdrop.setAttribute('aria-label','Close navigation');backdrop.hidden=true;workspace.append(backdrop);
  function update(open=false) {
    const mobile=window.matchMedia('(max-width:720px)').matches;
    workspace.classList.toggle('sidebar-collapsed',sidebarCollapsed);
    sidebar.classList.toggle('open',mobile&&open);backdrop.hidden=!(mobile&&open);
    toggle.setAttribute('aria-expanded',String(mobile?open:!sidebarCollapsed));
    const label=mobile?(open?'Close navigation':'Open navigation'):(sidebarCollapsed?'Expand sidebar':'Collapse sidebar');
    toggle.setAttribute('aria-label',label);toggle.title=label;
  }
  toggle.onclick=()=>{
    if(window.matchMedia('(max-width:720px)').matches)update(!sidebar.classList.contains('open'));
    else {sidebarCollapsed=!sidebarCollapsed;try{localStorage.setItem('rent-play-sidebar-collapsed',String(sidebarCollapsed));}catch{}update();}
  };
  backdrop.onclick=()=>{update();toggle.focus();};
  sidebar.onkeydown=event=>{if(event.key==='Escape'){update();toggle.focus();}};
  toggle.onkeydown=event=>{if(event.key==='Escape')update();};
  window.onresize=()=>update();update();
}

function setTheme(next) {
  theme=next==='dark'?'dark':'light';
  document.documentElement.dataset.theme=theme;
  try {localStorage.setItem('rent-play-theme',theme);}catch {/* Theme still works if storage is unavailable. */}
  updateThemeControls();
}
function updateThemeControls() {
  const button=document.querySelector('#login-theme');
  if(button) {
    const label=theme==='dark'?'Switch to light mode':'Switch to dark mode';
    button.innerHTML=icon(theme==='dark'?'sun':'moon');
    button.setAttribute('aria-label',label);button.title=label;
  }
  const toggle=document.querySelector('#dark-mode');
  if(toggle)toggle.setAttribute('aria-checked',String(theme==='dark'));
  const status=document.querySelector('#theme-status');
  if(status)status.textContent=theme==='dark'?'Dark mode is on':'Light mode is on';
}
function appearanceSettings() {
  return `<section class="appearance-settings" aria-labelledby="appearance-title"><span class="eyebrow">MAKE IT YOURS</span><h3 id="appearance-title">Appearance</h3><p>A comfortable workspace, day or night.</p><div class="theme-setting"><span class="theme-setting-icon">${icon('moon')}</span><div><label id="dark-mode-label">Dark mode</label><small>Use a softer, darker palette across your workspace.</small></div><button id="dark-mode" class="theme-switch" type="button" role="switch" aria-labelledby="dark-mode-label" aria-checked="${theme==='dark'}"><span></span></button></div><div class="theme-preference-note"><span id="theme-status" role="status">${theme==='dark'?'Dark mode is on':'Light mode is on'}</span><small>Saved on this browser · Applies to login and dashboard</small></div></section>`;
}

async function api(path, options={}) {
  let response;
  try {response=await fetch(`/api${path}`,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});}
  catch {throw new Error('Cannot reach the server. Check that the web and backend servers are running.');}
  const result=await response.json().catch(()=>({error:'The server returned an invalid response.'}));
  if(!response.ok)throw Object.assign(new Error(result.error || 'Request failed.'),{status:response.status});
  return result;
}
function toast(message) {
  const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000);
}
function showModal(title,body) {
  modal.innerHTML=`<div class="modal-heading"><h2>${escape(title)}</h2><button class="icon-button" id="close-modal" aria-label="Close dialog">✕</button></div>${body}`;
  modal.showModal();document.querySelector('#close-modal').onclick=()=>modal.close();
}
modal.addEventListener('click',e=>{
  if(e.target!==modal)return;
  const r=modal.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();
});
function login(message='') {
  app.innerHTML=`<main class="login"><section class="login-story"><a class="brand" href="#">${brand}</a><div class="story-body"><span class="eyebrow">LESS PAPERWORK. MORE PLAY.</span><h1>Good times.<br/>Greatly managed<span class="orange">.</span></h1><p>Your equipment, rentals, and returns.<br/>All together in one happy place.</p><div class="login-art">${sportArt}</div><div class="story-features"><span>${icon('box')} Know what’s available</span><span>${icon('clock')} Stay ahead of due dates</span><span>${icon('chip')} Verify every handoff</span></div></div><footer>Made for Rent & Play <span>Los Baños, Laguna</span></footer></section><section class="login-form-side"><span class="workspace-label">OWNER / OPERATOR WORKSPACE</span><div class="login-form-wrap"><div class="welcome-icon">${icon('grid')}</div><h2>Welcome back!</h2><p>Sign in to manage your rentals.</p><form id="login-form"><label for="email">Email address</label><input id="email" type="email" autocomplete="username" placeholder="Your operator email" maxlength="191" required/><div class="label-line"><label for="password">Password</label><button class="text-button" type="button" id="forgot">Account help</button></div><div class="password-field"><input id="password" type="password" autocomplete="current-password" placeholder="Enter your password" maxlength="1024" required/><button type="button" id="show-password" aria-label="Show password">${icon('eye')}</button></div><label class="checkbox"><input id="remember" type="checkbox"/> Remember me on this device</label><p id="login-error" role="alert">${escape(message)}</p><button class="primary login-submit" type="submit">Sign in to your workspace ${icon('arrow')}</button></form><p class="login-foot">Your account. Your equipment. Your workspace.</p></div><footer>© ${new Date().getFullYear()} Rent & Play <span>Built for more play.</span></footer></section></main>`;
  const loginHeader=document.createElement('div');loginHeader.className='login-header';
  const workspaceLabel=document.querySelector('.workspace-label');workspaceLabel.before(loginHeader);
  loginHeader.append(workspaceLabel);
  const themeButton=document.createElement('button');themeButton.id='login-theme';themeButton.className='theme-button';themeButton.type='button';
  loginHeader.append(themeButton);themeButton.onclick=()=>setTheme(theme==='dark'?'light':'dark');updateThemeControls();
  document.querySelector('#show-password').onclick=e=>{
    const input=document.querySelector('#password');input.type=input.type==='password'?'text':'password';
    e.currentTarget.setAttribute('aria-label',input.type==='password'?'Show password':'Hide password');
  };
  document.querySelector('#forgot').onclick=()=>showModal('Account help','<p>Contact your owner for account access or password recovery.</p><p>If this is the first setup, create the owner account using <code>npm run user:create</code> in the backend terminal. Passwords are stored as hashes, never as plain text.</p>');
  document.querySelector('#login-form').onsubmit=async e=>{
    e.preventDefault();const button=e.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    document.querySelector('#login-error').textContent='';
    try {
      const result=await api('/auth/login',{method:'POST',body:JSON.stringify({email:document.querySelector('#email').value,password:document.querySelector('#password').value,remember:document.querySelector('#remember').checked})});
      user=result.user;page='Dashboard';await refresh();
    } catch(error) {
      const el=document.querySelector('#login-error');if(el)el.textContent=error.message;
    } finally {button.disabled=false;}
  };
}
async function refresh() {
  if(!user || refreshing)return;
  refreshing=true;
  try {data=await api('/dashboard');connectionError='';render();}
  catch(error) {
    if(error.status===401){user=null;data=null;login('Your session ended. Please sign in again.');}
    else {connectionError=error.message;render();}
  } finally {refreshing=false;}
}
const empty = (heading,message,glyph='box') => `<div class="empty-state">${icon(glyph)}<h3>${heading}</h3><p>${message}</p></div>`;
function stat(label,value,note,glyph,color) {return `<article class="stat"><div><span>${label}</span><span class="stat-icon ${color}">${icon(glyph)}</span></div><strong>${value}</strong><small>${note}</small></article>`;}
function rentalsTable(full=false) {
  const rows=data.rentals.filter(r=>(filter==='All rentals'||r.displayStatus===filter)&&`${r.customer} ${r.rental_code} ${r.item_name}`.toLowerCase().includes(query.toLowerCase()));
  return `<section class="panel rental-panel"><div class="panel-title"><div><h3>${full?'Open rental records':'Rentals to keep an eye on'}</h3><p>Active rentals and requests awaiting verification.</p></div>${!full?'<button class="text-button" data-page="Rentals">View all rentals →</button>':''}</div><div class="table-controls"><div class="tabs">${['All rentals','Due today','Overdue'].map(x=>`<button data-filter="${x}" class="${filter===x?'selected':''}">${x}${x==='Overdue'?`<span>${data.stats.overdue}</span>`:''}</button>`).join('')}</div><label class="table-search">${icon('search')}<input id="rental-search" placeholder="Search rentals" value="${escape(query)}" aria-label="Search rentals"/></label></div><div class="table-scroll"><table><thead><tr><th>ITEM / RENTAL ID</th><th>CUSTOMER</th><th>DUE DATE</th><th>STATUS</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="item-cell"><span class="item-symbol">${symbol(data.items.find(i=>String(i.id)===String(r.item_id))?.category || '')}</span><div><strong>${escape(r.item_name)}</strong><small>${escape(r.rental_code)}</small></div></div></td><td><span class="mini-avatar">${escape(initials(r.customer))}</span>${escape(r.customer)}</td><td><strong>${escape(formatDate(r.due_at))}</strong><small>Philippine time</small></td><td>${badge(r.displayStatus)}</td><td><button class="row-button" data-rental="${escape(r.id)}" aria-label="View ${escape(r.rental_code)}">${icon('arrow')}</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No open rentals match this view.</td></tr>'}</tbody></table></div><div class="table-footer">Showing ${rows.length} of ${data.rentals.length} open rentals <span>From your database</span></div></section>`;
}
function chart() {
  const amounts=data.revenue[period];const max=Math.max(100,...amounts);const scale=Math.ceil(max/100)*100;
  return `<section class="panel revenue-panel"><div class="panel-title"><div><h3>Confirmed rental fees</h3><p>Grouped by the date each rental was confirmed.</p></div><select id="period" aria-label="Revenue period"><option ${period==='This week'?'selected':''}>This week</option><option ${period==='Last week'?'selected':''}>Last week</option></select></div><div class="revenue-total">${money(amounts.reduce((a,b)=>a+b,0))}<span>Deposits excluded</span></div><div class="chart"><div class="axis">${[1,.75,.5,.25,0].map(x=>`<span>${money(scale*x)}</span>`).join('')}</div><div class="bars">${amounts.map((amount,i)=>`<div class="bar-column"><div class="bar ${amount===max?'highlight':''}" style="height:${amount/scale*100}%" title="${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}: ${money(amount)}"></div><span>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span></div>`).join('')}</div></div>${amounts.every(v=>v===0)?'<p class="chart-empty">No confirmed rental fees in this period.</p>':''}</section>`;
}
function terminal() {
  const t=data.terminals[0];const queue=t?data.pending.filter(p=>p.terminal_code===t.terminal_code):[];
  return `<section class="panel terminal-panel"><div class="panel-title"><h3>${icon('chip')} Counter terminal</h3><span class="offline-dot">${t?.online?'Online':'Offline'}</span></div><div class="device"><span>${escape(t?.terminal_code || 'NO TERMINAL REGISTERED')}</span><strong>${t?.online?escape(queue[0]?.display_status || 'WAITING FOR REQUEST'):'OFFLINE'}</strong><small>${escape(t?.name || 'Register your counter terminal')}</small><div class="device-led"></div></div><div class="terminal-meta"><span>Pending verification</span><strong>${queue.length}</strong></div><p class="terminal-note">${icon('chip')} Final confirmation requires the physical terminal button. Last seen: ${escape(formatDate(t?.last_seen_at))}.</p><button class="secondary wide" data-page="ESP32 terminal">View verification activity ${icon('arrow')}</button></section>`;
}
function dashboard() {
  const s=data.stats;
  return `<section class="hero"><div><span class="eyebrow">YOUR DAILY GAME PLAN</span><h2>More play. Less paperwork.</h2><p>A clear view of your rentals, so you can focus on the fun.</p><button class="primary" id="rental-workflow">${icon('arrow')} Rental workflow</button></div>${sportArt}</section><div class="stats">${stat('Active rentals',s.active,'Confirmed rentals currently out','clock','blue')}${stat('Available items',s.available,'Ready for their next adventure','box','green')}${stat('Due today',s.dueToday,`${s.overdue} overdue rental(s) need attention`,'bell','amber')}${stat('Rental fees',money(s.fees),'From current active rentals','money','purple')}</div><div class="dashboard-grid"><div class="main-column">${rentalsTable()}${chart()}</div><aside class="right-column">${terminal()}<section class="panel category-panel"><h3>A little of everything</h3><p>Your equipment at a glance.</p>${data.categories.map((c,i)=>`<button data-category="${i}"><span class="category-symbol">${symbol(c.name)}</span><span>${escape(c.name)}<small>${c.count} items in inventory</small></span>${icon('arrow')}</button>`).join('')||'<p>No categories recorded.</p>'}</section><div class="counter-tip"><span>✦</span><div><strong>A small counter tip</strong><p>Check item condition before confirming a return.</p></div></div></aside></div>`;
}
function inventory() {
  return '<div id="inventory-root" aria-live="polite"><section class="panel"><p>Loading your inventory…</p></section></div>';
}
function customers() {
  return `<section class="panel"><div class="panel-title"><div><h3>Your rental community</h3><p>${data.customers.length} active customer(s) in your database.</p></div></div>${data.customers.length?`<div class="customer-grid">${data.customers.map(c=>`<article><span class="avatar">${escape(initials(c.full_name))}</span><h3>${escape(c.full_name)}</h3><p>${escape(c.customer_code)}</p></article>`).join('')}</div>`:empty('No customers yet','Customer records will appear here when they are added.','users')}</section>`;
}
function verification() {
  return `<div class="verification-layout">${terminal()}<section class="panel"><div class="panel-title"><div><h3>Verification queue</h3><p>Live pending requests from your database.</p></div></div>${data.pending.length?data.pending.map(p=>`<div class="queue-row"><div><strong>${escape(p.item_name)} · ${escape(p.customer)}</strong><small>${escape(p.verification_code)} · ${escape(p.transaction_type)} · ${escape(p.terminal_code)}</small><small>Expires ${escape(formatDate(p.expires_at))}</small></div>${badge(date(p.expires_at)<new Date()?'Awaiting expiry':'Pending')}</div>`).join(''):empty('All quiet at the counter','No pending verification requests.','chip')}<div class="info-box">${data.terminals.length} active terminal(s) registered. Online status requires a heartbeat in the last 90 seconds. The web dashboard cannot simulate physical confirmation.</div></section></div>`;
}
function render() {
  if(!user)return;
  const body=!data?`<section class="panel">${empty('Waiting for your database','Check the backend connection, then select Refresh.')}</section>`:page==='Dashboard'?dashboard():page==='Inventory'?inventory():page==='Rentals'?rentalsTable(true):page==='Customers'?customers():page==='Reports'?`${chart()}<div class="info-box">Rental fees are recorded charges, not a payment collection report. Deposits are excluded from the fee chart.</div><button class="primary" id="export">${icon('chart')} Export open rentals</button>`:page==='ESP32 terminal'?verification():`<section class="panel help-panel"><h3>Your connected workspace</h3><p>Signed in as ${escape(user.name)} (${escape(user.role)}). Inventory, customers, rentals, fees, and verification records come from your MySQL database through the backend API.</p><h3>Rental and return workflow</h3><p>Scan the equipment QR in the mobile app, submit the request, then verify the physical equipment and press the ESP32 confirmation button.</p><h3>Updates</h3><p>The dashboard refreshes every 30 seconds while you are signed in. Use Refresh for the latest records.</p></section>`;
  app.innerHTML=`<div class="workspace"><aside class="sidebar"><a class="brand" href="#">${brand}</a><div class="store"><span class="store-icon">${icon('box')}</span><div><strong>Rent & Play</strong><small>Los Baños, Laguna</small></div></div><span class="nav-label">WORKSPACE</span><nav>${nav.map(([n,i])=>`<button data-page="${n}" class="${page===n?'active':''}">${icon(i)}${n}${n==='Rentals'?`<span class="nav-count">${data?.stats.active ?? '–'}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="demo-status"><span></span><div><strong>${connectionError?'Connection interrupted':'Connected workspace'}</strong><small>${data?'MySQL database records':'Waiting for database'}</small></div></div><button data-page="Settings">${icon('settings')} Settings & help</button><button id="logout">${icon('out')} Sign out</button><div class="operator"><span class="avatar">${escape(initials(user.name))}</span><div><strong>${escape(user.name)}</strong><small>${escape(user.role)}</small></div></div></div></aside><div class="workspace-body"><header class="topbar"><button class="icon-button menu-toggle" id="mobile-menu" aria-label="Toggle navigation">${icon('menu')}</button><div class="breadcrumb">Workspace <span>/</span> <strong>${page}</strong></div><div class="top-actions"><button class="text-button" id="refresh">Refresh</button><button class="icon-button notification" id="notifications" aria-label="View notifications">${icon('bell')}${data?.stats.overdue?'<i></i>':''}</button><span class="avatar small">${escape(initials(user.name))}</span></div></header><main class="content"><div class="page-heading"><div><h1>${page==='Dashboard'?`Let’s make it a good day, ${escape(user.name.split(' ')[0])}`:page}<span class="orange">${page==='Dashboard'?'.':''}</span></h1><p>${page==='Dashboard'?'Here’s what’s happening at Rent & Play today.':'Your Rent & Play operator workspace.'}</p></div><div class="date-label">${icon('clock')} ${new Intl.DateTimeFormat('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date())}</div></div>${connectionError?`<div class="connection-banner" role="alert">${escape(connectionError)}${data?' Showing the last successfully loaded records.':''}</div>`:''}${body}<footer class="content-footer"><span>© ${new Date().getFullYear()} Rent & Play</span><span>${data?`Updated ${new Intl.DateTimeFormat('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}).format(new Date(data.refreshedAt))}`:'Waiting for database'}</span></footer></main></div></div>`;
  const helpPanel=document.querySelector('.help-panel');
  if(helpPanel)helpPanel.insertAdjacentHTML('afterbegin',appearanceSettings());
  bind();updateThemeControls();
}
function bind() {
  if(page==='Inventory' && data)inventoryController.mount(document.querySelector('#inventory-root'),category);
  const themeSwitch=document.querySelector('#dark-mode');
  if(themeSwitch)themeSwitch.onclick=()=>setTheme(theme==='dark'?'light':'dark');
  document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{page=el.dataset.page;category='';filter='All rentals';query='';render();window.scrollTo(0,0);});
  document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=data.categories[Number(el.dataset.category)].name;page='Inventory';render();});
  document.querySelector('#refresh').onclick=refresh;
  document.querySelector('#logout').onclick=async()=>{
    try {await api('/auth/logout',{method:'POST'});user=null;data=null;connectionError='';modal.close();login();}
    catch(error){toast(error.message);}
  };
  configureSidebar();
  document.querySelector('#notifications').onclick=()=>showModal('Rentals needing attention',!data?'<p>Database records are not loaded yet.</p>':`${data.rentals.filter(r=>r.displayStatus==='Overdue').map(r=>`<div class="alert-item">${badge('Overdue')}<h3>${escape(r.item_name)} · ${escape(r.customer)}</h3><p>Due ${escape(formatDate(r.due_at))}</p></div>`).join('')||'<p>No overdue rentals.</p>'}<p>${data.pending.length} request(s) awaiting physical verification.</p>`);
  document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;render();});
  const search=document.querySelector('#rental-search');
  if(search)search.oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;render();const next=document.querySelector('#rental-search');next.focus();next.setSelectionRange(pos,pos);};
  document.querySelectorAll('[data-rental]').forEach(el=>el.onclick=()=>{
    const r=data.rentals.find(r=>String(r.id)===el.dataset.rental);
    showModal('Rental details',`<div class="detail-header"><div><h3>${escape(r.item_name)}</h3><p>${escape(r.rental_code)}</p></div>${badge(r.displayStatus)}</div><dl><dt>Customer</dt><dd>${escape(r.customer)}</dd><dt>Due</dt><dd>${escape(formatDate(r.due_at))}</dd><dt>Rental fee</dt><dd>${money(r.rental_fee)}</dd><dt>Refundable deposit</dt><dd>${money(r.deposit_amount)}</dd><dt>Rental confirmed</dt><dd>${escape(formatDate(r.confirmed_rental_at))}</dd></dl><div class="info-box">Use the mobile QR workflow to request a return, then confirm it at the physical terminal.</div>`);
  });
  const workflow=document.querySelector('#rental-workflow');
  if(workflow)workflow.onclick=()=>showModal('Rental workflow','<p>Use the mobile app to scan the item QR and submit the customer and due date. After backend validation, the request awaits verification at the ESP32 counter terminal.</p><div class="info-box">Verify the equipment and transaction details, then press the physical confirmation button. This dashboard monitors the resulting database records.</div>');
  const select=document.querySelector('#period');if(select)select.onchange=e=>{period=e.target.value;render();};
  const exp=document.querySelector('#export');if(exp)exp.onclick=exportCsv;
}
function exportCsv() {
  const cell=value=>{const v=String(value ?? '');return '"'+(/^[=+@\-\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"';};
  const rows=[['Rental code','Item','Customer','Due (Philippine time)','Status','Rental fee','Deposit'],...data.rentals.map(r=>[r.rental_code,r.item_name,r.customer,r.due_at,r.displayStatus,r.rental_fee,r.deposit_amount])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='rent-and-play-open-rentals.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Rental report downloaded.');
}
async function boot() {
  // Previous demo flags have no authority over the backend session.
  localStorage.removeItem('rent-play-demo');sessionStorage.removeItem('rent-play-demo');
  login();
  try {const result=await api('/auth/me');user=result.user;await refresh();}
  catch(error) {
    if(error.status!==401)login(error.message);
    else try {await api('/health');}catch(healthError){const el=document.querySelector('#login-error');if(el)el.textContent=healthError.message;}
  }
}
const inventoryController=createInventory({api,escape,icon,symbol,badge,stateLabel,formatDate,showModal,modal,toast,refresh});
setInterval(()=>{if(user && !modal.open && document.visibilityState==='visible' && !document.querySelector('#rental-search:focus,#inv-search:focus,.sidebar.open'))refresh();},30000);
boot();
