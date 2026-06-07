import { config } from '../config.js'
import { supportedRegions, supportedTypenames, fetchWfsRows } from './sources/nasaFirmsWfs.js'
import { runIngestion } from './pipeline.js'

// 只获取24小时数据的卫星类型
const supportedTypenames24h = new Set([
  'ms:fires_snpp_24hrs',
  'ms:fires_noaa20_24hrs',
  'ms:fires_noaa21_24hrs',
  'ms:fires_modis_24hrs',
])

export interface BulkIngestResult {
  totalRegions: number
  totalSatellites: number
  totalFetched: number
  totalInserted: number
  totalUpdated: number
  totalSkipped: number
  totalRejected: number
  results: Array<{
    region: string
    satellite: string
    fetched: number
    inserted: number
    updated: number
    skipped: number
    rejected: number
    status: 'success' | 'failed'
    error?: string
  }>
}

export async function runBulkIngest(options?: {
  dryRun?: boolean
  regions?: string[]
  satellites?: string[]
}): Promise<BulkIngestResult> {
  const regions = options?.regions ?? Array.from(supportedRegions)
  const satellites = options?.satellites ?? Array.from(supportedTypenames24h)
  
  const results: BulkIngestResult['results'] = []
  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalSkipped = 0
  let totalRejected = 0

  for (const region of regions) {
    for (const satellite of satellites) {
      try {
        const source = `firms_wfs:${region}:${satellite}`
        console.log(`Fetching data from ${source}...`)
        
        const rows = await fetchWfsRows({
          mapKey: config.firmsMapKey,
          region,
          typename: satellite,
          bbox: config.firmsWfsBbox,
          count: config.firmsWfsCount,
        })

        const ingestResult = await runIngestion({
          source,
          rows,
          dryRun: options?.dryRun,
        })

        results.push({
          region,
          satellite,
          fetched: ingestResult.fetchedCount,
          inserted: ingestResult.insertedCount,
          updated: ingestResult.updatedCount,
          skipped: ingestResult.skippedCount || 0,
          rejected: ingestResult.rejectedCount,
          status: ingestResult.status === 'SUCCESS' ? 'success' : 'failed',
          error: ingestResult.errorMessage ?? undefined,
        })

        totalFetched += ingestResult.fetchedCount
        totalInserted += ingestResult.insertedCount
        totalUpdated += ingestResult.updatedCount
        totalSkipped += ingestResult.skippedCount || 0
        totalRejected += ingestResult.rejectedCount

        console.log(`Completed ${source}: fetched=${ingestResult.fetchedCount}, inserted=${ingestResult.insertedCount}, updated=${ingestResult.updatedCount}, skipped=${ingestResult.skippedCount || 0}`)
      } catch (error) {
        results.push({
          region,
          satellite,
          fetched: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          rejected: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        console.error(`Failed to ingest ${region}/${satellite}:`, error)
      }
    }
  }

  return {
    totalRegions: regions.length,
    totalSatellites: satellites.length,
    totalFetched,
    totalInserted,
    totalUpdated,
    totalSkipped,
    totalRejected,
    results,
  }
}
