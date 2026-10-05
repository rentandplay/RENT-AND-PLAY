export const auditFields = (record, fields) => Object.fromEntries(fields.filter(key => record?.[key] !== undefined).map(key => [key, record[key]]));

// Commit the activity entry with the change so failed saves cannot leave misleading history.
export function stageAudit(writer, db, actor, action, entityType, entityId, { before = null, after = null, now = new Date() } = {}) {
  if (!actor) throw new Error('An authenticated actor is required for audit logging.');
  writer.create(db.collection('audit_logs').doc(), {
    user_id: String(actor), actor_type: 'USER', action, entity_type: entityType, entity_id: String(entityId),
    old_values: before, new_values: after, created_at: now
  });
}
