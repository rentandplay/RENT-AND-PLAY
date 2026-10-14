export const openMaintenanceStatuses = ['OPEN', 'IN_PROGRESS'];
export const isOpenMaintenance = row => openMaintenanceStatuses.includes(String(row?.status || '').toUpperCase());
export const maintenanceStage = row => {
  if (['COMPLETED', 'RETIRED'].includes(String(row?.status || '').toUpperCase())) return String(row.status).toUpperCase();
  return ['REPORTED', 'IN_REPAIR', 'AWAITING_INSPECTION'].includes(row?.workflow_stage)
    ? row.workflow_stage : String(row?.status || '').toUpperCase() === 'OPEN' ? 'REPORTED' : 'IN_REPAIR';
};
export async function unitHasMaintenance(tx, db, itemId) {
  const snapshot = await tx.get(db.collection('maintenance_records').where('item_id', '==', String(itemId)).where('status','in',['OPEN','IN_PROGRESS','open','in_progress']));
  return snapshot.docs.some(doc => isOpenMaintenance(doc.data()));
}
export const healthyUnit = item => {
  const condition = String(item?.condition_status ?? item?.condition ?? '').trim().toUpperCase();
  return !condition || ['GOOD', 'FAIR'].includes(condition);
};
