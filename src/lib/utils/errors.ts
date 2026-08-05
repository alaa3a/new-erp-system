export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: number | string) {
    super(404, id ? `${entity} with id ${id} not found` : `${entity} not found`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'FORBIDDEN');
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(422, message, 'BUSINESS_RULE');
  }
}

export function handleApiError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { success: false, error: error.message, code: error.code, fields: (error as ValidationError).fields },
      { status: error.statusCode },
    );
  }
  console.error('Unexpected error:', error);
  return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
