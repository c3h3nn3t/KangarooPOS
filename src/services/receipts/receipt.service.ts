import type { SelectOptions } from '../../db/types';
import { config, CURRENCY_CONFIG, type Currency } from '../../config/env';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';

// =============================================================================
// TYPES
// =============================================================================

export interface ReceiptTemplate {
  id: string;
  account_id: string;
  store_id: string | null;
  name: string;
  is_default: boolean;
  header_text: string | null;
  footer_text: string | null;
  show_logo: boolean;
  show_tax_breakdown: boolean;
  show_barcode: boolean;
  custom_css: string | null;
  template_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  modifiers?: Array<{ name: string; price_cents: number }>;
  notes?: string;
}

export interface TaxBreakdown {
  name: string;
  rate_percent: number;
  amount_cents: number;
}

export interface ReceiptData {
  receipt_number: string;
  order_id: string;
  store_name: string;
  store_address?: string;
  store_phone?: string;
  employee_name?: string;
  customer_name?: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tax_breakdown?: TaxBreakdown[];
  tip_cents: number;
  total_cents: number;
  currency: Currency;
  payment_method: string;
  payment_reference?: string;
  created_at: string;
  fiscal_number?: string;
}

export interface CreateTemplateInput {
  account_id: string;
  store_id?: string | null;
  name: string;
  is_default?: boolean;
  header_text?: string | null;
  footer_text?: string | null;
  show_logo?: boolean;
  show_tax_breakdown?: boolean;
  show_barcode?: boolean;
  custom_css?: string | null;
  template_data?: Record<string, unknown> | null;
}

