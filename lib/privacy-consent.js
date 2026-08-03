export const PRIVACY_NOTICE_VERSION = '2026-07-28'

export function createPrivacyConsentRecord() {
  return {
    noticeVersion: PRIVACY_NOTICE_VERSION,
    acceptedAt: new Date().toISOString(),
  }
}
