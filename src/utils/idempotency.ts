import { v7 as uuidv7 } from 'uuid';

export function generateIdempotencyKey(): string {
  return uuidv7();
}

export function generateId(): string {
  return uuidv7();
}

export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
