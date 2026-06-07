import { config } from './config.js'
import { createApp } from './app.js'
import { startScheduler } from './scheduler.js'
import { initializeWebSocket } from './websocket/notificationServer.js'
import { createServer } from 'http'

const app = createApp()
const server = createServer(app)

server.listen(config.port, () => {
  console.log(`${config.appName} running at http://localhost:${config.port}`)
  console.log(`Swagger docs: http://localhost:${config.port}/docs`)
})

initializeWebSocket(server)

startScheduler()