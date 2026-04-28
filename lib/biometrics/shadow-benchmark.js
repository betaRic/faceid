import { euclideanDistance, normalizeDescriptor } from './descriptor-utils.js'

export const SHADOW_BENCHMARK_VERSION = 'biometric-shadow-benchmark-v1'

const DEFAULT_MARGINS = [0.04, 0.06, 0.08, 0.10]

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function round(value, digits = 6) {
  const numeric = toFiniteNumber(value)
  if (!Number.isFinite(numeric)) return null
  const factor = 10 ** digits
  return Math.round(numeric * factor) / factor
}

function percentile(values, target) {
  const sorted = safeArray(values)
    .map(toFiniteNumber)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]
  const clamped = Math.max(0, Math.min(1, Number(target) || 0))
  const index = (sorted.length - 1) * clamped
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower))
}

function summarizeDistribution(values) {
  const finite = safeArray(values).map(toFiniteNumber).filter(Number.isFinite)
  return {
    count: finite.length,
    min: round(finite.length ? Math.min(...finite) : null),
    p05: round(percentile(finite, 0.05)),
    p50: round(percentile(finite, 0.5)),
    p95: round(percentile(finite, 0.95)),
    max: round(finite.length ? Math.max(...finite) : null),
  }
}

function personKey(sample) {
  return String(sample?.personId || sample?.employeeId || sample?.label || '').trim()
}

function sampleLabel(sample) {
  return String(sample?.employeeId || sample?.personId || sample?.label || '').trim()
}

function normalizeSplit(value) {
  const split = String(value || '').trim().toLowerCase()
  if (split === 'query' || split === 'probe' || split === 'scan') return 'query'
  if (split === 'enroll' || split === 'enrollment' || split === 'template') return 'enroll'
  return ''
}

function distance(metric, left, right) {
  const a = normalizeDescriptor(left)
  const b = normalizeDescriptor(right)
  if (metric === 'cosine') {
    const length = Math.min(a.length, b.length)
    let dot = 0
    for (let index = 0; index < length; index += 1) dot += a[index] * b[index]
    return 1 - dot
  }
  return euclideanDistance(a, b)
}

function buildPersonRank(query, templates, metric) {
  const byPerson = new Map()
  for (const template of templates) {
    if (template.sampleId === query.sampleId) continue
    const key = personKey(template)
    if (!key || !Array.isArray(template.descriptor)) continue

    const currentDistance = distance(metric, query.descriptor, template.descriptor)
    const current = byPerson.get(key)
    if (!current || currentDistance < current.distance) {
      byPerson.set(key, {
        personKey: key,
        label: sampleLabel(template),
        sampleId: template.sampleId,
        distance: currentDistance,
      })
    }
  }

  return Array.from(byPerson.values()).sort((left, right) => left.distance - right.distance)
}

function buildQueryCases(samples, metric) {
  const usable = safeArray(samples)
    .filter(sample => sample?.ok !== false)
    .filter(sample => Array.isArray(sample.descriptor) && sample.descriptor.length > 0)
    .filter(sample => personKey(sample))
  const hasExplicitQueries = usable.some(sample => normalizeSplit(sample.split) === 'query')
  const cases = []

  if (hasExplicitQueries) {
    const templates = usable.filter(sample => normalizeSplit(sample.split) !== 'query')
    const queries = usable.filter(sample => normalizeSplit(sample.split) === 'query')
    for (const query of queries) {
      cases.push({ query, rank: buildPersonRank(query, templates, metric), mode: 'explicit-query' })
    }
    return cases
  }

  for (const query of usable) {
    const templates = usable.filter(sample => sample.sampleId !== query.sampleId)
    cases.push({ query, rank: buildPersonRank(query, templates, metric), mode: 'leave-one-out' })
  }
  return cases
}

function evaluateThreshold(cases, threshold, margin) {
  const evaluated = cases.filter(item => item.rank.length > 0)
  let accepted = 0
  let correctAccept = 0
  let falseAccept = 0
  let blocked = 0

  for (const item of evaluated) {
    const best = item.rank[0]
    const second = item.rank[1] || null
    const queryPersonKey = personKey(item.query)
    const rankMargin = second ? second.distance - best.distance : 1
    const isAccepted = best.distance <= threshold && rankMargin >= margin

    if (!isAccepted) {
      blocked += 1
      continue
    }

    accepted += 1
    if (best.personKey === queryPersonKey) correctAccept += 1
    else falseAccept += 1
  }

  return {
    threshold: round(threshold),
    margin: round(margin),
    evaluated: evaluated.length,
    accepted,
    correctAccept,
    falseAccept,
    blocked,
    acceptRate: evaluated.length ? round(accepted / evaluated.length, 4) : null,
    correctAcceptRate: evaluated.length ? round(correctAccept / evaluated.length, 4) : null,
    falseAcceptRate: accepted ? round(falseAccept / accepted, 4) : 0,
    blockRate: evaluated.length ? round(blocked / evaluated.length, 4) : null,
  }
}

function buildThresholdGrid(cases) {
  const values = cases
    .map(item => item.rank[0]?.distance)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (!values.length) return []

  const grid = new Set()
  values.forEach(value => grid.add(round(value, 6)))
  for (let target = 0.05; target < 1; target += 0.05) {
    grid.add(round(percentile(values, target), 6))
  }
  grid.add(round(values[0] * 0.95, 6))
  grid.add(round(values[values.length - 1] * 1.05, 6))
  return Array.from(grid).filter(Number.isFinite).sort((left, right) => left - right)
}

