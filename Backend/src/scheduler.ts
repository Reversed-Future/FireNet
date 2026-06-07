import cron from 'node-cron'
import { config } from './config.js'
import { runBulkIngest } from './ingestion/bulkIngest.js'
import { syncHighRiskZones } from './services/highRiskZoneService.js'

export function startScheduler(): void {
  const expression = `*/${config.schedulerIntervalMinutes} * * * *`
  
  console.log(`Starting scheduler with interval: ${config.schedulerIntervalMinutes} minutes`)

  cron.schedule(expression, async () => {
    if (!config.schedulerEnabled) {
      return
    }

    if (config.firmsMapKey) {
      try {
        console.log('Running scheduled bulk ingest...')
        const result = await runBulkIngest()
        console.log(`Bulk ingest completed: fetched=${result.totalFetched}, inserted=${result.totalInserted}, updated=${result.totalUpdated}`)
      } catch (error) {
        console.error('Scheduled bulk ingest failed:', error)
      }
    }

    try {
      console.log('Running scheduled high risk zone sync...')
      const syncResult = await syncHighRiskZones(168)
      console.log(`High risk zone sync completed: added=${syncResult.added}, updated=${syncResult.updated}, deactivated=${syncResult.deactivated}`)
    } catch (error) {
      console.error('Scheduled high risk zone sync failed:', error)
    }
  })
}