import type { SelectOptions } from '../../db/types';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { BaseService } from '../base.service';

// =============================================================================
// TYPES
// =============================================================================

export type DeviceType = 'pos' | 'kds' | 'customer_display' | 'printer';

export interface Device {
  id: string;
  account_id: string;
  store_id: string;
  name: string;
  device_type: DeviceType;
  identifier: string | null;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: string | null;
  settings: DeviceSettings | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceSettings {
  // POS settings
  default_payment_type_id?: string;
  auto_print_receipt?: boolean;
  enable_barcode_scanner?: boolean;
  enable_customer_display?: boolean;

  // KDS settings
  station?: string;
  auto_bump_delay_seconds?: number;
  sound_alerts?: boolean;

  // Printer settings
  printer_type?: 'thermal' | 'impact' | 'laser';
  paper_width_mm?: number;
  ip_address?: string;
  port?: number;
  usb_vendor_id?: string;
  usb_product_id?: string;

  // Customer display settings
  display_type?: 'pole' | 'screen';
  resolution?: string;

  // Common settings
  locale?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface CreateDeviceInput {
  account_id: string;
  store_id: string;
  name: string;
  device_type: DeviceType;
  identifier?: string | null;
  settings?: DeviceSettings | null;
}

export interface UpdateDeviceInput extends Partial<Omit<CreateDeviceInput, 'account_id'>> {
  id: string;
  is_active?: boolean;
}

export interface DeviceHeartbeat {
  device_id: string;
  status: 'online' | 'offline';
  metrics?: {
    cpu_usage?: number;
    memory_usage?: number;
    disk_usage?: number;
    battery_level?: number;
  };
}

// =============================================================================
// SERVICE
// =============================================================================

export class DeviceService extends BaseService {
  // ===========================================================================
  // DEVICE CRUD
  // ===========================================================================

  /**
   * Get all devices for an account
   */
  async getDevices(accountId: string, storeId?: string): Promise<Device[]> {
    const where: SelectOptions['where'] = [
      { column: 'account_id', operator: '=' as const, value: accountId }
    ];

    if (storeId) {
      where.push({ column: 'store_id', operator: '=' as const, value: storeId });
    }

    const result = await this.db.select<Device>('devices', {
      where,
      orderBy: [{ column: 'name', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch devices: ${result.error}`);
    }

    // Parse settings JSON
    return (result.data || []).map((d) => ({
      ...d,
      settings: typeof d.settings === 'string' ? JSON.parse(d.settings) : d.settings
    }));
  }

  /**
   * Get a device by ID
   */
  async getDevice(id: string): Promise<Device> {
    const result = await this.db.selectOne<Device>('devices', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Device', id);
    }

    const device = result.data;
    return {
      ...device,
      settings: typeof device.settings === 'string' ? JSON.parse(device.settings) : device.settings
    };
  }

  /**
   * Get a device by identifier (unique hardware ID)
   */
  async getDeviceByIdentifier(identifier: string): Promise<Device | null> {
    const result = await this.db.select<Device>('devices', {
      where: [{ column: 'identifier', operator: '=' as const, value: identifier }],
      limit: 1
    });

    if (result.error) {
      throw new Error(`Failed to fetch device: ${result.error}`);
    }

    const device = result.data?.[0];
    if (!device) return null;

    return {
      ...device,
      settings: typeof device.settings === 'string' ? JSON.parse(device.settings) : device.settings
    };
  }

  /**
   * Get devices by type for a store
   */
  async getDevicesByType(
    accountId: string,
    storeId: string,
    deviceType: DeviceType
  ): Promise<Device[]> {
    const result = await this.db.select<Device>('devices', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'store_id', operator: '=' as const, value: storeId },
        { column: 'device_type', operator: '=' as const, value: deviceType },
        { column: 'is_active', operator: '=' as const, value: true }
      ]
    });

    if (result.error) {
      throw new Error(`Failed to fetch devices: ${result.error}`);
    }

    return (result.data || []).map((d) => ({
      ...d,
      settings: typeof d.settings === 'string' ? JSON.parse(d.settings) : d.settings
    }));
  }

  /**
   * Create a new device
   */
  async createDevice(input: CreateDeviceInput): Promise<Device> {
    // Check for duplicate identifier
    if (input.identifier) {
      const existing = await this.getDeviceByIdentifier(input.identifier);
      if (existing) {
        throw new ConflictError('Device with this identifier already exists');
      }
    }

    const now = new Date().toISOString();
    const device: Partial<Device> = {
      account_id: input.account_id,
      store_id: input.store_id,
      name: input.name,
      device_type: input.device_type,
      identifier: input.identifier || null,
      is_active: true,
      is_online: false,
      last_seen_at: null,
      settings: input.settings ? (JSON.stringify(input.settings) as unknown as DeviceSettings) : null,
      created_at: now,
      updated_at: now
    };

    const result = await this.db.insert<Device>('devices', device);

    if (result.error || !result.data) {
      throw new Error(`Failed to create device: ${result.error}`);
    }

    return {
      ...result.data,
      settings: input.settings || null
    };
  }

  /**
   * Update a device
   */
  async updateDevice(input: UpdateDeviceInput): Promise<Device> {
    const existing = await this.getDevice(input.id);

    // Check for duplicate identifier if changing
    if (input.identifier && input.identifier !== existing.identifier) {
      const duplicate = await this.getDeviceByIdentifier(input.identifier);
      if (duplicate && duplicate.id !== input.id) {
        throw new ConflictError('Device with this identifier already exists');
      }
    }

    const { id, settings, ...updates } = input;
    const updateData: Partial<Device> = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (settings !== undefined) {
      updateData.settings = settings ? (JSON.stringify(settings) as unknown as DeviceSettings) : null;
    }

    const result = await this.db.update<Device>('devices', id, updateData);

    if (result.error || !result.data) {
      throw new Error(`Failed to update device: ${result.error}`);
    }

    return {
      ...result.data,
      settings: settings !== undefined ? settings : existing.settings
    };
  }

  /**
   * Delete a device
   */
  async deleteDevice(id: string): Promise<void> {
    const result = await this.db.delete('devices', id);

    if (result.error) {
      throw new Error(`Failed to delete device: ${result.error}`);
    }
  }

  // ===========================================================================
  // DEVICE STATUS
  // ===========================================================================

  /**
   * Record a device heartbeat (update online status)
   */
  async recordHeartbeat(heartbeat: DeviceHeartbeat): Promise<Device> {
    const now = new Date().toISOString();
    const isOnline = heartbeat.status === 'online';

    const result = await this.db.update<Device>('devices', heartbeat.device_id, {
      is_online: isOnline,
      last_seen_at: now,
      updated_at: now
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to record heartbeat: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Mark devices as offline if no heartbeat received
   */
  async markStaleDevicesOffline(staleThresholdMinutes = 5): Promise<number> {
    const staleTime = new Date(Date.now() - staleThresholdMinutes * 60 * 1000).toISOString();

    const result = await this.db.select<Device>('devices', {
      where: [
        { column: 'is_online', operator: '=' as const, value: true },
        { column: 'last_seen_at', operator: '<' as const, value: staleTime }
      ]
    });

    const staleDevices = result.data || [];
    let count = 0;

    for (const device of staleDevices) {
      await this.db.update('devices', device.id, {
        is_online: false,
        updated_at: new Date().toISOString()
      });
      count++;
    }

    return count;
  }

  /**
   * Get online devices for a store
   */
  async getOnlineDevices(accountId: string, storeId: string): Promise<Device[]> {
    const result = await this.db.select<Device>('devices', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'store_id', operator: '=' as const, value: storeId },
        { column: 'is_online', operator: '=' as const, value: true },
        { column: 'is_active', operator: '=' as const, value: true }
      ]
    });

    if (result.error) {
      throw new Error(`Failed to fetch online devices: ${result.error}`);
    }

    return (result.data || []).map((d) => ({
      ...d,
      settings: typeof d.settings === 'string' ? JSON.parse(d.settings) : d.settings
    }));
  }

  // ===========================================================================
  // DEVICE REGISTRATION
  // ===========================================================================

  /**
   * Register a new device (called by the device itself)
   */
  async registerDevice(
    accountId: string,
    storeId: string,
    identifier: string,
    deviceType: DeviceType,
    name?: string
  ): Promise<Device> {
    // Check if device already exists
    const existing = await this.getDeviceByIdentifier(identifier);
    if (existing) {
      // Update and return existing device
      return this.updateDevice({
        id: existing.id,
        store_id: storeId,
        is_active: true
      });
    }

    // Create new device
    return this.createDevice({
      account_id: accountId,
      store_id: storeId,
      name: name || `${deviceType.toUpperCase()}-${identifier.slice(-6)}`,
      device_type: deviceType,
      identifier
    });
  }

  /**
   * Deactivate a device
   */
  async deactivateDevice(id: string): Promise<Device> {
    return this.updateDevice({
      id,
      is_active: false
    });
  }

  /**
   * Reactivate a device
   */
  async reactivateDevice(id: string): Promise<Device> {
    return this.updateDevice({
      id,
      is_active: true
    });
  }

  // ===========================================================================
  // DEVICE SETTINGS
  // ===========================================================================

  /**
   * Update device settings
   */
  async updateSettings(id: string, settings: Partial<DeviceSettings>): Promise<Device> {
    const device = await this.getDevice(id);
    const mergedSettings = {
      ...(device.settings || {}),
      ...settings
    };

    return this.updateDevice({
      id,
      settings: mergedSettings
    });
  }

  /**
   * Get printers for a store
   */
  async getPrinters(accountId: string, storeId: string): Promise<Device[]> {
    return this.getDevicesByType(accountId, storeId, 'printer');
  }

  /**
   * Get KDS displays for a store
   */
  async getKdsDisplays(accountId: string, storeId: string): Promise<Device[]> {
    return this.getDevicesByType(accountId, storeId, 'kds');
  }
}
