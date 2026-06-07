import { Router } from 'express'
import { pool } from '../db/pool.js'

export const qualityRouter = Router()

qualityRouter.get('/summary', async (_req, res, next) => {
  try {
    const summary = await pool.query('SELECT * FROM fire_quality_summary')
    const runs = await pool.query(
      `
      SELECT id, source, status, started_at, finished_at,
             fetched_count, inserted_count, updated_count, rejected_count
      FROM ingestion_runs
      ORDER BY started_at DESC
      LIMIT 5
      `,
    )

    res.json({
      code: 0,
      message: 'success',
      data: summary.rows[0] ?? {},
      recentRuns: runs.rows,
    })
  } catch (error) {
    next(error)
  }
})
