export interface FirePoint {
  id: string
  latitude: number
  longitude: number
  brightness: number
  scan: number
  track: number
  acq_date: string
  acq_time: string
  acq_datetime: string
  confidence: string | number
  brightness_2: number
  frp: number
  region: string | null
  satelliteType: string | null
  uniqueKey: string | null
  source: string | null
  sourceCount: number | null
  otherSources: string[] | null
  level: 'HIGH' | 'MEDIUM' | 'LOW'
  WKT?: string
  locationName?: string
}


