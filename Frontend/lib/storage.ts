const DB_NAME = 'fire-admin-db'
const DB_VERSION = 2
let db: any = null

const openDb = async () => {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in the browser')
  }

  if (db) return db

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event: any) => {
      const database = event.target.result
      let logStore: any
      
      if (!database.objectStoreNames.contains('operationLogs')) {
        logStore = database.createObjectStore('operationLogs', { keyPath: 'id', autoIncrement: true })
      } else {
        logStore = event.target.transaction.objectStore('operationLogs')
      }
      
      if (!logStore.indexNames.contains('timestamp')) {
        logStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!logStore.indexNames.contains('userId')) {
        logStore.createIndex('userId', 'userId', { unique: false })
      }
      if (!logStore.indexNames.contains('action')) {
        logStore.createIndex('action', 'action', { unique: false })
      }
      
      if (!database.objectStoreNames.contains('zones')) {
        database.createObjectStore('zones', { keyPath: 'zoneId' })
      }
      if (!database.objectStoreNames.contains('users')) {
        database.createObjectStore('users', { keyPath: 'uid' })
      }
      if (!database.objectStoreNames.contains('fireEvents')) {
        database.createObjectStore('fireEvents', { keyPath: 'id' })
      }
    }
  })
}

export const initializeDB = async () => {
  await openDb()
}

const runTransaction = async (storeName: string, mode: IDBTransactionMode, callback: (store: any) => any) => {
  const database = await openDb()
  const transaction = database.transaction(storeName, mode)
  const store = transaction.objectStore(storeName)
  return callback(store)
}

export const saveUsers = async (users: any[]) => {
  const database = await openDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('users', 'readwrite')
    const store = transaction.objectStore('users')
    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      let completed = 0
      if (users.length === 0) {
        resolve()
        return
      }
      users.forEach((user) => {
        const request = store.put(user)
        request.onsuccess = () => {
          completed += 1
          if (completed === users.length) {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      })
    }
    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export const getUsers = async () => {
  return runTransaction('users', 'readonly', (store: any) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  })
}

export const saveZones = async (zones: any[]) => {
  const database = await openDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('zones', 'readwrite')
    const store = transaction.objectStore('zones')
    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      let completed = 0
      if (zones.length === 0) {
        resolve()
        return
      }
      zones.forEach((zone) => {
        const request = store.put(zone)
        request.onsuccess = () => {
          completed += 1
          if (completed === zones.length) {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      })
    }
    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export const getZones = async () => {
  return runTransaction('zones', 'readonly', (store: any) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  })
}

export const addLog = async (log: any) => {
  return runTransaction('operationLogs', 'readwrite', (store: any) => {
    return new Promise((resolve, reject) => {
      const request = store.add(log)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  })
}

export const getLogs = async (limit = 1000) => {
  return runTransaction('operationLogs', 'readonly', (store: any) => {
    return new Promise((resolve, reject) => {
      const index = store.index('timestamp')
      const request = index.getAll()
      request.onsuccess = () => {
        const items = request.result || []
        const sorted = items.sort((a: any, b: any) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit)
        resolve(sorted)
      }
      request.onerror = () => reject(request.error)
    })
  })
}

export const exportAllData = async () => {
  const [users, zones, logs, fireEvents] = await Promise.all([getUsers(), getZones(), getLogs(99999), getFireEvents()])
  return {
    version: DB_VERSION,
    timestamp: new Date().toISOString(),
    users: users.map((user: any) => ({
      uid: user.uid,
      username: user.username,
      role: user.role,
      lastLogin: user.lastLogin
    })),
    zones,
    operationLogs: logs,
    fireEvents
  }
}

export const getFireEvents = async () => {
  return runTransaction('fireEvents', 'readonly', (store: any) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  })
}

export const saveFireEvents = async (events: any[]) => {
  const database = await openDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('fireEvents', 'readwrite')
    const store = transaction.objectStore('fireEvents')
    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      let completed = 0
      if (events.length === 0) {
        resolve()
        return
      }
      events.forEach((event) => {
        const request = store.put(event)
        request.onsuccess = () => {
          completed += 1
          if (completed === events.length) {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      })
    }
    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export const updateFireEvent = async (event: any) => {
  return runTransaction('fireEvents', 'readwrite', (store: any) => {
    return new Promise((resolve, reject) => {
      const request = store.put(event)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  })
}

export const importAllData = async (backupData: any) => {
  if (!backupData || !backupData.users || !backupData.zones) {
    throw new Error('Invalid backup format')
  }

  const database = await openDb()
  const transaction = database.transaction(['users', 'zones', 'operationLogs', 'fireEvents'], 'readwrite')

  const userStore = transaction.objectStore('users')
  userStore.clear().onsuccess = () => {
    backupData.users.forEach((user: any) => userStore.put({ ...user, password: user.password || '' }))
  }

  const zoneStore = transaction.objectStore('zones')
  zoneStore.clear().onsuccess = () => {
    backupData.zones.forEach((zone: any) => zoneStore.put(zone))
  }

  const logStore = transaction.objectStore('operationLogs')
  logStore.clear().onsuccess = () => {
    const logs = backupData.operationLogs || []
    logs.forEach((log: any) => logStore.put(log))
  }

  const fireStore = transaction.objectStore('fireEvents')
  fireStore.clear().onsuccess = () => {
    const fires = backupData.fireEvents || []
    fires.forEach((fire: any) => fireStore.put(fire))
  }

  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
