export function sanitizeAttendanceEntryForStorage(entry = {}) {
  const {
    descriptor,
    descriptors,
    landmarks,
    challenge,
    scanFrames,
    sampleFrames,
    ...storedEntry
  } = entry || {}
  void descriptor
  void descriptors
  void landmarks
  void challenge
  void scanFrames
  void sampleFrames
  return storedEntry
}
