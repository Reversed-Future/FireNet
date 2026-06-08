import { config } from './config.js'
import { normalizeRecord } from './ingestion/normalize.js'
import { fetchWfsRows } from './ingestion/sources/nasaFirmsWfs.js'

if (!config.firmsMapKey) {
  throw new Error('FIRMS_MAP_KEY is required')
}

const source = `firms_wfs:${config.firmsWfsRegion}:${config.firmsWfsTypename}`
const rows = await fetchWfsRows({
  mapKey: config.firmsMapKey,
  region: config.firmsWfsRegion,
  typename: config.firmsWfsTypename,
  bbox: config.firmsWfsBbox,
  count: Math.min(config.firmsWfsCount, 1000),
})

const accepted = []
const rejected = []

for (const [index, row] of rows.entries()) {
  const result = normalizeRecord(row, source, index + 1)
  if ('reason' in result) rejected.push(result)
  else accepted.push(result)
}

const sample = accepted.slice(0, 3).map((item) => {
  const brightness = item.brightness ?? 0
  const level = brightness >= 340 ? 'HIGH' : brightness >= 320 ? 'MEDIUM' : 'LOW'
  const detectedAt = item.acqDatetime ?? new Date()
  return {
    sourceEventId: item.sourceEventId,
    latitude: item.latitude,
    longitude: item.longitude,
    level,
    intensityValue: brightness,
    confidence: item.confidence,
    detectedAt: detectedAt.toISOString(),
    locationName: item.region ?? 'Unknown Location',
  }
})

console.log(JSON.stringify({
  source,
  fetchedCount: rows.length,
  acceptedCount: accepted.length,
  rejectedCount: rejected.length,
  sample,
  rejectionSample: rejected.slice(0, 3).map((item) => ({
    rowNumber: item.rowNumber,
    reason: item.reason,
  })),
}, null, 2))
