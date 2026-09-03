import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server.js'

export class SafeRequestError extends Error {
  constructor(message, { status = 400, code = 'invalid_request' } = {}) {
    super(message)
    this.name = 'SafeRequestError'
    this.status = status
    this.code = code
  }
}

export function serverErrorResponse(error, {
  context = 'server',
  publicMessage = 'Request could not be completed. Please try again.',
} = {}) {
  if (error instanceof SafeRequestError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status },
    )
  }

  const errorId = randomUUID()
  console.error(`[${context}] Unexpected error`, {
    errorId,
    errorName: error?.name || 'UnknownError',
    errorCode: error?.code || '',
    internalMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return NextResponse.json(
    { ok: false, message: `${publicMessage} Reference: ${errorId}`, errorId },
    { status: 500 },
  )
}
