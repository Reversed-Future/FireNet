import { parseCsv } from '../csv.js'

export const supportedRegions = new Set([
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
  'Australia_NewZealand',
])

export const supportedTypenames = new Set([
  'ms:fires_snpp_24hrs',
  'ms:fires_noaa20_24hrs',
  'ms:fires_noaa21_24hrs',
  'ms:fires_modis_24hrs',
  'ms:fires_snpp_7days',
  'ms:fires_noaa20_7days',
  'ms:fires_noaa21_7days',
  'ms:fires_modis_7days',
])

export interface WfsOptions {
  mapKey: string
  region: string
  typename: string
  bbox: string
  startIndex?: number
  count?: number
}

export function buildWfsUrl(options: WfsOptions): string {
  if (!supportedRegions.has(options.region)) {
    throw new Error(`unsupported FIRMS region: ${options.region}`)
  }
  if (!supportedTypenames.has(options.typename)) {
    throw new Error(`unsupported FIRMS typename: ${options.typename}`)
  }

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    REQUEST: 'GetFeature',
    VERSION: '2.0.0',
    TYPENAME: options.typename,
    STARTINDEX: String(options.startIndex ?? 0),
    COUNT: String(options.count ?? 1000),
    SRSNAME: 'urn:ogc:def:crs:EPSG::4326',
    BBOX: `${options.bbox},urn:ogc:def:crs:EPSG::4326`,
    outputformat: 'csv',
  })
  return `https://firms.modaps.eosdis.nasa.gov/mapserver/wfs/${options.region}/${options.mapKey}/?${params.toString()}`
}

export async function fetchWfsRows(options: WfsOptions): Promise<Record<string, string>[]> {
  const response = await fetch(buildWfsUrl(options))
  if (!response.ok) {
    throw new Error(`FIRMS WFS request failed: ${response.status} ${response.statusText}`)
  }
  return parseCsv(await response.text())
}
