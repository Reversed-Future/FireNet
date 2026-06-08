import { Router } from 'express'
import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { runIngestion } from '../ingestion/pipeline.js'
import { fetchWfsRows, supportedRegions, supportedTypenames } from '../ingestion/sources/nasaFirmsWfs.js'

export const ingestionRouter = Router()

ingestionRouter.get('/runs', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit ?? '20'), 10)))
    const result = await pool.query(
      `
      SELECT id, source, status, started_at, finished_at,
             fetched_count, inserted_count, updated_count, rejected_count,
             error_message, notes
      FROM ingestion_runs
      ORDER BY started_at DESC
      LIMIT $1
      `,
      [limit],
    )
    res.json(result.rows.map(mapRunRow))
  } catch (error) {
    next(error)
  }
})

ingestionRouter.post('/firms-wfs', async (req, res, next) => {
  try {
    const mapKey = String(req.query.map_key ?? config.firmsMapKey)
    const region = String(req.query.region ?? config.firmsWfsRegion)
    const typename = String(req.query.typename ?? config.firmsWfsTypename)
    const bbox = String(req.query.bbox ?? config.firmsWfsBbox)
    const count = Number.parseInt(String(req.query.count ?? config.firmsWfsCount), 10)
    const dryRun = parseBoolean(req.query.dry_run)

    if (!mapKey) {
      res.status(400).json({ code: 400, message: 'FIRMS MAP_KEY is required', data: null })
      return
    }
    if (!supportedRegions.has(region)) {
      res.status(422).json({ code: 422, message: `unsupported region: ${region}`, data: null })
      return
    }
    if (!supportedTypenames.has(typename)) {
      res.status(422).json({ code: 422, message: `unsupported typename: ${typename}`, data: null })
      return
    }

    const run = await runIngestion({
      source: `firms_wfs:${region}:${typename}`,
      rows: await fetchWfsRows({ mapKey, region, typename, bbox, count }),
      dryRun,
    })
    res.json(mapRun(run))
  } catch (error) {
    next(error)
  }
})

function parseBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())
}

function mapRunRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: Number(row.id),
    source: row.source,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fetchedCount: Number(row.fetched_count),
    insertedCount: Number(row.inserted_count),
    updatedCount: Number(row.updated_count),
    rejectedCount: Number(row.rejected_count),
    errorMessage: row.error_message,
    notes: row.notes,
  }
}

function mapRun(run: Awaited<ReturnType<typeof runIngestion>>): Record<string, unknown> {
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    fetchedCount: run.fetchedCount,
    insertedCount: run.insertedCount,
    updatedCount: run.updatedCount,
    rejectedCount: run.rejectedCount,
    errorMessage: run.errorMessage,
    notes: run.notes,
  }
}
