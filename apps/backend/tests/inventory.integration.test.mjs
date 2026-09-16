import test from 'node:test';
import assert from 'node:assert/strict';
import {connection,pool} from '../src/db.mjs';
import {createItem,updateItem,itemAction,inventoryDetail,inventoryQr} from '../src/inventory.mjs';
test('MySQL inventory writes preserve QR and pricing history, validate maintenance, archive and restore atomically',{skip:!process.env.DB_PASSWORD},async()=>{
  const db=await connection();const commit=db.commit.bind(db),rollback=db.rollback.bind(db),begin=db.beginTransaction.bind(db);
  await begin();
  db.beginTransaction=()=>db.query('SAVEPOINT inventory_test');db.commit=()=>db.query('RELEASE SAVEPOINT inventory_test');db.rollback=()=>db.query('ROLLBACK TO SAVEPOINT inventory_test');
  try {
    const [[actor]]=await db.query("SELECT id FROM users WHERE is_active=1 AND role IN ('OWNER','ADMIN') LIMIT 1");const [[category]]=await db.query('SELECT id FROM item_categories LIMIT 1');assert.ok(actor&&category);
    const payload={code:'QA-'+Date.now(),categoryId:String(category.id),name:'Transactional inventory verification',condition:'GOOD',rateType:'DAILY',rentalRate:50.25,deposit:100,latePenalty:5};
    const {id}=await createItem(db,actor.id,payload);let detail=await inventoryDetail(db,id);const token=detail.item.qr_token;
    assert.equal(detail.item.status,'AVAILABLE');assert.equal(detail.item.rental_rate,50.25);assert.equal(detail.history.length,1);
    await assert.rejects(createItem(db,actor.id,payload),err=>err.status===409);
    await assert.rejects(updateItem(db,actor.id,id,{...payload,version:'stale'}),err=>err.status===409);
    await updateItem(db,actor.id,id,{...payload,name:'Updated equipment',rentalRate:75.50,version:detail.item.updated_at});detail=await inventoryDetail(db,id);
    assert.equal(detail.item.rental_rate,75.50);assert.equal(detail.item.qr_token,token);assert.equal(detail.rates.length,2);assert.equal(Number(detail.rates[1].is_active),0);
    const qr=await inventoryQr(db,id);assert.ok(qr.svg.includes('<svg'));assert.equal(qr.token,token);
    const [customer]=await db.execute('INSERT INTO customers(customer_code,full_name) VALUES(?,?)',[payload.code,'Transactional QA customer']);
    const [rental]=await db.execute("INSERT INTO rentals(rental_code,customer_id,item_id,created_by,status,due_at,rate_type_snapshot,rental_rate_snapshot) VALUES(?,?,?,?,'PENDING_VERIFICATION',DATE_ADD(NOW(3),INTERVAL 1 DAY),'DAILY',75.50)",[payload.code,customer.insertId,id,actor.id]);
    detail=await inventoryDetail(db,id);assert.equal(Number(detail.item.open_rentals),1);
    await assert.rejects(itemAction(db,actor.id,id,{action:'archive',version:detail.item.updated_at}),err=>err.status===409);
    await assert.rejects(itemAction(db,actor.id,id,{action:'maintenance',reason:'Inspection',condition:'GOOD',version:detail.item.updated_at}),err=>err.status===409);
    await updateItem(db,actor.id,id,{...payload,rentalRate:85,version:detail.item.updated_at});
    const [[snapshot]]=await db.execute('SELECT rental_rate_snapshot FROM rentals WHERE id=?',[rental.insertId]);assert.equal(snapshot.rental_rate_snapshot,75.50);
    await db.execute("UPDATE rentals SET status='CANCELLED' WHERE id=?",[rental.insertId]);detail=await inventoryDetail(db,id);
    await itemAction(db,actor.id,id,{action:'maintenance',reason:'Inspect surface damage',condition:'DAMAGED',version:detail.item.updated_at});detail=await inventoryDetail(db,id);
    assert.equal(detail.item.status,'UNDER_MAINTENANCE');assert.equal(detail.maintenance[0].status,'IN_PROGRESS');
    await assert.rejects(itemAction(db,actor.id,id,{action:'archive',version:detail.item.updated_at}),err=>err.status===409);
    await assert.rejects(itemAction(db,actor.id,id,{action:'complete-maintenance',reason:'Still damaged',condition:'DAMAGED',version:detail.item.updated_at}),err=>err.status===400);
    await itemAction(db,actor.id,id,{action:'complete-maintenance',reason:'Repaired and inspected',condition:'GOOD',version:detail.item.updated_at});detail=await inventoryDetail(db,id);
    assert.equal(detail.item.status,'AVAILABLE');assert.equal(detail.maintenance[0].status,'COMPLETED');assert.equal(detail.maintenance[0].details,'Repaired and inspected');
    await itemAction(db,actor.id,id,{action:'archive',version:detail.item.updated_at});detail=await inventoryDetail(db,id);assert.equal(detail.item.is_active,0);
    await itemAction(db,actor.id,id,{action:'restore',version:detail.item.updated_at});detail=await inventoryDetail(db,id);assert.equal(detail.item.status,'AVAILABLE');assert.equal(detail.item.is_active,1);assert.equal(detail.item.qr_token,token);
    await db.execute("UPDATE items SET status='RENTED' WHERE id=?",[id]);detail=await inventoryDetail(db,id);
    await assert.rejects(itemAction(db,actor.id,id,{action:'archive',version:detail.item.updated_at}),err=>err.status===409);
    const [[audit]]=await db.execute("SELECT COUNT(*) n FROM audit_logs WHERE entity_type='ITEM' AND entity_id=?",[id]);assert.equal(Number(audit.n),7);
  } finally {db.beginTransaction=begin;db.commit=commit;db.rollback=rollback;await rollback();db.release();await pool.end();}
});
