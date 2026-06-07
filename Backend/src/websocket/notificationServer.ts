import { WebSocketServer, WebSocket } from 'ws'

interface Notification {
  type: 'fireEventApproved' | 'fireEventsUpdated' | 'logAdded' | 'userUpdated' | 'zoneUpdated' | 'zoneApproved' | 'fireEventReviewed'
  point?: any
  log?: SystemLogNotification
  user?: any
  zone?: any
  eventId?: string
}

interface SystemLogNotification {
  id: string
  logType: string
  operator: string
  action: string
  status: string
  target: string
  details: string
  createdAt: string
}

class NotificationServer {
  private static instance: NotificationServer
  private wss: WebSocketServer | null = null
  private clients: Set<WebSocket> = new Set()

  private constructor() {}

  static getInstance(): NotificationServer {
    if (!NotificationServer.instance) {
      NotificationServer.instance = new NotificationServer()
    }
    return NotificationServer.instance
  }

  initialize(server: any): void {
    if (this.wss) {
      console.log('[WebSocket] Server already initialized')
      return
    }

    this.wss = new WebSocketServer({ server, path: '/ws/notifications' })

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] New client connected')
      this.clients.add(ws)

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected')
        this.clients.delete(ws)
      })

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error)
        this.clients.delete(ws)
      })

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          console.log('[WebSocket] Received message:', message)
          
          if (message.type === 'fireEventApproved' && message.point) {
            this.broadcast(message)
          } else if (message.type === 'fireEventsUpdated') {
            this.broadcast(message)
          } else if (message.type === 'logAdded' && message.log) {
            this.broadcast(message)
          } else if (message.type === 'userUpdated' && message.user) {
            this.broadcast(message)
          } else if (message.type === 'zoneUpdated' && message.zone) {
            this.broadcast(message)
          } else if (message.type === 'zoneApproved' && message.zone) {
            this.broadcast(message)
          } else if (message.type === 'fireEventReviewed') {
            this.broadcast(message)
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      })
    })

    console.log('[WebSocket] Notification server initialized on /ws/notifications')
  }

  broadcast(message: Notification): void {
    const payload = JSON.stringify(message)
    console.log(`[WebSocket] Broadcasting to ${this.clients.size} clients:`, message.type)

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    }
  }

  broadcastFireEventApproved(point: any): void {
    this.broadcast({ type: 'fireEventApproved', point })
  }

  broadcastFireEventsUpdated(): void {
    this.broadcast({ type: 'fireEventsUpdated' })
  }

  broadcastLogAdded(log: SystemLogNotification): void {
    this.broadcast({ type: 'logAdded', log })
  }

  broadcastUserUpdated(user: any): void {
    this.broadcast({ type: 'userUpdated', user })
  }

  broadcastZoneUpdated(zone: any): void {
    this.broadcast({ type: 'zoneUpdated', zone })
  }

  broadcastZoneApproved(zone: any): void {
    this.broadcast({ type: 'zoneApproved', zone })
  }

  broadcastFireEventReviewed(eventId: string): void {
    this.broadcast({ type: 'fireEventReviewed', eventId })
  }

  getClientCount(): number {
    return this.clients.size
  }
}

export const notificationServer = NotificationServer.getInstance()

export function initializeWebSocket(server: any): void {
  notificationServer.initialize(server)
}