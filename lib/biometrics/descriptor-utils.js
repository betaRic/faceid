export function euclideanDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = left[i] - right[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

