export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown[];

  constructor(message: string, details: unknown[] = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class OfflineOperationError extends AppError {
  constructor(operation: string) {
    super(`Operation '${operation}' is not available in offline mode`, 503, 'OFFLINE_UNAVAILABLE');
  }
}

export class SyncConflictError extends AppError {
  public readonly conflictData: unknown;

  constructor(message: string, conflictData: unknown) {
    super(message, 409, 'SYNC_CONFLICT');
    this.conflictData = conflictData;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
