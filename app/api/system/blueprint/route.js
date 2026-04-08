import { NextResponse } from 'next/server'
import { getRegion12Blueprint } from '../../../../lib/region12-demo'

export async function GET() {
  return NextResponse.json(getRegion12Blueprint())
}
