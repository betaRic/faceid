import { createPhoneScanPost } from '@/lib/routes/phone-scan-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = createPhoneScanPost()
