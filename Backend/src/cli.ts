import { config } from './config.js'
import { initDb } from './db/init.js'
import { pool } from './db/pool.js'
import { runIngestion } from './ingestion/pipeline.js'
import { fetchWfsRows } from './ingestion/sources/nasaFirmsWfs.js'
import { runBulkIngest } from './ingestion/bulkIngest.js'

const command = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

try {
  if (command === 'init-db') {
    await initDb()
    console.log('database initialized')
  } else if (command === 'ingest-firms-wfs') {
    if (!config.firmsMapKey) throw new Error('FIRMS MAP_KEY is required')
    const run = await runIngestion({
      source: `firms_wfs:${config.firmsWfsRegion}:${config.firmsWfsTypename}`,
      rows: await fetchWfsRows({
        mapKey: config.firmsMapKey,
        region: config.firmsWfsRegion,
        typename: config.firmsWfsTypename,
        bbox: config.firmsWfsBbox,
        count: config.firmsWfsCount,
      }),
      dryRun,
    })
    console.log(formatRun(run))
  } else if (command === 'bulk-ingest') {
    if (!config.firmsMapKey) throw new Error('FIRMS MAP_KEY is required')
    
    const result = await runBulkIngest({ dryRun })
    
    console.log('\n=== Bulk Ingest Summary ===')
    console.log(`Regions: ${result.totalRegions}`)
    console.log(`Satellites: ${result.totalSatellites}`)
    console.log(`Total fetched: ${result.totalFetched}`)
    console.log(`Total inserted: ${result.totalInserted}`)
    console.log(`Total updated: ${result.totalUpdated}`)
    console.log(`Total rejected: ${result.totalRejected}`)
    console.log('\n=== Detailed Results ===')
    
    for (const item of result.results) {
      const statusIcon = item.status === 'success' ? '✓' : '✗'
      console.log(`${statusIcon} ${item.region}/${item.satellite}: fetched=${item.fetched}, inserted=${item.inserted}, updated=${item.updated}`)
      if (item.error) {
        console.log(`  Error: ${item.error}`)
      }
    }
  } else {
    console.log(`Available commands:
  init-db              - Initialize database schema
  ingest-firms-wfs     - Ingest from NASA FIRMS WFS (single region/satellite)
  bulk-ingest          - Ingest from NASA FIRMS WFS (all regions/satellites)

Options:
  --dry-run            - Run without modifying database
`)
    throw new Error(`unknown command: ${command ?? '(empty)'}`)
  }
} finally {
  await pool.end()
}

function formatRun(run: Awaited<ReturnType<typeof runIngestion>>): string {
  return [
    `run_id=${run.id}`,
    `status=${run.status}`,
    `fetched=${run.fetchedCount}`,
    `inserted=${run.insertedCount}`,
    `updated=${run.updatedCount}`,
    `rejected=${run.rejectedCount}`,
  ].join(' ')
}
