import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsDefinitions,renderAnalyticsReport} from '../src/analytics-report.js';

const helpers={
  escape:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  paged:rows=>({rows:rows.slice(0,5),footer:'<footer>Pagination</footer>'}),
  table:(headers,rows)=>`<table><thead>${headers.join('|')}</thead><tbody>${rows}</tbody></table>`
};
const view={sort:'rentals',details:{}};
const selection={period:'custom',from:'2020-01-01',to:'2020-02-29',groupBy:'monthly',categoryId:'',itemId:''};

test('report renders all 14 definitions and safe empty states',()=>{
  const html=renderAnalyticsReport({},selection,view,helpers);
  assert.equal(analyticsDefinitions.length,14);
  for(const [name] of analyticsDefinitions)assert.ok(html.includes(name),name);
  assert.ok(html.includes('No timed confirmations yet'));
  assert.ok(html.includes('No confirmed rentals'));
  assert.ok(!html.includes('NaN'));
  assert.ok(html.includes('Export analytics CSV'));
});

test('equipment labels are escaped and monthly charts do not duplicate two-bucket labels',()=>{
  const model={
    items:[{id:'i',name:'<script>unsafe</script>',item_code:'E-1',created_at:'2019-01-01',is_active:true}],
    transactions:[{id:'r',item_id:'i',status:'COMPLETED',rental_fee:100,confirmed_rental_at:'2020-01-05',confirmed_return_at:'2020-01-06',due_at:'2020-01-07'}]
  };
  const html=renderAnalyticsReport(model,selection,view,helpers);
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!html.includes('<script>unsafe</script>'));
  assert.ok(html.includes('1 rental<small>'));
  assert.ok(!html.includes('1 rentals<small>'));
  assert.equal((html.match(/<div class="analytics-chart-labels"><span>Jan 2020<\/span><span>Feb 2020<\/span><\/div>/g)||[]).length,2);
});

test('invalid date ranges keep filters available and disable export',()=>{
  const html=renderAnalyticsReport({},{...selection,from:'2020-02-31'},view,helpers);
  assert.ok(html.includes('id="report-export" disabled'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes('analytics-kpis'));
});
