import type { PoolClient } from 'pg'
import { normalizeRecord } from './normalize.js'
import { withClient } from '../db/pool.js'
import type { NormalizedFireEvent, RejectedRecord } from '../domain/fire.js'
import { upsertFireEvents } from '../repositories/fireRepository.js'

export interface IngestionRun {
  id: number
  source: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  fetchedCount: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  rejectedCount: number
  errorMessage: string | null
  notes: Record<string, unknown>
}

export async function runIngestion(options: {
  source: string
  rows: Record<string, unknown>[]
  dryRun?: boolean
}): Promise<IngestionRun> {
  return withClient(async (client) => {
    const run = await createRun(client, options.source, { dryRun: Boolean(options.dryRun) })
    const accepted: NormalizedFireEvent[] = []
    const rejected: RejectedRecord[] = []
    let transactionStarted = false

    try {
      options.rows.forEach((row, index) => {
        const result = normalizeRecord(row, options.source, index + 1)
        if ('reason' in result) rejected.push(result)
        else accepted.push(result)
      })

      let counts = { insertedCount: 0, updatedCount: 0, skippedCount: 0 }
      if (!options.dryRun) {
        await client.query('BEGIN')
        transactionStarted = true
        counts = await upsertFireEvents(client, accepted)
        await client.query('COMMIT')
        transactionStarted = false
      }

      return updateRun(client, run.id, {
        status: 'SUCCESS',
        fetchedCount: options.rows.length,
        insertedCount: counts.insertedCount,
        updatedCount: counts.updatedCount,
        skippedCount: counts.skippedCount,
        rejectedCount: rejected.length,
        errorMessage: null,
        notes: {
          dryRun: Boolean(options.dryRun),
          acceptedCount: accepted.length,
          rejections: rejected.slice(0, 20).map((item) => ({
            rowNumber: item.rowNumber,
            reason: item.reason,
            raw: item.rawPayload,
          })),
        },
      })
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK')
      }
      return updateRun(client, run.id, {
        status: 'FAILED',
        fetchedCount: options.rows.length,
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        rejectedCount: rejected.length,
        errorMessage: error instanceof Error ? error.message : String(error),
        notes: { dryRun: Boolean(options.dryRun) },
      })
    }
  })
}

async function createRun(
  client: PoolClient,
  source: string,
  notes: Record<string, unknown>,
): Promise<IngestionRun> {
  const result = await client.query(
    `
    INSERT INTO ingestion_runs (source, status, notes)
    VALUES ($1, 'RUNNING', $2::jsonb)
    RETURNING id, source, status, started_at, finished_at,
              fetched_count, inserted_count, updated_count, rejected_count,
              error_message, notes
    `,
    [source, JSON.stringify(notes)],
  )
  return mapRun(result.rows[0])
}

async function updateRun(
  client: PoolClient,
  id: number,
  values: {
    status: string
    fetchedCount: number
    insertedCount: number
    updatedCount: number
    skippedCount: number
    rejectedCount: number
    errorMessage: string | null
    notes: Record<string, unknown>
  },
): Promise<IngestionRun> {
  const result = await client.query(
    `
    UPDATE ingestion_runs
    SET status = $2,
        finished_at = now(),
        fetched_count = $3,
        inserted_count = $4,
        updated_count = $5,
        rejected_count = $6,
        error_message = $7,
        notes = $8::jsonb
    WHERE id = $1
    RETURNING id, source, status, started_at, finished_at,
              fetched_count, inserted_count, updated_count, rejected_count,
              error_message, notes
    `,
    [
      id,
      values.status,
      values.fetchedCount,
      values.insertedCount,
      values.updatedCount,
      values.rejectedCount,
      values.errorMessage,
      JSON.stringify(values.notes),
    ],
  )
  return mapRun(result.rows[0])
}

function mapRun(row: Record<string, unknown>): IngestionRun {
  return {
    id: Number(row.id),
    source: String(row.source),
    status: String(row.status),
    startedAt: new Date(String(row.started_at)),
    finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
    fetchedCount: Number(row.fetched_count),
    insertedCount: Number(row.inserted_count),
    updatedCount: Number(row.updated_count),
    skippedCount: Number((row as any).skipped_count || 0),
    rejectedCount: Number(row.rejected_count),
    errorMessage: row.error_message ? String(row.error_message) : null,
    notes: (row.notes ?? {}) as Record<string, unknown>,
  }
}
