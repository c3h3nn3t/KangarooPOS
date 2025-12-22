import { config, type Locale } from '../config/env';

// =============================================================================
// TYPES
// =============================================================================

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

interface Translations {
  [key: string]: string | Translations;
}

// =============================================================================
// TRANSLATION RESOURCES
// =============================================================================

// Turkish translations
const trTranslations: Translations = {
  common: {
    save: 'Kaydet', cancel: 'Iptal', delete: 'Sil', edit: 'Duzenle', add: 'Ekle',
    search: 'Ara', filter: 'Filtrele', clear: 'Temizle', back: 'Geri', next: 'Ileri',
    close: 'Kapat', confirm: 'Onayla', yes: 'Evet', no: 'Hayir', ok: 'Tamam',
    loading: 'Yukleniyor...', error: 'Hata', success: 'Basarili',
    total: 'Toplam', subtotal: 'Ara Toplam', tax: 'Vergi', discount: 'Indirim',
    quantity: 'Miktar', price: 'Fiyat', name: 'Ad', amount: 'Tutar'
  },
  auth: {
    login: 'Giris Yap', logout: 'Cikis Yap', pin: 'PIN',
    enterPin: 'PIN kodunuzu girin', invalidPin: 'Gecersiz PIN',
    employee: 'Calisan', selectEmployee: 'Calisan secin'
  },
  pos: {
    newOrder: 'Yeni Siparis', currentOrder: 'Mevcut Siparis',
    orderTotal: 'Siparis Toplami', addItem: 'Urun Ekle', removeItem: 'Urun Kaldir',
    clearOrder: 'Siparisi Temizle', pay: 'Odeme', checkout: 'Odemeye Gec',
    customer: 'Musteri', searchProducts: 'Urun ara...', modifiers: 'Ekler'
  },
  payment: {
    paymentMethod: 'Odeme Yontemi', cash: 'Nakit', card: 'Kart',
    amountDue: 'Odenmesi Gereken', amountPaid: 'Odenen Tutar',
    change: 'Para Ustu', tip: 'Bahsis', processing: 'Islem yapiliyor...',
    approved: 'Onaylandi', declined: 'Reddedildi', installments: 'Taksit'
  },
  orders: {
    order: 'Siparis', orders: 'Siparisler', orderNumber: 'Siparis No',
    draft: 'Taslak', pending: 'Beklemede', preparing: 'Hazirlaniyor',
    ready: 'Hazir', completed: 'Tamamlandi', cancelled: 'Iptal Edildi'
  },
  products: {
    product: 'Urun', products: 'Urunler', category: 'Kategori',
    sku: 'Stok Kodu', barcode: 'Barkod', inStock: 'Stokta', outOfStock: 'Stokta Yok'
  },
  fiscal: {
    eFatura: 'e-Fatura', eArsiv: 'e-Arsiv', fiscalNumber: 'Fis No',
    taxId: 'Vergi No', kdv: 'KDV', zReport: 'Z Raporu'
  },
  errors: {
    somethingWentWrong: 'Bir seyler yanlis gitti', networkError: 'Baglanti hatasi',
    paymentFailed: 'Odeme basarisiz', sessionExpired: 'Oturum suresi doldu'
  }
};

// English translations
const enTranslations: Translations = {
  common: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add',
    search: 'Search', filter: 'Filter', clear: 'Clear', back: 'Back', next: 'Next',
    close: 'Close', confirm: 'Confirm', yes: 'Yes', no: 'No', ok: 'OK',
    loading: 'Loading...', error: 'Error', success: 'Success',
    total: 'Total', subtotal: 'Subtotal', tax: 'Tax', discount: 'Discount',
    quantity: 'Quantity', price: 'Price', name: 'Name', amount: 'Amount'
  },
  auth: {
    login: 'Login', logout: 'Logout', pin: 'PIN',
    enterPin: 'Enter your PIN', invalidPin: 'Invalid PIN',
    employee: 'Employee', selectEmployee: 'Select employee'
  },
  pos: {
    newOrder: 'New Order', currentOrder: 'Current Order',
    orderTotal: 'Order Total', addItem: 'Add Item', removeItem: 'Remove Item',
    clearOrder: 'Clear Order', pay: 'Pay', checkout: 'Checkout',
    customer: 'Customer', searchProducts: 'Search products...', modifiers: 'Modifiers'
  },
  payment: {
    paymentMethod: 'Payment Method', cash: 'Cash', card: 'Card',
    amountDue: 'Amount Due', amountPaid: 'Amount Paid',
    change: 'Change', tip: 'Tip', processing: 'Processing...',
    approved: 'Approved', declined: 'Declined', installments: 'Installments'
  },
  orders: {
    order: 'Order', orders: 'Orders', orderNumber: 'Order #',
    draft: 'Draft', pending: 'Pending', preparing: 'Preparing',
    ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled'
  },
  products: {
    product: 'Product', products: 'Products', category: 'Category',
    sku: 'SKU', barcode: 'Barcode', inStock: 'In Stock', outOfStock: 'Out of Stock'
  },
  fiscal: {
    eFatura: 'e-Invoice', eArsiv: 'e-Archive', fiscalNumber: 'Fiscal #',
    taxId: 'Tax ID', kdv: 'VAT', zReport: 'Z Report'
  },
  errors: {
    somethingWentWrong: 'Something went wrong', networkError: 'Network error',
    paymentFailed: 'Payment failed', sessionExpired: 'Session expired'
  }
};

