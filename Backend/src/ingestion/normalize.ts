import crypto from 'node:crypto'
import type { NormalizedFireEvent, RejectedRecord } from '../domain/fire.js'

type RawRecord = Record<string, unknown>

// 有效的地区列表
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

// 24小时卫星类型
const SATELLITE_TYPES_24H = [
  'ms:fires_snpp_24hrs',
  'ms:fires_noaa20_24hrs',
  'ms:fires_noaa21_24hrs',
  'ms:fires_modis_24hrs'
]

// 7天卫星类型
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

  // 解析source为region和satelliteType
  const parsed = parseSource(source)
  
  // 转换 confidence 为数值 (0-100 范围，与前端展示规则一致)
  let confidence: string | null = null
  if (raw.confidence !== undefined) {
    const rawConf = String(raw.confidence).trim().toLowerCase()
    if (rawConf === 'h' || rawConf === 'high') {
      confidence = '90' // 高置信度
    } else if (rawConf === 'n' || rawConf === 'nominal') {
      confidence = '70' // 正常置信度
    } else if (rawConf === 'l' || rawConf === 'low') {
      confidence = '50' // 低置信度
    } else {
      // 如果是数字字符串，保持 0-100 范围
      const numConf = Number(rawConf)
      if (!isNaN(numConf)) {
        if (numConf > 1 && numConf <= 100) {
          // 已经是 0-100 范围
          confidence = String(numConf)
        } else if (numConf >= 0 && numConf <= 1) {
          // 0-1 范围，转换为 0-100
          confidence = String(Math.round(numConf * 100))
        } else {
          // 超出有效范围，设为默认值
          confidence = '70'
        }
      } else {
        // 无法解析，设为默认值
        confidence = '70'
      }
    }
  }
  const confidenceRaw = raw.confidence !== undefined ? String(raw.confidence) : null

  // 提取所有字段
  const wkt = raw.WKT !== undefined ? String(raw.WKT) : null
  const brightness = parseNumeric(raw.brightness)
  const scan = parseNumeric(raw.scan)
  const track = parseNumeric(raw.track)
  const acqDate = raw.acq_date !== undefined ? String(raw.acq_date) : null
  const acqTime = raw.acq_time !== undefined ? String(raw.acq_time) : null

  // 正确处理 acq_time 作为时间戳
  let acqDatetime: Date | null = null
  if (acqDate && acqTime) {
    acqDatetime = combineDateAndTime(acqDate, acqTime)
  } else if (raw.acq_datetime !== undefined) {
    acqDatetime = parseDatetimeFromRaw(raw.acq_datetime)
  }

  const brightness2 = parseNumeric(raw.brightness_2)
  const frp = parseNumeric(raw.frp)

  // 生成 source_event_id
  const sourceEventId = String(
    firstPresent(raw, 'source_event_id', 'id', 'satellite_id')
      ?? stableEventId(source, latitude, longitude, acqDatetime ?? new Date())
  )

  // 生成唯一键用于去重（把7天和24小时的视为同一个）
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

// 解析source字符串
function parseSource(source: string): { region: string | null; satelliteType: string | null } {
  const parts = source.split(':')

  if (parts.length < 3) {
    return { region: null, satelliteType: null }
  }

  // 格式: firms_wfs:{region}:{satelliteType}
  const regionPart = parts[1]
  const satelliteTypePart = parts.slice(2).join(':')

  // 验证地区
  const region = VALID_REGIONS.includes(regionPart) ? regionPart : null

  // 验证卫星类型
  const allSatelliteTypes = [...SATELLITE_TYPES_24H, ...SATELLITE_TYPES_7D]
  const satelliteType = allSatelliteTypes.includes(satelliteTypePart) ? satelliteTypePart : null

  return { region, satelliteType }
}

// 生成唯一键 - 用于去重，7天和24小时的视为同一个
function generateUniqueKey(satelliteType: string | null, latitude: number, longitude: number, acqDatetime: Date | null): string | null {
  if (!satelliteType) return null

  // 把7天类型转换为对应的24小时类型
  let normalizedType = satelliteType
  if (normalizedType.includes('_7days')) {
    normalizedType = normalizedType.replace('_7days', '_24hrs')
  }

  const dateStr = acqDatetime
    ? acqDatetime.toISOString().slice(0, 16) // 精确到分钟
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
 * 合并日期和时间
 * acq_date: YYYY-MM-DD 格式
 * acq_time: 秒时间戳（如 820）
 */
function combineDateAndTime(acqDate: string, acqTime: string): Date | null {
  try {
    // 尝试将 acqTime 解析为秒时间戳
    const seconds = Number(acqTime.trim())
    if (Number.isFinite(seconds) && seconds >= 0) {
      // 先解析日期部分
      const dateParts = acqDate.split('-').map(Number)
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts
        // 创建日期，注意月份从0开始
        const baseDate = new Date(Date.UTC(year, month - 1, day))
        // 添加秒数
        baseDate.setTime(baseDate.getTime() + seconds * 1000)
        if (!isNaN(baseDate.getTime())) {
          return baseDate
        }
      }
    }
  } catch {
    // 解析失败继续尝试其他方式
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
