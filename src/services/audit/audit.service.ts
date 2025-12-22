import type { SelectOptions } from '../../db/types';
import { BaseService } from '../base.service';

// =============================================================================
// TYPES
// =============================================================================

export type ActorType = 'user' | 'employee' | 'system' | 'api';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'payment_processed'
  | 'payment_failed'
  | 'refund_processed'
  | 'order_completed'
  | 'order_cancelled'
  | 'inventory_adjusted'
  | 'shift_opened'
  | 'shift_closed'
  | 'cash_drawer_opened'
  | 'export_data'
  | 'settings_changed'
  | 'permission_changed'
  | 'price_override'
  | 'discount_applied'
  | 'void_item'
  | 'fiscal_document_created'
  | 'gdpr_consent_granted'
  | 'gdpr_consent_revoked'
  | 'gdpr_data_deleted';

export interface AuditLog {
  id: string;
  account_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface CreateAuditLogInput {
  account_id: string;
  actor_type: ActorType;
  actor_id?: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AuditSearchInput {
  account_id: string;
  actor_type?: ActorType;
  actor_id?: string;
  action?: AuditAction;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class AuditService extends BaseService {
  // ===========================================================================
  // AUDIT LOGGING
  // ===========================================================================

  /**
   * Create an audit log entry
   * This is the main method for logging auditable events
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    const log: Partial<AuditLog> = {
      account_id: input.account_id,
      actor_type: input.actor_type,
      actor_id: input.actor_id || null,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id || null,
      old_data: input.old_data || null,
      new_data: input.new_data || null,
      metadata: input.metadata || {},
      ip_address: input.ip_address || null,
      user_agent: input.user_agent || null,
      created_at: new Date().toISOString()
    };

    const result = await this.db.insert<AuditLog>('audit_logs', log);

    if (result.error || !result.data) {
      // Don't throw - audit logging should not break the application
      console.error(`Failed to create audit log: ${result.error}`);
      return log as AuditLog;
    }

    return result.data;
  }

  /**
   * Search audit logs with filters
   */
  async search(input: AuditSearchInput): Promise<{ logs: AuditLog[]; total: number }> {
    const where: Array<{ column: string; operator: string; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.actor_type) {
      where.push({ column: 'actor_type', operator: '=' as const, value: input.actor_type });
    }
    if (input.actor_id) {
      where.push({ column: 'actor_id', operator: '=' as const, value: input.actor_id });
    }
    if (input.action) {
      where.push({ column: 'action', operator: '=' as const, value: input.action });
    }
    if (input.resource_type) {
      where.push({ column: 'resource_type', operator: '=' as const, value: input.resource_type });
    }
    if (input.resource_id) {
      where.push({ column: 'resource_id', operator: '=' as const, value: input.resource_id });
    }
    if (input.from_date) {
      where.push({ column: 'created_at', operator: '>=' as const, value: input.from_date });
    }
    if (input.to_date) {
      where.push({ column: 'created_at', operator: '<=' as const, value: input.to_date });
    }

    const result = await this.db.select<AuditLog>('audit_logs', {
      where: where as SelectOptions['where'],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      limit: input.limit || 50,
      offset: input.offset || 0
    });

    if (result.error) {
      throw new Error(`Failed to search audit logs: ${result.error}`);
    }

    return {
      logs: result.data || [],
      total: result.count || 0
    };
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceHistory(
    accountId: string,
    resourceType: string,
    resourceId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    const result = await this.db.select<AuditLog>('audit_logs', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'resource_type', operator: '=' as const, value: resourceType },
        { column: 'resource_id', operator: '=' as const, value: resourceId }
      ],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      limit
    });

    if (result.error) {
      throw new Error(`Failed to fetch resource history: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Get audit logs for a specific actor (user/employee)
   */
  async getActorHistory(
    accountId: string,
    actorType: ActorType,
    actorId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    const result = await this.db.select<AuditLog>('audit_logs', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'actor_type', operator: '=' as const, value: actorType },
        { column: 'actor_id', operator: '=' as const, value: actorId }
      ],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      limit
    });

    if (result.error) {
      throw new Error(`Failed to fetch actor history: ${result.error}`);
    }

    return result.data || [];
  }

  // ===========================================================================
  // CONVENIENCE METHODS
  // ===========================================================================

  /**
   * Log a resource creation
   */
  async logCreate(
    accountId: string,
    actorType: ActorType,
    actorId: string | null,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    request?: { ip?: string; userAgent?: string }
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: actorType,
      actor_id: actorId,
      action: 'create',
      resource_type: resourceType,
      resource_id: resourceId,
      new_data: this.sanitizeData(data),
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  /**
   * Log a resource update
   */
  async logUpdate(
    accountId: string,
    actorType: ActorType,
    actorId: string | null,
    resourceType: string,
    resourceId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    request?: { ip?: string; userAgent?: string }
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: actorType,
      actor_id: actorId,
      action: 'update',
      resource_type: resourceType,
      resource_id: resourceId,
      old_data: this.sanitizeData(oldData),
      new_data: this.sanitizeData(newData),
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  /**
   * Log a resource deletion
   */
  async logDelete(
    accountId: string,
    actorType: ActorType,
    actorId: string | null,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    request?: { ip?: string; userAgent?: string }
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: actorType,
      actor_id: actorId,
      action: 'delete',
      resource_type: resourceType,
      resource_id: resourceId,
      old_data: this.sanitizeData(data),
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  /**
   * Log a login attempt
   */
  async logLogin(
    accountId: string,
    actorType: ActorType,
    actorId: string,
    success: boolean,
    request?: { ip?: string; userAgent?: string },
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: actorType,
      actor_id: actorId,
      action: success ? 'login' : 'login_failed',
      resource_type: actorType,
      resource_id: actorId,
      metadata: metadata || {},
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  /**
   * Log a payment event
   */
  async logPayment(
    accountId: string,
    actorType: ActorType,
    actorId: string | null,
    orderId: string,
    paymentId: string,
    success: boolean,
    data: Record<string, unknown>,
    request?: { ip?: string; userAgent?: string }
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: actorType,
      actor_id: actorId,
      action: success ? 'payment_processed' : 'payment_failed',
      resource_type: 'payment',
      resource_id: paymentId,
      new_data: this.sanitizeData(data),
      metadata: { order_id: orderId },
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  /**
   * Log GDPR-related events
   */
  async logGdprEvent(
    accountId: string,
    customerId: string,
    action: 'gdpr_consent_granted' | 'gdpr_consent_revoked' | 'gdpr_data_deleted',
    details: Record<string, unknown>,
    request?: { ip?: string; userAgent?: string }
  ): Promise<AuditLog> {
    return this.log({
      account_id: accountId,
      actor_type: 'system',
      action,
      resource_type: 'customer',
      resource_id: customerId,
      new_data: details,
      ip_address: request?.ip || null,
      user_agent: request?.userAgent || null
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Remove sensitive data from audit logs
   */
  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveFields = [
      'password',
      'pin',
      'pin_hash',
      'token',
      'secret',
      'api_key',
      'credit_card',
      'card_number',
      'cvv',
      'ssn'
    ];

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Get summary statistics for audit logs
   */
  async getStats(
    accountId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    total_events: number;
    events_by_action: Record<string, number>;
    events_by_resource: Record<string, number>;
    events_by_actor_type: Record<string, number>;
  }> {
    // This would ideally be done with SQL aggregation
    // For now, we fetch and aggregate in code
    const result = await this.db.select<AuditLog>('audit_logs', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'created_at', operator: '>=' as const, value: fromDate },
        { column: 'created_at', operator: '<=' as const, value: toDate }
      ]
    });

    const logs = result.data || [];
    const eventsByAction: Record<string, number> = {};
    const eventsByResource: Record<string, number> = {};
    const eventsByActorType: Record<string, number> = {};

    for (const log of logs) {
      eventsByAction[log.action] = (eventsByAction[log.action] || 0) + 1;
      eventsByResource[log.resource_type] = (eventsByResource[log.resource_type] || 0) + 1;
      eventsByActorType[log.actor_type] = (eventsByActorType[log.actor_type] || 0) + 1;
    }

    return {
      total_events: logs.length,
      events_by_action: eventsByAction,
      events_by_resource: eventsByResource,
      events_by_actor_type: eventsByActorType
    };
  }
}
