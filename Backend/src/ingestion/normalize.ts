import crypto from 'node:crypto'
import type { NormalizedFireEvent, RejectedRecord } from '../domain/fire.js'

type RawRecord = Record<string, unknown>

// Valid regions supported by the FIRMS WFS
const VALID_REGIONS = [
  'Canada',
  'Alaska',
  'USA_contiguous_and_Hawaii',
  'Central_America',
  'South_America',
  'Europe',
  'Northern_and_Central_Africa',
  'Southern_Africa',
  'Russia_Asia',
  'South_Asia',
  'SouthEast_Asia',
  'Australia_NewZealand'
]

// Supported satellites for 24-hour data
const SATELLITE_TYPES_24H = [
  'ms:fires_snpp_24hrs',
  'ms:fires_noaa20_24hrs',
  'ms:fires_noaa21_24hrs',
  'ms:fires_modis_24hrs'
]

// Supported satellites for 7-day data
const SATELLITE_TYPES_7D = [
  'ms:fires_snpp_7days',
  'ms:fires_noaa20_7days',
  'ms:fires_noaa21_7days',
  'ms:fires_modis_7days'
]

export function normalizeRecord(
  raw: RawRecord,
  source: string,
  rowNumber = 0,
): NormalizedFireEvent | RejectedRecord {
  const latitude = parseNumeric(firstPresent(raw, 'latitude', 'lat'))
  const longitude = parseNumeric(firstPresent(raw, 'longitude', 'lon', 'lng'))

  if (latitude === null || longitude === null) {
    return reject(rowNumber, 'invalid coordinate: missing or non-numeric value', raw)
  }
  if (latitude < -90 || latitude > 90) {
    return reject(rowNumber, 'latitude out of range', raw)
  }
  if (longitude < -180 || longitude > 180) {
    return reject(rowNumber, 'longitude out of range', raw)
  }

  // Parse source field to extract region and satellite type
  const parsed = parseSource(source)
  
  // Convert confidence to numeric (0-100)
  let confidence: string | null = null
  if (raw.confidence !== undefined) {
    const rawConf = String(raw.confidence).trim().toLowerCase()
    if (rawConf === 'h' || rawConf === 'high') {
      confidence = '90' // high confidence
    } else if (rawConf === 'n' || rawConf === 'nominal') {
      confidence = '70' // nominal confidence
    } else if (rawConf === 'l' || rawConf === 'low') {
      confidence = '50' // low confidence
    } else {
      // if confidence is a numeric string, convert to 0-100 range
      const numConf = Number(rawConf)
      if (!isNaN(numConf)) {
        if (numConf > 1 && numConf <= 100) {
          // Already in 0-100 range
          confidence = String(numConf)
        } else if (numConf >= 0 && numConf <= 1) {
          // 0-1 range, convert to 0-100
          confidence = String(Math.round(numConf * 100))
        } else {
          // out of valid range, set to default value
          confidence = '70'
        }
      } else {
        // cannot parse, set to default value
        confidence = '70'
      }
    }
  }
  const confidenceRaw = raw.confidence !== undefined ? String(raw.confidence) : null

  // Extract all fields
  const wkt = raw.WKT !== undefined ? String(raw.WKT) : null
  const brightness = parseNumeric(raw.brightness)
  const scan = parseNumeric(raw.scan)
  const track = parseNumeric(raw.track)
  const acqDate = raw.acq_date !== undefined ? String(raw.acq_date) : null
  const acqTime = raw.acq_time !== undefined ? String(raw.acq_time) : null

  // Correctly handle acq_time as timestamp string
  let acqDatetime: Date | null = null
  if (acqDate && acqTime) {
    acqDatetime = combineDateAndTime(acqDate, acqTime)
  } else if (raw.acq_datetime !== undefined) {
    acqDatetime = parseDatetimeFromRaw(raw.acq_datetime)
  }

  const brightness2 = parseNumeric(raw.brightness_2)
  const frp = parseNumeric(raw.frp)

  // Generate source_event_id
  const sourceEventId = String(
    firstPresent(raw, 'source_event_id', 'id', 'satellite_id')
      ?? stableEventId(source, latitude, longitude, acqDatetime ?? new Date())
  )

  // Generate unique key for deduplication (7-day and 24-hour data are considered the same)
  const uniqueKey = generateUniqueKey(parsed.satelliteType, latitude, longitude, acqDatetime)

  return {
    source,
    sourceEventId,
    latitude,
    longitude,
    confidence,
    confidenceRaw,
    region: parsed.region,
    satelliteType: parsed.satelliteType,
    uniqueKey,
    wkt,
    brightness,
    scan,
    track,
    acqDate,
    acqTime,
    acqDatetime,
    brightness2,
    frp,
    rawPayload: { ...raw },
  }
}