function recommendGate(cases, margins = DEFAULT_MARGINS) {
  const grid = buildThresholdGrid(cases)
  const evaluations = []
  for (const margin of margins) {
    for (const threshold of grid) {
      evaluations.push(evaluateThreshold(cases, threshold, margin))
    }
  }

  const zeroFalseAccept = evaluations
    .filter(item => item.evaluated > 0 && item.falseAccept === 0)
    .sort((left, right) => (
      right.correctAccept - left.correctAccept
      || left.blocked - right.blocked
      || right.margin - left.margin
      || left.threshold - right.threshold
    ))

  const bestOverall = evaluations
    .slice()
    .sort((left, right) => (
      left.falseAccept - right.falseAccept
      || right.correctAccept - left.correctAccept
      || right.margin - left.margin
      || left.threshold - right.threshold
    ))[0] || null

  return {
    recommendedZeroFalseAccept: zeroFalseAccept[0] || null,
    bestObserved: bestOverall,
    candidates: evaluations
      .sort((left, right) => (
        left.falseAccept - right.falseAccept
        || right.correctAccept - left.correctAccept
        || right.margin - left.margin
        || left.threshold - right.threshold
      ))
      .slice(0, 12),
  }
}

export function buildEngineShadowBenchmark(engineSamples, options = {}) {
  const engine = String(options.engine || engineSamples?.[0]?.engine || 'unknown')
  const metric = options.metric === 'cosine' ? 'cosine' : 'l2'
  const usable = safeArray(engineSamples).filter(sample => sample?.ok !== false && Array.isArray(sample.descriptor))
  const rejected = safeArray(engineSamples).filter(sample => sample?.ok === false)
  const descriptorLengths = Array.from(new Set(usable.map(sample => sample.descriptor.length))).sort((a, b) => a - b)
  const personKeys = Array.from(new Set(usable.map(personKey).filter(Boolean)))
  const cases = buildQueryCases(usable, metric)
  const evaluated = cases.filter(item => item.rank.length > 0)
  const noCompetition = cases.length - evaluated.length
  const genuineDistances = []
  const impostorDistances = []
  const topDistances = []
  const margins = []
  const mismatches = []

  for (const item of evaluated) {
    const queryKey = personKey(item.query)
    const same = item.rank.find(candidate => candidate.personKey === queryKey)
    const wrong = item.rank.find(candidate => candidate.personKey !== queryKey)
    const best = item.rank[0]
    const second = item.rank[1] || null

    if (same) genuineDistances.push(same.distance)
    if (wrong) impostorDistances.push(wrong.distance)
    if (best) topDistances.push(best.distance)
    if (best && second) margins.push(second.distance - best.distance)

    if (best && best.personKey !== queryKey) {
      mismatches.push({
        sampleId: item.query.sampleId,
        expected: sampleLabel(item.query),
        nearest: best.label,
        bestDistance: round(best.distance),
        secondDistance: round(second?.distance),
        margin: round(second ? second.distance - best.distance : null),
      })
    }
  }

  const top1Correct = evaluated.length - mismatches.length
  const genuine = summarizeDistribution(genuineDistances)
  const impostor = summarizeDistribution(impostorDistances)
  const separationGap = Number.isFinite(genuine.p95) && Number.isFinite(impostor.p05)
    ? impostor.p05 - genuine.p95
    : null

  return {
    engine,
    metric,
    descriptorLengths,
    sampleCount: safeArray(engineSamples).length,
    usableSampleCount: usable.length,
    rejectedSampleCount: rejected.length,
    personCount: personKeys.length,
    queryCount: cases.length,
    evaluatedQueryCount: evaluated.length,
    noCompetitionCount: noCompetition,
    evidenceStatus: personKeys.length >= 20 && evaluated.length >= 100
      ? 'usable'
      : personKeys.length >= 5 && evaluated.length >= 25
        ? 'pilot'
        : 'insufficient',
    identification: {
      top1Correct,
      top1Mismatch: mismatches.length,
      top1Accuracy: evaluated.length ? round(top1Correct / evaluated.length, 4) : null,
      mismatchExamples: mismatches.slice(0, 20),
    },
    distributions: {
      genuine,
      impostor,
      top1: summarizeDistribution(topDistances),
      margin: summarizeDistribution(margins),
      separationGap: round(separationGap),
      separationStatus: Number.isFinite(separationGap)
        ? separationGap > 0
          ? 'separated'
          : 'overlap'
        : 'unknown',
    },
    thresholdSearch: recommendGate(evaluated, options.margins || DEFAULT_MARGINS),
    rejectedReasons: rejected.reduce((acc, sample) => {
      const key = String(sample.decisionCode || 'rejected')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
  }
}

export function buildShadowBenchmarkReport(samplesByEngine, options = {}) {
  const generatedAt = new Date(Number(options.now || Date.now())).toISOString()
  const reports = Object.entries(samplesByEngine || {}).map(([engine, samples]) => buildEngineShadowBenchmark(samples, {
    engine,
    metric: engine === 'openvino' ? 'cosine' : 'l2',
    margins: options.margins,
  }))

  return {
    ok: true,
    version: SHADOW_BENCHMARK_VERSION,
    generatedAt,
    dataset: {
      source: String(options.datasetSource || ''),
      note: 'Report contains only aggregate diagnostics, sample labels, distances, and ranks. It must not contain raw frames or descriptor vectors.',
    },
    engines: Object.fromEntries(reports.map(report => [report.engine, report])),
    comparison: {
      betterTop1: reports
        .slice()
        .sort((left, right) => (right.identification.top1Accuracy || 0) - (left.identification.top1Accuracy || 0))[0]?.engine || null,
      betterSeparation: reports
        .slice()
        .sort((left, right) => (right.distributions.separationGap ?? -Infinity) - (left.distributions.separationGap ?? -Infinity))[0]?.engine || null,
    },
  }
}
