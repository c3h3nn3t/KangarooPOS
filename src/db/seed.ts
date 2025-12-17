import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';
import type { Account, Employee, Product, ProductCategory, Store } from '../types/database';
import { logger } from '../utils/logger';
import { cloudDb } from './cloud-adapter';

/**
 * Seed script for development and testing
 * Creates sample data for local development
 */

async function seedAccounts(): Promise<string> {
  const accountId = uuidv4();
  const account: Partial<Account> = {
    id: accountId,
    name: 'Demo Coffee Shop',
    slug: 'demo-coffee',
    timezone: 'America/New_York',
    currency: 'USD',
    locale: 'en-US',
    business_type: 'coffee_shop',
    contact_email: 'demo@kangaroopos.com',
    contact_phone: '+1-555-0123',
    address_line1: '123 Main St',
    city: 'New York',
    state: 'NY',
    postal_code: '10001',
    country: 'US',
    is_active: true,
    settings: {}
  };

  const result = await cloudDb.insert<Account>('accounts', account);
  if (result.error) {
    throw new Error(`Failed to seed account: ${result.error}`);
  }

  logger.info({ accountId }, 'Seeded account');
  return accountId;
}

async function seedStore(accountId: string): Promise<string> {
  const storeId = uuidv4();
  const store: Partial<Store> = {
    id: storeId,
    account_id: accountId,
    name: 'Main Store',
    code: 'MAIN',
    address_line1: '123 Main St',
    city: 'New York',
    state: 'NY',
    postal_code: '10001',
    country: 'US',
    phone: '+1-555-0123',
    email: 'store@kangaroopos.com',
    timezone: 'America/New_York',
    currency: 'USD',
    is_active: true,
    settings: {}
  };

  const result = await cloudDb.insert<Store>('stores', store);
  if (result.error) {
    throw new Error(`Failed to seed store: ${result.error}`);
  }

  logger.info({ storeId }, 'Seeded store');
  return storeId;
}

async function seedCategories(accountId: string): Promise<Map<string, string>> {
  const categories = [
    { name: 'Hot Drinks', description: 'Hot beverages', sort_order: 1 },
    { name: 'Cold Drinks', description: 'Cold beverages', sort_order: 2 },
    { name: 'Food', description: 'Food items', sort_order: 3 },
    { name: 'Pastries', description: 'Baked goods', sort_order: 4 }
  ];

  const categoryMap = new Map<string, string>();

  for (const cat of categories) {
    const categoryId = uuidv4();
    const category: Partial<ProductCategory> = {
      id: categoryId,
      account_id: accountId,
      name: cat.name,
      description: cat.description,
      sort_order: cat.sort_order,
      is_active: true
    };

    const result = await cloudDb.insert<ProductCategory>('product_categories', category);
    if (result.error) {
      logger.warn({ error: result.error, category: cat.name }, 'Failed to seed category');
      continue;
    }

    categoryMap.set(cat.name, categoryId);
    logger.info({ categoryId, name: cat.name }, 'Seeded category');
  }

  return categoryMap;
}

async function seedProducts(
  accountId: string,
  storeId: string,
  categoryMap: Map<string, string>
): Promise<void> {
  const products = [
    {
      name: 'Espresso',
      description: 'Single shot espresso',
      sku: 'ESP-001',
      price_cents: 250,
      cost_cents: 50,
      category: 'Hot Drinks',
      track_stock: false
    },
    {
      name: 'Cappuccino',
      description: 'Espresso with steamed milk',
      sku: 'CAP-001',
      price_cents: 450,
      cost_cents: 100,
      category: 'Hot Drinks',
      track_stock: false
    },
    {
      name: 'Latte',
      description: 'Espresso with steamed milk and foam',
      sku: 'LAT-001',
      price_cents: 500,
      cost_cents: 120,
      category: 'Hot Drinks',
      track_stock: false
    },
    {
      name: 'Iced Coffee',
      description: 'Cold brewed coffee',
      sku: 'ICE-001',
      price_cents: 400,
      cost_cents: 80,
      category: 'Cold Drinks',
      track_stock: false
    },
    {
      name: 'Croissant',
      description: 'Butter croissant',
      sku: 'CRO-001',
      price_cents: 350,
      cost_cents: 150,
      category: 'Pastries',
      track_stock: true
    },
    {
      name: 'Sandwich',
      description: 'Ham and cheese sandwich',
      sku: 'SAN-001',
      price_cents: 800,
      cost_cents: 300,
      category: 'Food',
      track_stock: true
    }
  ];

  for (const prod of products) {
    const productId = uuidv4();
    const categoryId = categoryMap.get(prod.category);

    const product: Partial<Product> = {
      id: productId,
      account_id: accountId,
      category_id: categoryId || null,
      name: prod.name,
      description: prod.description,
      sku: prod.sku,
      price_cents: prod.price_cents,
      cost_cents: prod.cost_cents,
      currency: 'USD',
      track_stock: prod.track_stock,
      sold_by_weight: false,
      is_composite: false,
      sort_order: 0,
      is_active: true
    };

    const result = await cloudDb.insert<Product>('products', product);
    if (result.error) {
      logger.warn({ error: result.error, product: prod.name }, 'Failed to seed product');
      continue;
    }

    // Create product-store relationship
    await cloudDb.insert('product_stores', {
      id: uuidv4(),
      product_id: productId,
      store_id: storeId,
      price_cents: prod.price_cents,
      is_available: true
    });

    logger.info({ productId, name: prod.name }, 'Seeded product');
  }
}

async function seedEmployees(accountId: string, storeId: string): Promise<void> {
  const employees = [
    {
      name: 'John Manager',
      email: 'john@demo.com',
      role: 'manager' as const,
      pin_hash: null // In production, this would be hashed
    },
    {
      name: 'Jane Cashier',
      email: 'jane@demo.com',
      role: 'cashier' as const,
      pin_hash: null
    }
  ];

  for (const emp of employees) {
    const employeeId = uuidv4();
    const employee: Partial<Employee> = {
      id: employeeId,
      account_id: accountId,
      store_id: storeId,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      pin_hash: emp.pin_hash,
      permissions: {},
      is_active: true
    };

    const result = await cloudDb.insert<Employee>('employees', employee);
    if (result.error) {
      logger.warn({ error: result.error, employee: emp.name }, 'Failed to seed employee');
      continue;
    }

    logger.info({ employeeId, name: emp.name }, 'Seeded employee');
  }
}

async function main(): Promise<void> {
  logger.info('Starting database seed...');

  try {
    // Check if we're connected
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new Error(
        'Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY'
      );
    }

    // Seed accounts
    const accountId = await seedAccounts();

    // Seed store
    const storeId = await seedStore(accountId);

    // Seed categories
    const categoryMap = await seedCategories(accountId);

    // Seed products
    await seedProducts(accountId, storeId, categoryMap);

    // Seed employees
    await seedEmployees(accountId, storeId);

    logger.info('Database seed completed successfully');
    logger.info({ accountId, storeId }, 'Seed data created');
  } catch (error) {
    logger.error({ error }, 'Database seed failed');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Unhandled error in seed script');
      process.exit(1);
    });
}

export { main as seedDatabase };