const resources: Record<string, Translations> = {
  'tr-TR': trTranslations,
  'en-US': enTranslations,
  'en-GB': enTranslations,
  'de-DE': enTranslations,
  'fr-FR': enTranslations,
  'es-ES': enTranslations,
  'it-IT': enTranslations,
  'pt-PT': enTranslations,
  'nl-NL': enTranslations
};

// =============================================================================
// I18N CLASS
// =============================================================================

class I18n {
  private locale: Locale;
  private fallbackLocale: Locale = 'en-US';

  constructor() {
    this.locale = config.region.locale;
  }

  /**
   * Set the current locale
   */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  /**
   * Get the current locale
   */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Get available locales
   */
  getAvailableLocales(): Locale[] {
    return Object.keys(resources) as Locale[];
  }

  /**
   * Translate a key with optional parameters
   * @param key - Dot-notation key (e.g., 'common.save', 'payment.cash')
   * @param params - Optional parameters for interpolation (e.g., { minutes: 5 })
   */
  t(key: TranslationKey, params?: TranslationParams): string {
    const translation = this.getTranslation(key, this.locale);

    if (translation === key && this.locale !== this.fallbackLocale) {
      // Try fallback locale
      const fallback = this.getTranslation(key, this.fallbackLocale);
      if (fallback !== key) {
        return this.interpolate(fallback, params);
      }
    }

    return this.interpolate(translation, params);
  }

  /**
   * Check if a translation exists
   */
  exists(key: TranslationKey): boolean {
    return this.getTranslation(key, this.locale) !== key;
  }

  /**
   * Get a nested translation value
   */
  private getTranslation(key: TranslationKey, locale: Locale): string {
    const translations = resources[locale] || resources[this.fallbackLocale];
    const keys = key.split('.');
    let result: Translations | string = translations;

    for (const k of keys) {
      if (typeof result === 'object' && k in result) {
        result = result[k];
      } else {
        return key; // Return original key if not found
      }
    }

    return typeof result === 'string' ? result : key;
  }

  /**
   * Interpolate parameters into translation string
   * Supports {{param}} syntax
   */
  private interpolate(text: string, params?: TranslationParams): string {
    if (!params) return text;

    return text.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return paramKey in params ? String(params[paramKey]) : match;
    });
  }

  /**
   * Get all translations for the current locale
   */
  getAllTranslations(): Translations {
    return resources[this.locale] || resources[this.fallbackLocale];
  }

  /**
   * Get translations for a specific namespace
   */
  getNamespace(namespace: string): Record<string, string> {
    const translations = this.getAllTranslations();
    const ns = translations[namespace];

    if (typeof ns === 'object') {
      return ns as Record<string, string>;
    }

    return {};
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const i18n = new I18n();

/**
 * Shorthand translation function
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  return i18n.t(key, params);
}

// =============================================================================
// CURRENCY & NUMBER FORMATTING
// =============================================================================

/**
 * Format currency amount for display
 */
export function formatCurrency(
  cents: number,
  currency = config.region.currency,
  locale = config.region.locale
): string {
  const amount = cents / 100;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Format number with locale-specific formatting
 */
export function formatNumber(
  value: number,
  locale = config.region.locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format date/time with locale-specific formatting
 */
export function formatDate(
  date: Date | string,
  locale = config.region.locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...options
  }).format(d);
}

/**
 * Format time with locale-specific formatting
 */
export function formatTime(
  date: Date | string,
  locale = config.region.locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    ...options
  }).format(d);
}

/**
 * Format date and time
 */
export function formatDateTime(
  date: Date | string,
  locale = config.region.locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options
  }).format(d);
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(
  date: Date | string,
  locale = config.region.locale
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffDays > 0) {
    return rtf.format(-diffDays, 'day');
  }
  if (diffHours > 0) {
    return rtf.format(-diffHours, 'hour');
  }
  if (diffMins > 0) {
    return rtf.format(-diffMins, 'minute');
  }
  return rtf.format(-diffSecs, 'second');
}

// Re-export types
export type { Locale };