export interface UpdateTemplateInput extends Partial<Omit<CreateTemplateInput, 'account_id'>> {
  id: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ReceiptService extends BaseService {
  // ===========================================================================
  // TEMPLATES
  // ===========================================================================

  /**
   * Get all receipt templates for an account
   */
  async getTemplates(accountId: string, storeId?: string): Promise<ReceiptTemplate[]> {
    const where = [{ column: 'account_id', operator: '=' as const, value: accountId }];

    if (storeId) {
      where.push({ column: 'store_id', operator: '=' as const, value: storeId });
    }

    const result = await this.db.select<ReceiptTemplate>('receipt_templates', { where });

    if (result.error) {
      throw new Error(`Failed to fetch receipt templates: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Get a receipt template by ID
   */
  async getTemplate(id: string): Promise<ReceiptTemplate> {
    const result = await this.db.selectOne<ReceiptTemplate>('receipt_templates', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Receipt template', id);
    }

    return result.data;
  }

  /**
   * Get the default template for a store (or account default)
   */
  async getDefaultTemplate(accountId: string, storeId?: string): Promise<ReceiptTemplate | null> {
    // First try to find store-specific default
    if (storeId) {
      const storeResult = await this.db.select<ReceiptTemplate>('receipt_templates', {
        where: [
          { column: 'account_id', operator: '=' as const, value: accountId },
          { column: 'store_id', operator: '=' as const, value: storeId },
          { column: 'is_default', operator: '=' as const, value: true }
        ],
        limit: 1
      });

      if (storeResult.data && storeResult.data.length > 0) {
        return storeResult.data[0];
      }
    }

    // Fall back to account default (store_id is null)
    const accountResult = await this.db.select<ReceiptTemplate>('receipt_templates', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'is_default', operator: '=' as const, value: true }
      ],
      limit: 1
    });

    return accountResult.data?.[0] || null;
  }

  /**
   * Create a new receipt template
   */
  async createTemplate(input: CreateTemplateInput): Promise<ReceiptTemplate> {
    // If this is set as default, unset other defaults
    if (input.is_default) {
      await this.unsetDefaultTemplates(input.account_id, input.store_id || undefined);
    }

    const now = new Date().toISOString();
    const template: Partial<ReceiptTemplate> = {
      ...input,
      is_default: input.is_default ?? false,
      show_logo: input.show_logo ?? true,
      show_tax_breakdown: input.show_tax_breakdown ?? true,
      show_barcode: input.show_barcode ?? false,
      created_at: now,
      updated_at: now
    };

    const result = await this.db.insert<ReceiptTemplate>('receipt_templates', template);

    if (result.error || !result.data) {
      throw new Error(`Failed to create receipt template: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Update a receipt template
   */
  async updateTemplate(input: UpdateTemplateInput): Promise<ReceiptTemplate> {
    const existing = await this.getTemplate(input.id);

    // If setting as default, unset other defaults
    if (input.is_default && !existing.is_default) {
      await this.unsetDefaultTemplates(existing.account_id, existing.store_id || undefined);
    }

    const { id, ...updates } = input;
    const result = await this.db.update<ReceiptTemplate>('receipt_templates', id, {
      ...updates,
      updated_at: new Date().toISOString()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to update receipt template: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Delete a receipt template
   */
  async deleteTemplate(id: string): Promise<void> {
    const result = await this.db.delete('receipt_templates', id);

    if (result.error) {
      throw new Error(`Failed to delete receipt template: ${result.error}`);
    }
  }

  /**
   * Unset default flag on all templates for an account/store
   */
  private async unsetDefaultTemplates(accountId: string, storeId?: string): Promise<void> {
    const templates = await this.getTemplates(accountId, storeId);
    const defaults = templates.filter((t) => t.is_default);

    for (const template of defaults) {
      await this.db.update('receipt_templates', template.id, {
        is_default: false,
        updated_at: new Date().toISOString()
      });
    }
  }

  // ===========================================================================
  // RECEIPT GENERATION
  // ===========================================================================

  /**
   * Format currency amount for display
   */
  formatCurrency(cents: number, currency: Currency = config.region.currency): string {
    const currencyConfig = CURRENCY_CONFIG[currency];
    const amount = (cents / 100).toFixed(currencyConfig.decimals);

    // Format with locale-specific thousand separators
    const locale = config.region.locale;
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: currencyConfig.decimals,
      maximumFractionDigits: currencyConfig.decimals
    }).format(parseFloat(amount));

    return currencyConfig.symbolPosition === 'before'
      ? `${currencyConfig.symbol}${formatted}`
      : `${formatted}${currencyConfig.symbol}`;
  }

  /**
   * Generate receipt HTML from data
   */
  generateReceiptHtml(data: ReceiptData, template?: ReceiptTemplate | null): string {
    const currency = data.currency || config.region.currency;

    // Build items HTML
    const itemsHtml = data.items
      .map(
        (item) => `
      <tr class="item">
        <td class="item-name">
          ${item.name}
          ${item.modifiers?.map((m) => `<br><small class="modifier">+ ${m.name}</small>`).join('') || ''}
          ${item.notes ? `<br><small class="notes">${item.notes}</small>` : ''}
        </td>
        <td class="item-qty">${item.quantity}</td>
        <td class="item-price">${this.formatCurrency(item.unit_price_cents, currency)}</td>
        <td class="item-total">${this.formatCurrency(item.total_cents, currency)}</td>
      </tr>
    `
      )
      .join('');

    // Build tax breakdown HTML
    let taxBreakdownHtml = '';
    if (template?.show_tax_breakdown && data.tax_breakdown) {
      taxBreakdownHtml = data.tax_breakdown
        .map(
          (tax) => `
        <tr class="tax-row">
          <td colspan="3">${tax.name} (${tax.rate_percent}%)</td>
          <td>${this.formatCurrency(tax.amount_cents, currency)}</td>
        </tr>
      `
        )
        .join('');
    }

    // Generate the full receipt
    const html = `
<!DOCTYPE html>
<html lang="${config.region.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt #${data.receipt_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 5mm;
      background: white;
    }
    .receipt { width: 100%; }
    .header { text-align: center; margin-bottom: 10px; }
    .store-name { font-size: 16px; font-weight: bold; }
    .store-info { font-size: 10px; color: #666; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; }
    .items-table td { padding: 4px 0; vertical-align: top; }
    .item-qty, .item-price, .item-total { text-align: right; }
    .modifier { color: #666; font-size: 10px; }
    .notes { color: #666; font-style: italic; font-size: 10px; }
    .totals { margin-top: 10px; }
    .totals-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .totals-row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 6px; margin-top: 6px; }
    .payment-info { margin-top: 10px; font-size: 10px; }
    .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #666; }
    .barcode { text-align: center; margin-top: 10px; }
    .barcode img { max-width: 100%; }
    .fiscal-info { margin-top: 10px; font-size: 9px; color: #666; border: 1px solid #ccc; padding: 5px; }
    ${template?.custom_css || ''}
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${template?.show_logo ? '<div class="logo">[LOGO]</div>' : ''}
      <div class="store-name">${data.store_name}</div>
      <div class="store-info">
        ${data.store_address ? `<div>${data.store_address}</div>` : ''}
        ${data.store_phone ? `<div>Tel: ${data.store_phone}</div>` : ''}
      </div>
      ${template?.header_text ? `<div class="header-text">${template.header_text}</div>` : ''}
    </div>

    <div class="divider"></div>

    <div class="receipt-info">
      <div><strong>Receipt #:</strong> ${data.receipt_number}</div>
      <div><strong>Date:</strong> ${new Date(data.created_at).toLocaleString(config.region.locale)}</div>
      ${data.employee_name ? `<div><strong>Cashier:</strong> ${data.employee_name}</div>` : ''}
      ${data.customer_name ? `<div><strong>Customer:</strong> ${data.customer_name}</div>` : ''}
    </div>

    <div class="divider"></div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${this.formatCurrency(data.subtotal_cents, currency)}</span>
      </div>
      ${
        data.discount_cents > 0
          ? `
        <div class="totals-row">
          <span>Discount</span>
          <span>-${this.formatCurrency(data.discount_cents, currency)}</span>
        </div>
      `
          : ''
      }
      ${taxBreakdownHtml ? `<table class="items-table">${taxBreakdownHtml}</table>` : ''}
      <div class="totals-row">
        <span>Tax</span>
        <span>${this.formatCurrency(data.tax_cents, currency)}</span>
      </div>
      ${
        data.tip_cents > 0
          ? `
        <div class="totals-row">
          <span>Tip</span>
          <span>${this.formatCurrency(data.tip_cents, currency)}</span>
        </div>
      `
          : ''
      }
      <div class="totals-row total">
        <span>TOTAL</span>
        <span>${this.formatCurrency(data.total_cents, currency)}</span>
      </div>
    </div>

    <div class="payment-info">
      <div><strong>Payment:</strong> ${data.payment_method}</div>
      ${data.payment_reference ? `<div><strong>Ref:</strong> ${data.payment_reference}</div>` : ''}
    </div>

    ${
      data.fiscal_number
        ? `
      <div class="fiscal-info">
        <div><strong>Fiscal #:</strong> ${data.fiscal_number}</div>
        <div>This receipt is a legal tax document.</div>
      </div>
    `
        : ''
    }

    ${
      template?.show_barcode
        ? `
      <div class="barcode">
        <div>[BARCODE: ${data.receipt_number}]</div>
      </div>
    `
        : ''
    }

    <div class="footer">
      ${template?.footer_text || 'Thank you for your purchase!'}
    </div>
  </div>
</body>
</html>
    `;

    return html.trim();
  }

  /**
   * Generate plain text receipt (for thermal printers)
   */
  generateReceiptText(data: ReceiptData, template?: ReceiptTemplate | null): string {
    const currency = data.currency || config.region.currency;
    const width = 40; // Characters per line for thermal printer

    const center = (text: string) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const divider = '='.repeat(width);
    const thinDivider = '-'.repeat(width);

    let receipt = '';

    // Header
    receipt += center(data.store_name) + '\n';
    if (data.store_address) receipt += center(data.store_address) + '\n';
    if (data.store_phone) receipt += center(`Tel: ${data.store_phone}`) + '\n';
    if (template?.header_text) receipt += center(template.header_text) + '\n';
    receipt += divider + '\n';

    // Receipt info
    receipt += `Receipt #: ${data.receipt_number}\n`;
    receipt += `Date: ${new Date(data.created_at).toLocaleString(config.region.locale)}\n`;
    if (data.employee_name) receipt += `Cashier: ${data.employee_name}\n`;
    if (data.customer_name) receipt += `Customer: ${data.customer_name}\n`;
    receipt += thinDivider + '\n';

    // Items
    for (const item of data.items) {
      const price = this.formatCurrency(item.total_cents, currency);
      const qty = `x${item.quantity}`;
      const itemLine = `${item.name.substring(0, width - 15)} ${qty}`;
      receipt += `${itemLine.padEnd(width - price.length)}${price}\n`;

      if (item.modifiers) {
        for (const mod of item.modifiers) {
          receipt += `  + ${mod.name}\n`;
        }
      }
      if (item.notes) {
        receipt += `  (${item.notes})\n`;
      }
    }

    receipt += thinDivider + '\n';

    // Totals
    const addTotal = (label: string, amount: string, bold = false) => {
      const line = bold ? label.toUpperCase() : label;
      receipt += `${line.padEnd(width - amount.length)}${amount}\n`;
    };

    addTotal('Subtotal', this.formatCurrency(data.subtotal_cents, currency));
    if (data.discount_cents > 0) {
      addTotal('Discount', `-${this.formatCurrency(data.discount_cents, currency)}`);
    }
    addTotal('Tax', this.formatCurrency(data.tax_cents, currency));
    if (data.tip_cents > 0) {
      addTotal('Tip', this.formatCurrency(data.tip_cents, currency));
    }
    receipt += thinDivider + '\n';
    addTotal('TOTAL', this.formatCurrency(data.total_cents, currency), true);

    receipt += '\n';
    receipt += `Payment: ${data.payment_method}\n`;
    if (data.payment_reference) receipt += `Ref: ${data.payment_reference}\n`;

    // Fiscal info
    if (data.fiscal_number) {
      receipt += thinDivider + '\n';
      receipt += `Fiscal #: ${data.fiscal_number}\n`;
    }

    // Footer
    receipt += divider + '\n';
    receipt += center(template?.footer_text || 'Thank you for your purchase!') + '\n';

    return receipt;
  }
}
