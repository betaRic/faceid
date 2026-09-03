export const SERVER_ANTISPOOF_PASS_THRESHOLD = 0.58

export function assessServerAntispoof(value) {
  if (value === null || value === undefined || value === '') {
    return {
      ok: false,
      decisionCode: 'blocked_missing_antispoof',
      message: 'Server anti-spoofing is unavailable. Please try again.',
    }
  }

  const score = Number(value)
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    return {
      ok: false,
      decisionCode: 'blocked_missing_antispoof',
      message: 'Server anti-spoofing is unavailable. Please try again.',
    }
  }

  if (score < SERVER_ANTISPOOF_PASS_THRESHOLD) {
    return {
      ok: false,
      decisionCode: 'blocked_antispoof',
      message: 'Photo or screen detected. Please scan your real face.',
    }
  }

  return { ok: true, score }
}
