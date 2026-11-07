import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderRentalNotifications } from '../src/notifications.js';

test('chat notification opens its conversation rather than a rental editor', () => {
  const html = renderRentalNotifications({ notifications: [{ id:'n1', type:'CHAT_MESSAGE', thread_id:'c_1', rental_id:'r1', title:'Support replied', message:'New message', created_at:'2026-11-07' }] }, { escape: x => String(x), formatDate: x => x });
  assert.match(html,/data-notification-chat="c_1"/);
  assert.doesNotMatch(html,/data-notification-rental/);
});

test('support inbox escapes customer content, restores drafts and reuses the same key after an uncertain send', async () => {
  const {window} = parseHTML('<html><body><div id="root"></div></body></html>');
  const storage = new Map([['rental-support-drafts:admin:drafts', JSON.stringify([['c_1','Is it available?']])]]);
  const previous = {window:globalThis.window,document:globalThis.document,sessionStorage:globalThis.sessionStorage};
  globalThis.window=window; globalThis.document=window.document;
  globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const {default: React,createRoot}=await import('../src/react-vendor.js');
  const {MessagesView}=await import('../src/react-ui.js');
  const root=createRoot(document.getElementById('root'));
  const thread={id:'c_1',customer_name:'<script>bad()</script>',subject:'Console inquiry',rental_code:'RN-001',status:'OPEN',unread_count:1,sort_key:'2026-11-07_c_1',updated_at:'2026-11-07T12:00:00Z',customer_read_seq:0};
  const sends=[]; let saved=null;
  const api=async(path,options={})=>{
    if(path.endsWith('/read'))return {thread};
    if(options.method==='POST'){
      const body=JSON.parse(options.body); sends.push(body);
      if(sends.length===1)throw Object.assign(Error('Connection interrupted'),{status:503});
      saved={id:'m1',seq:1,sender_role:'STAFF',sender_id:'admin',sender_name:'Support',text:body.text,created_at:'2026-11-07T12:01:00Z'};
      return {thread,message:saved};
    }
    if(path.includes('/messages'))return {thread,messages:saved?[saved]:[],next_cursor:null};
    return {threads:[thread],next_cursor:null};
  };
  const flush=()=>new Promise(resolve=>setTimeout(resolve,35));
  try{
    root.render(React.createElement(MessagesView,{api,user:{id:'admin'}}));
    for(let n=0;n<30 && !document.querySelector('.support-thread');n++) await flush();
    assert.ok(document.querySelector('.support-thread'));
    assert.equal(document.querySelectorAll('script').length,0);
    document.querySelector('.support-thread').click();await flush();
    assert.equal(document.querySelector('textarea').value,'Is it available?');
    const submit=()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    submit();await flush();assert.match(document.body.textContent,/Connection interrupted/);
    assert.match(document.querySelector('button[type=submit]').textContent,/Retry/);
    submit();await flush();
    assert.equal(sends.length,2);assert.equal(sends[0].requestKey,sends[1].requestKey);
    assert.equal(document.querySelectorAll('.support-bubble').length,1);
    assert.equal(document.querySelector('textarea').value,'');
    assert.deepEqual(JSON.parse(storage.get('rental-support-drafts:admin:pending')),[]);
  }finally{root.unmount();await flush();Object.assign(globalThis,previous);}
});

test.after(() => { for (const handle of process._getActiveHandles?.() ?? []) handle.unref?.(); });