// Parse source string to extract region and satellite type
function parseSource(source: string): { region: string | null; satelliteType: string | null } {
  const parts = source.split(':')

  if (parts.length < 3) {
    return { region: null, satelliteType: null }
  }

  // Format: firms_wfs:{region}:{satelliteType}
  const regionPart = parts[1]
  const satelliteTypePart = parts.slice(2).join(':')

  // Validate region
  const region = VALID_REGIONS.includes(regionPart) ? regionPart : null

  // Validate satellite type
  const allSatelliteTypes = [...SATELLITE_TYPES_24H, ...SATELLITE_TYPES_7D]
  const satelliteType = allSatelliteTypes.includes(satelliteTypePart) ? satelliteTypePart : null

  return { region, satelliteType }
}

// Generate unique key - for deduplication, 7-day and 24-hour data are considered the same
function generateUniqueKey(satelliteType: string | null, latitude: number, longitude: number, acqDatetime: Date | null): string | null {
  if (!satelliteType) return null

  // Convert 7-day types to corresponding 24-hour types
  let normalizedType = satelliteType
  if (normalizedType.includes('_7days')) {
    normalizedType = normalizedType.replace('_7days', '_24hrs')
  }

  // Format: {satelliteType}:{latitude}:{longitude}:{acqDate}:{acqTime}
  const dateStr = acqDatetime
    ? acqDatetime.toISOString().slice(0, 16) // Exact to minute precision
    : 'unknown'

  return `${normalizedType}:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${dateStr}`
}

function reject(rowNumber: number, reason: string, rawPayload: RawRecord): RejectedRecord {
  return { rowNumber, reason, rawPayload: { ...rawPayload } }
}

function firstPresent(raw: RawRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function parseNumeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Combine date and time strings into a Date object
 * acq_date: YYYY-MM-DD format
 * acq_time: Second timestamp (e.g., 820)
 */
function combineDateAndTime(acqDate: string, acqTime: string): Date | null {
  try {
    // Try to parse acqTime as seconds timestamp
    const seconds = Number(acqTime.trim())
    if (Number.isFinite(seconds) && seconds >= 0) {
      // Parse date part
      const dateParts = acqDate.split('-').map(Number)
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts
        // Create date object, note month is 0-based
        const baseDate = new Date(Date.UTC(year, month - 1, day))
        // Add seconds timestamp
        baseDate.setTime(baseDate.getTime() + seconds * 1000)
        if (!isNaN(baseDate.getTime())) {
          return baseDate
        }
      }
    }
  } catch {
    // Parse failed, try other methods
  }

  return null
}

function parseDatetimeFromRaw(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  return coerceDate(String(value))
}

function coerceDate(value: string): Date | null {
  const cleaned = value.trim().replace(' ', 'T')
  const withTimezone = /Z$|[+-]\d\d:\d\d$/.test(cleaned) ? cleaned : `${cleaned}Z`
  const parsed = new Date(withTimezone)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function stableEventId(source: string, latitude: number, longitude: number, date: Date): string {
  return crypto
    .createHash('sha1')
    .update(`${source}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${date.toISOString()}`)
    .digest('hex')
    .slice(0, 20)
}
