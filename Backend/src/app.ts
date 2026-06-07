import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'
import { config } from './config.js'
import { firesRouter } from './api/fires.js'
import { ingestionRouter } from './api/ingestion.js'
import { qualityRouter } from './api/quality.js'
import { authRouter } from './api/auth.js'
import { manageRouter } from './api/manage.js'
import { openApiDocument } from './openapi.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: config.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1gb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: config.appName, runtime: 'node-typescript' })
  })

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
  
  // Firelens Data APIs
  app.use('/api/fires', firesRouter)
  app.use('/api/ingestion', ingestionRouter)
  app.use('/api/quality', qualityRouter)
  
  // Unified Platform APIs (from original backend)
  app.use('/api', authRouter)
  app.use('/api/manage', manageRouter)
  
  app.use(errorHandler)

  return app
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500
  res.status(statusCode).json({
    code: statusCode,
    message: error instanceof Error ? error.message : 'internal server error',
    data: null,
  })
}
