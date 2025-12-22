import type { SelectOptions } from '../../db/types';
import { config, type Region } from '../../config/env';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Fiscal document types by region:
 * - e_fatura: Turkey e-Invoice (B2B)
 * - e_arsiv: Turkey e-Archive (B2C)
 * - tse: Germany Technical Security Device
 * - nf525: France NF525 certification
 * - sii: Spain Immediate Supply of Information
 * - saft: Portugal Standard Audit File
 * - rt: Italy Registratore Telematico
 */
export type FiscalType = 'e_fatura' | 'e_arsiv' | 'tse' | 'nf525' | 'sii' | 'saft' | 'rt';

export type FiscalStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface FiscalRecord {
  id: string;
  account_id: string;
  store_id: string;
  order_id: string;
  fiscal_type: FiscalType;
  fiscal_number: string | null;
  fiscal_status: FiscalStatus;
  fiscal_data: FiscalDocumentData;
  response_data: Record<string, unknown> | null;
  submitted_at: string | null;
  approved_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface FiscalDocumentData {
  // Common fields
  receipt_number: string;
  receipt_date: string;
  total_cents: number;
  tax_cents: number;
  currency: string;

  // Seller info
  seller_name: string;
  seller_tax_id: string;
  seller_address: string;

  // Buyer info (for B2B)
  buyer_name?: string;
  buyer_tax_id?: string;
  buyer_address?: string;

  // Line items
  items: FiscalLineItem[];

  // Tax breakdown
  tax_breakdown: FiscalTaxBreakdown[];

  // Payment info
  payment_method: string;
  payment_reference?: string;

  // Region-specific
  region_data?: Record<string, unknown>;
}

export interface FiscalLineItem {
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  tax_rate_percent: number;
  tax_cents: number;
}

export interface FiscalTaxBreakdown {
  tax_name: string;
  tax_rate_percent: number;
  taxable_amount_cents: number;
  tax_amount_cents: number;
}

export interface CreateFiscalRecordInput {
  account_id: string;
  store_id: string;
  order_id: string;
  fiscal_type: FiscalType;
  fiscal_data: FiscalDocumentData;
}

// Turkey-specific types
export interface TurkeyFiscalConfig {
  gib_username: string;
  gib_password: string;
  integrator_id: string;
  okc_serial?: string; // ÖKC device serial
}

// EU-specific types
export interface EuFiscalConfig {
  tse_id?: string; // Germany TSE ID
  tse_api_key?: string;
  sii_certificate?: string; // Spain
  saft_token?: string; // Portugal
}

// =============================================================================
// SERVICE
// =============================================================================

export class FiscalService extends BaseService {
  // ===========================================================================
  // FISCAL RECORD CRUD
  // ===========================================================================

  /**
   * Get a fiscal record by ID
   */
  async getFiscalRecord(id: string): Promise<FiscalRecord> {
    const result = await this.db.selectOne<FiscalRecord>('fiscal_records', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Fiscal record', id);
    }

    return this.parseFiscalRecord(result.data);
  }

  /**
   * Get fiscal record for an order
   */
  async getFiscalRecordByOrder(orderId: string): Promise<FiscalRecord | null> {
    const result = await this.db.select<FiscalRecord>('fiscal_records', {
      where: [{ column: 'order_id', operator: '=' as const, value: orderId }],
      limit: 1
    });

    if (result.error) {
      throw new Error(`Failed to fetch fiscal record: ${result.error}`);
    }

    const record = result.data?.[0];
    return record ? this.parseFiscalRecord(record) : null;
  }

  /**
   * Get pending fiscal records for processing
   */
  async getPendingRecords(accountId: string, limit = 50): Promise<FiscalRecord[]> {
    const result = await this.db.select<FiscalRecord>('fiscal_records', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'fiscal_status', operator: '=' as const, value: 'pending' }
      ],
      orderBy: [{ column: 'created_at', direction: 'asc' as const }],
      limit
    });

    if (result.error) {
      throw new Error(`Failed to fetch pending fiscal records: ${result.error}`);
    }

    return (result.data || []).map((r) => this.parseFiscalRecord(r));
  }

  /**
   * Create a fiscal record
   */
  async createFiscalRecord(input: CreateFiscalRecordInput): Promise<FiscalRecord> {
    const now = new Date().toISOString();
    const record: Partial<FiscalRecord> = {
      account_id: input.account_id,
      store_id: input.store_id,
      order_id: input.order_id,
      fiscal_type: input.fiscal_type,
      fiscal_number: null,
      fiscal_status: 'pending',
      fiscal_data: JSON.stringify(input.fiscal_data) as unknown as FiscalDocumentData,
      response_data: null,
      submitted_at: null,
      approved_at: null,
      error_message: null,
      retry_count: 0,
      created_at: now,
      updated_at: now
    };

    const result = await this.db.insert<FiscalRecord>('fiscal_records', record);

    if (result.error || !result.data) {
      throw new Error(`Failed to create fiscal record: ${result.error}`);
    }

    return this.parseFiscalRecord(result.data);
  }

  /**
   * Update fiscal record status
   */
  async updateFiscalStatus(
    id: string,
    status: FiscalStatus,
    fiscalNumber?: string,
    responseData?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<FiscalRecord> {
    const now = new Date().toISOString();
    const updates: Partial<FiscalRecord> = {
      fiscal_status: status,
      updated_at: now
    };

    if (fiscalNumber) {
      updates.fiscal_number = fiscalNumber;
    }

    if (responseData) {
      updates.response_data = JSON.stringify(responseData) as unknown as Record<string, unknown>;
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    if (status === 'submitted') {
      updates.submitted_at = now;
    }

    if (status === 'approved') {
      updates.approved_at = now;
    }

    const result = await this.db.update<FiscalRecord>('fiscal_records', id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update fiscal record: ${result.error}`);
    }

    return this.parseFiscalRecord(result.data);
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(id: string, errorMessage: string): Promise<FiscalRecord> {
    const record = await this.getFiscalRecord(id);

    const result = await this.db.update<FiscalRecord>('fiscal_records', id, {
      retry_count: record.retry_count + 1,
      error_message: errorMessage,
      updated_at: new Date().toISOString()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to update fiscal record: ${result.error}`);
    }

    return this.parseFiscalRecord(result.data);
  }

  // ===========================================================================
  // FISCAL TYPE DETERMINATION
  // ===========================================================================

  /**
   * Determine the appropriate fiscal type based on region and transaction
   */
  determineFiscalType(region: Region, isB2B: boolean): FiscalType {
    switch (region) {
      case 'TR':
        return isB2B ? 'e_fatura' : 'e_arsiv';
      case 'EU':
        // Default to most common - would need country-specific logic
        return 'tse';
      default:
        // US doesn't require fiscal documents at federal level
        throw new ValidationError('Fiscal documents not required for this region');
    }
  }

  /**
   * Check if fiscal documentation is required
   */
  isFiscalRequired(region: Region): boolean {
    return region === 'TR' || region === 'EU';
  }

  // ===========================================================================
  // TURKEY (e-Fatura / e-Arsiv)
  // ===========================================================================

  /**
   * Generate e-Fatura/e-Arsiv for Turkey
   * In production, this would integrate with GIB (Gelir Idaresi Baskanligi)
   */
  async generateTurkeyFiscal(
    orderId: string,
    fiscalData: FiscalDocumentData,
    isB2B: boolean
  ): Promise<FiscalRecord> {
    const fiscalType = isB2B ? 'e_fatura' : 'e_arsiv';

    // Add Turkey-specific data
    const turkeyData: FiscalDocumentData = {
      ...fiscalData,
      region_data: {
        country: 'TR',
        vkn: fiscalData.buyer_tax_id, // Vergi Kimlik Numarası
        tckn: !isB2B ? fiscalData.buyer_tax_id : undefined, // TC Kimlik (for individuals)
        kdv_rates: fiscalData.tax_breakdown.map((t) => ({
          rate: t.tax_rate_percent,
          base: t.taxable_amount_cents,
          tax: t.tax_amount_cents
        }))
      }
    };

    // Create record
    const record = await this.createFiscalRecord({
      account_id: turkeyData.region_data.account_id as string || '',
      store_id: turkeyData.region_data.store_id as string || '',
      order_id: orderId,
      fiscal_type: fiscalType,
      fiscal_data: turkeyData
    });

    // In production: Submit to GIB via integrator
    // For now, simulate submission
    const fiscalNumber = this.generateTurkeyFiscalNumber(fiscalType);

    return this.updateFiscalStatus(record.id, 'approved', fiscalNumber, {
      gib_response: 'SIMULATED',
      ettn: fiscalNumber
    });
  }

  /**
   * Generate Turkey fiscal number (ETTN format)
   */
  private generateTurkeyFiscalNumber(type: FiscalType): string {
    const prefix = type === 'e_fatura' ? 'EFA' : 'EAR';
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `${prefix}${year}${random}`;
  }

  // ===========================================================================
  // EU FISCALIZATION
  // ===========================================================================

  /**
   * Generate EU fiscal document (stub for different countries)
   */
  async generateEuFiscal(
    orderId: string,
    fiscalData: FiscalDocumentData,
    country: string
  ): Promise<FiscalRecord> {
    let fiscalType: FiscalType;

    switch (country.toUpperCase()) {
      case 'DE':
        fiscalType = 'tse';
        break;
      case 'FR':
        fiscalType = 'nf525';
        break;
      case 'ES':
        fiscalType = 'sii';
        break;
      case 'PT':
        fiscalType = 'saft';
        break;
      case 'IT':
        fiscalType = 'rt';
        break;
      default:
        throw new ValidationError(`Unsupported EU country for fiscalization: ${country}`);
    }

    const euData: FiscalDocumentData = {
      ...fiscalData,
      region_data: {
        country,
        eu_vat_number: fiscalData.buyer_tax_id
      }
    };

    const record = await this.createFiscalRecord({
      account_id: euData.region_data.account_id as string || '',
      store_id: euData.region_data.store_id as string || '',
      order_id: orderId,
      fiscal_type: fiscalType,
      fiscal_data: euData
    });

    // In production: Submit to country-specific system
    const fiscalNumber = this.generateEuFiscalNumber(fiscalType, country);

    return this.updateFiscalStatus(record.id, 'approved', fiscalNumber, {
      eu_response: 'SIMULATED',
      document_id: fiscalNumber
    });
  }

  /**
   * Generate EU fiscal number
   */
  private generateEuFiscalNumber(type: FiscalType, country: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${country}-${type.toUpperCase()}-${timestamp}`;
  }

  // ===========================================================================
  // Z-REPORT (End of Day)
  // ===========================================================================

  /**
   * Generate Z-Report data (Turkey requirement)
   */
  async generateZReport(
    accountId: string,
    storeId: string,
    shiftId: string,
    date: string
  ): Promise<{
    report_number: string;
    date: string;
    totals: {
      gross_sales_cents: number;
      net_sales_cents: number;
      tax_collected_cents: number;
      refunds_cents: number;
      discounts_cents: number;
      cash_total_cents: number;
      card_total_cents: number;
      transaction_count: number;
    };
    tax_breakdown: FiscalTaxBreakdown[];
  }> {
    // This would aggregate all fiscal records for the day
    // For now, return stub data
    const reportNumber = `Z${date.replace(/-/g, '')}-${storeId.slice(-4)}`;

    return {
      report_number: reportNumber,
      date,
      totals: {
        gross_sales_cents: 0,
        net_sales_cents: 0,
        tax_collected_cents: 0,
        refunds_cents: 0,
        discounts_cents: 0,
        cash_total_cents: 0,
        card_total_cents: 0,
        transaction_count: 0
      },
      tax_breakdown: []
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Parse fiscal record from database
   */
  private parseFiscalRecord(record: FiscalRecord): FiscalRecord {
    return {
      ...record,
      fiscal_data:
        typeof record.fiscal_data === 'string'
          ? JSON.parse(record.fiscal_data)
          : record.fiscal_data,
      response_data:
        typeof record.response_data === 'string'
          ? JSON.parse(record.response_data)
          : record.response_data
    };
  }

  /**
   * Validate fiscal data completeness
   */
  validateFiscalData(data: FiscalDocumentData, fiscalType: FiscalType): void {
    const requiredFields = [
      'receipt_number',
      'receipt_date',
      'total_cents',
      'seller_name',
      'seller_tax_id'
    ];

    for (const field of requiredFields) {
      if (!(field in data) || data[field as keyof FiscalDocumentData] === undefined) {
        throw new ValidationError(`Missing required fiscal field: ${field}`);
      }
    }

    // B2B invoices require buyer info
    if (fiscalType === 'e_fatura' || fiscalType === 'sii') {
      if (!data.buyer_tax_id) {
        throw new ValidationError('B2B fiscal documents require buyer tax ID');
      }
    }
  }
}
