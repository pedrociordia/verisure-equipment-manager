import { supabase } from '@/lib/backend';
import { logger } from '@/lib/logger';

/**
 * Log an audit event for privileged actions.
 * Fails silently in production — audit logging should never block business operations.
 * Surfaces errors in dev mode for debugging.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.warn('[audit] No user session — skipping audit log for', action);
      return;
    }

    const { error } = await supabase.from('audit_logs').insert([{
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload: (payload ?? {}) as any,
      actor_user_id: user.id,
    }]);

    if (error) {
      logger.error('[audit] Failed to insert audit log:', error.message, { action, entityType, entityId });
    }
  } catch (err) {
    logger.error('[audit] Unexpected error:', err);
  }
}
