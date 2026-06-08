'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  initializeDB,
  getUsers,
  saveUsers,
  getZones,
  saveZones,
  addLog,
  getLogs,
  exportAllData,
  importAllData,
  getFireEvents,
  saveFireEvents,
  updateFireEvent
} from '../../lib/storage'
import { hasPermission } from '../../lib/permissions'
import type { FirePoint } from '../map/mock-data'
import { apiClient, SysLog, ApprovalRequest } from '../../lib/api'

const convertFirePointToEvent = (point: any) => {
  const sourceMap: Record<string, string> = {
    'HIGH': 'NASA-VIIRS',
    'MEDIUM': 'ESA-Sentinel',
    'LOW': 'NASA-MODIS'
  }
  return {
    id: point.id,
    WKT: point.WKT || `POINT(${point.longitude} ${point.latitude})`,
    source: sourceMap[point.level] || 'NASA-MODIS',
    location: `${point.latitude.toFixed(4)}° N, ${point.longitude.toFixed(4)}° E`,
    latitude: point.latitude,
    longitude: point.longitude,
    brightness: point.brightness || 300,
    scan: point.scan || 1.0,
    track: point.track || 1.0,
    acq_date: point.acq_date || '',
    acq_time: point.acq_time || '',
    acq_datetime: point.acq_datetime || '',
    confidence: point.confidence || point.level.toLowerCase(),
    brightness_2: point.brightness_2 || 290,
    frp: point.frp || 0,
    level: point.level,
    dateTime: point.dateTime || point.acq_datetime || '',
    locationName: point.locationName,
    status: 'Pending',
    published: false
  }
}

const emptyZone = {
  zoneId: '',
  name: '',
  minLatitude: 0,
  maxLatitude: 0,
  minLongitude: 0,
  maxLongitude: 0,
  polygonCoords: '',
  riskLevel: 'medium',
  historicalIncidents: 0,
  description: '',
  createdBy: '',
  createdAt: '',
  updatedAt: ''
}

const menuItems = [
  { key: 'data-audit', label: 'Data Audit', adminOnly: false },
  { key: 'rbac', label: 'User Access Control', adminOnly: true },
  { key: 'zones', label: 'High-Risk Zones', adminOnly: false },
  { key: 'approvals', label: 'Registration Approvals', adminOnly: true },
  { key: 'logs', label: 'All Logs', adminOnly: false },
  { key: 'backup', label: 'Backup & Restore', adminOnly: false }
]

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])
  const [fireEvents, setFireEvents] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [activeMenu, setActiveMenu] = useState('data-audit')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success'>('error')
  const [showToast, setShowToast] = useState(false)
  const [toastContent, setToastContent] = useState('')
  const [toastType, setToastType] = useState<'error' | 'success'>('error')
  const [backupStatus, setBackupStatus] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [zoneForm, setZoneForm] = useState(emptyZone)
  const [backupHistory, setBackupHistory] = useState<any[]>([])
  const [contentAnimating, setContentAnimating] = useState(false)
  const [systemLogs, setSystemLogs] = useState<SysLog[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [adminRegions, setAdminRegions] = useState<string[]>([])
  const [pendingUsers, setPendingUsers] = useState<any[]>([])
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false)
  const [firePage, setFirePage] = useState(1)
  const [fireLimit, setFireLimit] = useState(20)
  const [fireTotal, setFireTotal] = useState(0)
  const [fireLoading, setFireLoading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [pendingZones, setPendingZones] = useState<any[]>([])
  const [loadingPendingZones, setLoadingPendingZones] = useState(false)
  const [syncingZones, setSyncingZones] = useState(false)
  
  const [pendingReviews, setPendingReviews] = useState<any[]>([])
  const [reviewTimer, setReviewTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showReviewNotification, setShowReviewNotification] = useState(false)

  const canPerform = (permission: string) => hasPermission(currentUser?.role || null, permission)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeDB()
        const [storedUsers, storedZones, storedFires] = await Promise.all([getUsers(), getZones(), getFireEvents()])
        setZones(Array.isArray(storedZones) ? storedZones : [])
        
        let events = Array.isArray(storedFires) ? storedFires : []
        setFireEvents(events)
        
        const storedUser = typeof window !== 'undefined' ? sessionStorage.getItem('currentUser') : null
        if (storedUser) {
          setCurrentUser(JSON.parse(storedUser))
          setIsLoggedIn(true)
          
          try {
            const usersRes = await apiClient.getUsers()
            setUsers(usersRes.data.map((user: any) => ({
              ...user,
              role: user.role === 'admin' ? 'Admin' : 'User'
            })))
          } catch (error) {
            console.error('Failed to load users from backend:', error)
          }

          loadPendingZones()
        }
        
      } catch (error) {
        console.error('Initialization failed:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeApp()
  }, [])

  // Auto-dismiss toast messages when message state changes
  useEffect(() => {
    if (message) {
      setToastContent(message)
      setToastType(messageType)
      setShowToast(true)
    }
  }, [message, messageType])

  // Auto-dismiss toast after 3 seconds when showToast is true
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false)
        setToastContent('')
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [showToast])

  const updateSessionUser = (user: any) => {
    setCurrentUser(user)
    setIsLoggedIn(!!user)
    if (typeof window !== 'undefined') {
      if (user) {
        sessionStorage.setItem('currentUser', JSON.stringify(user))
      } else {
        sessionStorage.removeItem('currentUser')
      }
    }
  }

  const saveUserList = async (items: any[]) => {
    setUsers(items)
    try {
      await saveUsers(items)
    } catch (error) {
      console.error('Saving users failed:', error)
    }
  }

  const saveZoneList = async (items: any[]) => {
    setZones(items)
    try {
      await saveZones(items)
    } catch (error) {
      console.error('Saving zones failed:', error)
    }
  }

  const appendLog = async (log: any) => {
    try {
      await apiClient.createLog(log)
    } catch (error) {
      console.error('Appending log failed:', error)
    }
  }

  const loadBackendData = async () => {
    try {
      const [logsRes, usersRes] = await Promise.allSettled([
        apiClient.getLogs(),
        apiClient.getUsers()
      ])

      if (logsRes.status === 'fulfilled') {
        console.log('[Admin] Logs loaded:', logsRes.value.data?.length || 0, 'logs')
        setSystemLogs(logsRes.value.data)
      } else {
        console.error('[Admin] Failed to load logs:', logsRes.reason)
      }
      if (usersRes.status === 'fulfilled') {
        setUsers(usersRes.value.data.map((user: any) => ({
          ...user,
          role: user.role === 'admin' ? 'Admin' : 'User'
        })))
      }
    } catch (error) {
      console.error('Failed to load backend data:', error)
    }
  }

  const loadAdminRegions = async () => {
    try {
      const res = await apiClient.getAdminRegions()
      setAdminRegions(res.data)
    } catch (error) {
      console.error('Failed to load admin regions:', error)
    }
  }

  useEffect(() => {
    // 只在已登录时才加载后端数据
    if (isLoggedIn) {
      loadBackendData()
      loadAdminRegions()
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/notifications`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[WebSocket] Connected to notifications server')
    }

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('[WebSocket] Received:', message.type)

        switch (message.type) {
          case 'logAdded':
            if (message.log) {
              console.log('[WebSocket] New log received:', message.log)
              setSystemLogs(prev => [message.log, ...prev])
            }
            break

          case 'fireEventsUpdated':
            console.log('[WebSocket] Fire events updated, refreshing data')
            await loadFireEvents(firePage, fireLimit)
            break

          case 'fireEventReviewed':
            console.log('[WebSocket] Fire event reviewed:', message.eventId)
            const reviewedEvent = fireEvents.find(e => e.id === parseInt(message.eventId))
            if (reviewedEvent) {
              handlePendingReview(reviewedEvent)
            }
            break

          case 'userUpdated':
            console.log('[WebSocket] User updated:', message.user)
            await loadBackendData()
            break

          case 'zoneUpdated':
            console.log('[WebSocket] Zone updated:', message.zone)
            await loadZones()
            await loadPendingZones()
            break

          case 'fireEventApproved':
            console.log('[WebSocket] Fire event approved:', message.point)
            handlePendingReview(message.point)
            break
        }
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected from notifications server')
    }

    return () => {
      ws.close()
    }
  }, [firePage, fireLimit])

  /**
   * 每次切换到 logs 或 zones 页面时，重新从数据库加载最新数据
   * - logs 页面：重新加载系统日志
   * - zones 页面：重新加载 pending zones（每次都从数据库获取最新状态）
   * - approvals 页面：同时加载 zones 和 pending zones
   */
  useEffect(() => {
    if (!isLoggedIn) return

    if (activeMenu === 'logs') {
      console.log('[Admin] Switching to logs tab, refreshing logs from database...')
      loadBackendData()
    } else if (activeMenu === 'zones' || activeMenu === 'approvals') {
      console.log('[Admin] Switching to zones/approvals tab, refreshing zones from database...')
      loadZones()
      loadPendingZones()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, isLoggedIn])

  // 卫星类型映射：从内部代码转换为完整名称
  const getSatelliteName = (satelliteType: string | null) => {
    if (!satelliteType) return 'Unknown'
    const type = satelliteType.toLowerCase()
    if (type.includes('snpp')) return 'VIIRS S-NPP'
    if (type.includes('noaa-20')) return 'VIIRS NOAA-20'
    if (type.includes('noaa-21')) return 'VIIRS NOAA-21'
    if (type.includes('modis')) return 'MODIS'
    return satelliteType
  }

  // 地区名称格式化
  const formatRegion = (region: string | null) => {
    if (!region) return 'Unknown'
    return region
  }

  const loadFireEvents = async (page = firePage, limit = fireLimit) => {
    setFireLoading(true)
    try {
      const offset = (page - 1) * limit
      console.log('[Admin] Loading fire events from API...')
      const response = await fetch(`/api/fires?limit=${limit}&offset=${offset}&reviewStatus=all`)
      console.log('[Admin] API response status:', response.status)
      const data = await response.json()
      console.log('[Admin] API response data:', data)
      
      if (!data.points || data.points.length === 0) {
        console.log('[Admin] No fire events returned')
        setFireEvents([])
        setFireTotal(0)
        return
      }
      
      const events = data.points.map((point: any) => {
        const reviewStatus = point.review_status || 'pending'
        let status = 'Pending'
        let published = false
        if (reviewStatus === 'approved') {
          status = 'Published'
          published = true
        } else if (reviewStatus === 'dismissed') {
          status = 'Dismissed'
          published = false
        }
        return {
          id: point.id,
          region: formatRegion(point.region),
          satelliteType: getSatelliteName(point.satelliteType),
          location: `${point.latitude.toFixed(4)}° N, ${point.longitude.toFixed(4)}° E`,
          latitude: point.latitude,
          longitude: point.longitude,
          brightness: point.brightness,
          scan: point.scan,
          track: point.track,
          acq_date: point.acq_date,
          acq_time: point.acq_time,
          acq_datetime: point.acq_datetime,
          confidence: point.confidence,
          brightness_2: point.brightness_2,
          frp: point.frp,
          sourceEventId: point.source_event_id,
          status: status,
          published: published,
          review_status: reviewStatus,
          approved_by: point.approved_by,
          approved_at: point.approved_at
        }
      })
      
      console.log('[Admin] Mapped events count:', events.length)
      setFireEvents(events)
      setFireTotal(data.total)
    } catch (error) {
      console.error('[Admin] Failed to load fire events:', error)
    } finally {
      setFireLoading(false)
    }
  }

  const handlePendingReview = (eventData: any) => {
    if (!eventData || !eventData.id) {
      return
    }

    setPendingReviews(prev => {
      const exists = prev.find(r => r.id === eventData.id)
      if (exists) {
        return prev
      }
      return [...prev, eventData]
    })

    if (reviewTimer) {
      clearTimeout(reviewTimer)
    }

    const newTimer = setTimeout(() => {
      setShowReviewNotification(true)
    }, 3000)

    setReviewTimer(newTimer)
  }

  const handleReviewNotificationClose = () => {
    setShowReviewNotification(false)
    setPendingReviews([])
    loadFireEvents(firePage, fireLimit)
  }

  const handleViewReviewItem = (eventId: number) => {
    const event = fireEvents.find(e => e.id === eventId)
    if (event) {
      activeMenu === 'data-audit'
      loadFireEvents(firePage, fireLimit)
    }
    setShowReviewNotification(false)
    setPendingReviews([])
  }

  const handleIngestData = async (region: string = 'All', typename: string = 'all', count: string = '') => {
    if (!canPerform('edit_fire_events')) {
      setToastContent('Permission denied for data ingestion.')
      setToastType('error')
      setShowToast(true)
      return
    }

    setIngesting(true)

    try {
      const params = new URLSearchParams()
      params.set('region', region || 'All')
      params.set('typename', typename || 'all')
      params.set('count', count || 'all')

      const response = await fetch(`/api/fires/ingest?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (result.success) {
        setToastContent(`✓ Fetched ${result.fetchedCount || 0}, Inserted ${result.insertedCount || 0}, Updated ${result.updatedCount || 0}. Reloading…`)
        setToastType('success')
        setShowToast(true)
        await loadFireEvents(1, fireLimit)
        try {
          window.dispatchEvent(new CustomEvent('fire-admin:data-audit-refresh'))
        } catch {}
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.location.reload()
          }, 600)
        }
      } else {
        setToastContent(`✕ ${result.message}`)
        setToastType('error')
        setShowToast(true)
        setIngesting(false)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to trigger data ingestion'
      setToastContent(`✕ ${errorMsg}`)
      setToastType('error')
      setShowToast(true)
      setIngesting(false)
    }
  }

  const handleLogin = async ({ username, password }: { username: string, password: string }) => {
    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedUsername && !trimmedPassword) {
      setMessage('Please enter your username and password.')
      setMessageType('error')
      return false
    }
    if (!trimmedUsername) {
      setMessage('Please enter your username.')
      setMessageType('error')
      return false
    }
    if (!trimmedPassword) {
      setMessage('Please enter your password.')
      setMessageType('error')
      return false
    }

    try {
      const response = await apiClient.login(trimmedUsername, trimmedPassword)
      
      const userData = {
        uid: trimmedUsername,
        username: response.data.user.username,
        role: response.data.user.role === 'admin' ? 'Admin' : 'User',
        token: response.data.token,
        lastLogin: new Date().toLocaleString()
      }

      updateSessionUser(userData)
      await loadBackendData()
      await loadFireEvents(1, fireLimit)
      if (userData.role === 'Admin') {
        await loadAdminRegions()
      }

      setIsTransitioning(true)
      setTimeout(() => {
        setIsTransitioning(false)
      }, 300)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed')
      setMessageType('error')
      return false
    }
  }

  const handleRegister = async ({ username, password, role }: { username: string, password: string, role: string }) => {
    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()
    const trimmedRole = role.trim().toLowerCase()

    if (!trimmedUsername || !trimmedPassword || !trimmedRole) {
      setMessage('Please fill in all fields.')
      setMessageType('error')
      return false
    }

    if (!['admin', 'user'].includes(trimmedRole)) {
      setMessage('Invalid role. Must be "admin" or "user".')
      setMessageType('error')
      return false
    }

    try {
      await apiClient.registerUser(trimmedUsername, trimmedPassword, trimmedRole)
      
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: trimmedUsername,
        username: trimmedUsername,
        action: 'register',
        targetType: 'User',
        targetId: trimmedUsername,
        targetDetails: { role: trimmedRole },
        status: 'success'
      })
      
      setAuthMode('login')
      setMessage('Account created successfully. Please login.')
      setMessageType('success')
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed')
      setMessageType('error')
      return false
    }
  }

  const handleLogout = async () => {
    if (currentUser) {
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: currentUser.uid,
        username: currentUser.username,
        action: 'logout',
        targetType: 'User',
        targetId: currentUser.uid,
        targetDetails: {},
        status: 'success'
      })
    }
    setIsTransitioning(true)
    setTimeout(() => {
      updateSessionUser(null)
      setIsTransitioning(false)
    }, 300)
  }

  const notifyFireEventsChanged = () => {
    console.log('[Admin] Fire events changed notification (now handled by backend WebSocket)')
  }

  const notifyFireEventApproved = (point: any) => {
    console.log('[Admin] Fire event approved notification (now handled by backend WebSocket)', point)
  }

  const handleApplyApproval = async (applicant: string, requestedRole: 'admin' | 'user', reason: string) => {
    try {
      await apiClient.applyApproval(applicant, requestedRole, reason)
      await loadBackendData()
      setMessage('Approval request submitted successfully')
      setMessageType('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit request')
      setMessageType('error')
    }
  }

  const handleReviewApproval = async (id: string, action: 'APPROVED' | 'REJECTED', comment: string) => {
    try {
      await apiClient.reviewApproval(id, action, comment)
      await loadBackendData()
      setMessage('Approval reviewed successfully')
      setMessageType('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to review approval')
      setMessageType('error')
    }
  }

  const handleApproveEvent = async (eventId: number | string) => {
    if (!canPerform('edit_fire_events')) {
      setMessage('Permission denied for event approval.')
      setMessageType('error')
      return
    }
    const updatedEvent = fireEvents.find((e) => e.id === eventId)
    if (updatedEvent) {
      const newEvent = { ...updatedEvent, status: 'Published', published: true }
      setFireEvents((current) => current.map((event) => (event.id === eventId ? newEvent : event)))
      await updateFireEvent(newEvent)
      notifyFireEventsChanged()
      notifyFireEventApproved(newEvent)
    }
    try {
      await apiClient.reviewFireEvent(Number(eventId), 'approved')
    } catch (error) {
      console.error('Failed to update review status on backend:', error)
    }
    await appendLog({
      timestamp: new Date().toISOString(),
      userId: currentUser?.uid || 'system',
      username: currentUser?.username || 'system',
      action: 'approve_fire_event',
      targetType: 'FireEvent',
      targetId: String(eventId),
      targetDetails: { eventId },
      status: 'success'
    })
    setMessage('Event approved and published.')
    setMessageType('success')
  }

  const handleDismissEvent = async (eventId: number | string) => {
    if (!canPerform('edit_fire_events')) {
      setMessage('Permission denied for event dismissal.')
      return
    }
    const updatedEvent = fireEvents.find((e) => e.id === eventId)
    if (updatedEvent) {
      const newEvent = { ...updatedEvent, status: 'Dismissed', published: false }
      setFireEvents((current) => current.map((event) => (event.id === eventId ? newEvent : event)))
      await updateFireEvent(newEvent)
      notifyFireEventsChanged()
    }
    try {
      await apiClient.reviewFireEvent(Number(eventId), 'dismissed')
    } catch (error) {
      console.error('Failed to update review status on backend:', error)
    }
    await appendLog({
      timestamp: new Date().toISOString(),
      userId: currentUser?.uid || 'system',
      username: currentUser?.username || 'system',
      action: 'dismiss_fire_event',
      targetType: 'FireEvent',
      targetId: String(eventId),
      targetDetails: { eventId },
      status: 'success'
    })
    setMessage('Event dismissed and flagged.')
    setMessageType('error')
  }

  const handleAddUser = async (newUser: any) => {
    if (!canPerform('manage_users')) {
      setMessage('Permission denied to add a system user.')
      return false
    }
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setMessage('Username and password are required.')
      return false
    }
    try {
      const response = await apiClient.registerUser(
        newUser.username.trim(),
        newUser.password,
        newUser.role.toLowerCase()
      )
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'system',
        action: 'create_user',
        targetType: 'User',
        targetId: String(response.data.id),
        targetDetails: { username: newUser.username, role: newUser.role },
        status: 'success'
      })
      await loadBackendData()
      setMessage(`User ${newUser.username} added successfully.`)
      return true
    } catch (error: any) {
      const errorMessage = error?.message || ''
      if (errorMessage.includes('409') || errorMessage.includes('already exists')) {
        setMessage('Username already exists.')
      } else {
        setMessage(`Failed to add user: ${errorMessage}`)
      }
      return false
    }
  }

  const handleDeleteUser = async (uid: string) => {
    if (!canPerform('manage_users')) {
      setMessage('Permission denied to delete user.')
      return
    }
    if (!canPerform('delete_users')) {
      setMessage('Permission denied. Admin only.')
      setMessageType('error')
      return
    }

    if (currentUser?.uid === uid) {
      setMessage('You cannot delete the currently signed-in account.')
      return
    }
    
    const userToDelete = users.find((user) => user.uid === uid)
    if (!userToDelete) {
      setMessage('User not found.')
      return
    }

    try {
      await apiClient.deleteUser(userToDelete.username)
      
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'system',
        action: 'delete_user',
        targetType: 'User',
        targetId: uid,
        targetDetails: {},
        status: 'success'
    })
    await loadBackendData()
    setMessage('User revoked successfully.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete user')
      setMessageType('error')
    }
  }

  const loadPendingUsers = async () => {
    if (!canPerform('manage_users')) return
    setLoadingPendingUsers(true)
    try {
      const response = await apiClient.getPendingUsers()
      setPendingUsers(response.data)
    } catch (error) {
      console.error('Failed to load pending users:', error)
    } finally {
      setLoadingPendingUsers(false)
    }
  }

  const handleApproveUser = async (username: string, comment?: string) => {
    if (!canPerform('approve_users')) {
      setMessage('Permission denied. Admin only.')
      setMessageType('error')
      return
    }
    try {
      await apiClient.approveUser(username, comment)
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'system',
        action: 'approve_user',
        targetType: 'User',
        targetId: username,
        targetDetails: { comment },
        status: 'success'
      })
      await loadPendingUsers()
      await loadBackendData()
      setMessage(`User ${username} approved successfully.`)
      setMessageType('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to approve user')
      setMessageType('error')
    }
  }

  const handleRejectUser = async (username: string, comment?: string) => {
    if (!canPerform('reject_users')) {
      setMessage('Permission denied. Admin only.')
      setMessageType('error')
      return
    }
    try {
      await apiClient.rejectUser(username, comment)
      await appendLog({
        timestamp: new Date().toISOString(),
        userId: currentUser?.uid || 'system',
        username: currentUser?.username || 'system',
        action: 'reject_user',
        targetType: 'User',
        targetId: username,
        targetDetails: { comment },
        status: 'success'
      })
      await loadPendingUsers()
      setMessage(`User ${username} rejected and removed.`)
      setMessageType('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reject user')
      setMessageType('error')
    }
  }

  const handleSaveZone = async () => {
    if (!canPerform('manage_zones')) {
      setMessage('Permission denied to manage zones.')
      return false
    }
    if (!zoneForm.name.trim()) {
      setMessage('Zone name is required.')
      return false
    }
    let updatedZones: any[] = []
    const newZone = {
      ...zoneForm,
      zoneId: `zone-${Date.now()}`,
      createdBy: currentUser?.username || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    updatedZones = [...zones, newZone]
    setMessage('New zone created successfully.')
    await saveZoneList(updatedZones)
    setZoneForm(emptyZone)
    return true
  }

  const handleDeleteZone = async (zoneId: string) => {
    if (!canPerform('manage_zones')) {
      setMessage('Permission denied to delete zones.')
      return
    }
    try {
      await apiClient.deleteZone(zoneId)
      await loadZones()
      setMessage('Zone deleted successfully.')
      setMessageType('success')
    } catch (error) {
      setMessage('Failed to delete zone.')
      setMessageType('error')
    }
  }

  const handleSyncZones = async () => {
    console.log('[Admin] handleSyncZones called')
    setSyncingZones(true)
    try {
      console.log('[Admin] Calling apiClient.syncHighRiskZones(168)')
      const result = await apiClient.syncHighRiskZones(168)
      console.log('[Admin] syncHighRiskZones result:', result)
      const zonesResult = await apiClient.getZones()
      setZones(zonesResult.data || [])
      await loadPendingZones()
      setMessage(`Synced zones: added=${result.added}, removed=${result.removed}`)
      setMessageType('success')
    } catch (error) {
      console.error('[Admin] syncHighRiskZones error:', error)
      setMessage('Failed to sync zones: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setMessageType('error')
    } finally {
      setSyncingZones(false)
    }
  }

  const loadZones = async () => {
    try {
      const result = await apiClient.getZones()
      setZones(result.data || [])
    } catch (error) {
      console.error('Failed to load zones:', error)
    }
  }

  const loadPendingZones = async () => {
    setLoadingPendingZones(true)
    try {
      console.log('[Admin] Loading pending zones...')
      const result = await apiClient.getPendingZones()
      console.log('[Admin] getPendingZones result:', result)
      setPendingZones(result.data || [])
    } catch (error) {
      console.error('[Admin] loadPendingZones error:', error)
    } finally {
      setLoadingPendingZones(false)
    }
  }

  const handleApproveZone = async (zoneId: string) => {
    try {
      await apiClient.approveZone(zoneId)
      await loadZones()
      await loadPendingZones()
      setMessage(`Zone ${zoneId} approved.`)
      setMessageType('success')
    } catch (error) {
      setMessage('Failed to approve zone.')
      setMessageType('error')
    }
  }

  const handleRejectZone = async (zoneId: string) => {
    try {
      await apiClient.rejectZone(zoneId)
      await loadZones()
      await loadPendingZones()
      setMessage(`Zone ${zoneId} rejected.`)
      setMessageType('success')
    } catch (error) {
      setMessage('Failed to reject zone.')
      setMessageType('error')
    }
  }

  const handleExportData = async () => {
    try {
      setBackupStatus('Exporting data...')
      const blob = await apiClient.exportData()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = `fire-detection-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      const historyEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        filename,
        type: 'export',
        size: blob.size,
        status: 'success'
      }
      setBackupHistory((prev) => [historyEntry, ...prev].slice(0, 20))
      setBackupStatus('Backup exported successfully.')
    } catch (error) {
      console.error(error)
      setBackupStatus('Backup export failed: ' + (error as Error).message)
    }
  }

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setBackupStatus('Processing file...')
      let data: any
      
      if (apiClient.isGzipFile(file.name)) {
        setBackupStatus('Decompressing file...')
        data = await apiClient.decompressGzip(file)
      } else {
        // normal JSON file
        const reader = new FileReader()
        data = await new Promise((resolve, reject) => {
          reader.onload = () => {
            try {
              resolve(JSON.parse(reader.result as string))
            } catch (e) {
              reject(e)
            }
          }
          reader.onerror = reject
          reader.readAsText(file)
        })
      }

      setBackupStatus('Importing data...')
      await apiClient.importData(data)
      
      // refresh
      const [usersRes, zonesRes] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getZones()
      ])
      setUsers(usersRes.data)
      setZones(zonesRes.data)
      
      const historyEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        filename: file.name,
        type: 'import',
        size: file.size,
        status: 'success'
      }
      setBackupHistory((prev) => [historyEntry, ...prev].slice(0, 20))
      setBackupStatus('Backup imported successfully.')
    } catch (error) {
      console.error(error)
      setBackupStatus('Backup import failed: ' + (error as Error).message)
    }
  }

  const activeMenuLabel = useMemo(() => {
    const labels: Record<string, string> = {
      'data-audit': 'Data Audit',
      rbac: 'RBAC Management',
      zones: 'High-Risk Zones',
      approvals: 'Permission Approvals',
      logs: 'All Logs',
      backup: 'Backup & Restore'
    }
    return labels[activeMenu] || 'Data Audit'
  }, [activeMenu])

  if (loading) {
    return <div className="page-shell"><div className="loading-card">Loading admin console…</div></div>
  }

  return (
    <div className={`${isLoggedIn ? 'app-container' : 'login-wrapper'} ${isTransitioning ? 'transitioning' : ''}`}>
      {!isLoggedIn ? (
        <>
          <div className="login-bg">
            <div className="bg-orb bg-orb--fire" />
            <div className="bg-orb bg-orb--blue" />
            <div className="bg-orb bg-orb--accent" />
            <div className="bg-grid" />
          </div>
          <div className="login-frost" />
          {showToast && toastContent && <div className={`auth-toast ${toastType}`} role="alert">{toastContent}</div>}
          <div className="login-shell" data-auth-mode={authMode}>
            <div className={`login-card ${authMode === 'login' ? 'login-mode' : 'register-mode'}`}>
              <AuthForm
                mode={authMode}
                onLogin={handleLogin}
                onRegister={handleRegister}
                onSwitchMode={(nextMode) => {
                  setMessage('')
                  setMessageType('error')
                  setAuthMode(nextMode)
                }}
                onClearMessage={() => {
                  setMessage('')
                  setMessageType('error')
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="admin-bg">
            <div className="bg-orb bg-orb--fire" />
            <div className="bg-orb bg-orb--blue" />
            <div className="bg-orb bg-orb--accent" />
            <div className="bg-grid" />
          </div>
          <div className="admin-frost" />
          <div className="admin-layout">
            <header className="admin-header">
              <div className="brand" onClick={() => window.location.href = '/map'} title="Back to Map" style={{ cursor: 'pointer' }}>
                <div className="w-11 h-11 rounded-full bg-gradient-to-r from-orange-500 to-red-600 shadow-xl shadow-orange-500/20 flex items-center justify-center">
                  <span className="text-white font-extrabold text-lg tracking-[0.15em]">F</span>
                </div>
                <span className="title">Fire Admin</span>
              </div>
              <div className="user-profile">
                <div className="user-info">
                  <span className="username">{currentUser?.username}</span>
                  <span className={`badge ${currentUser?.role === 'Admin' ? 'danger' : currentUser?.role === 'User' ? 'success' : 'warning'}`}>{currentUser?.role}</span>
                </div>
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
                <button className="button button-primary button-sm back-to-map-btn" onClick={() => window.location.href = '/map'}>Back to Map</button>
              </div>
            </header>

            <div className="admin-body">
              <aside className="admin-aside">
                <div className="aside-title">Core Administration</div>
                {menuItems.map((item) => {
                  if (item.adminOnly && !canPerform('manage_users')) return null
                  return (
                    <button
                      key={item.key}
                      className={`nav-item ${activeMenu === item.key ? 'active' : ''}`}
                      onClick={() => {
                        if (activeMenu === item.key) return
                        setContentAnimating(true)
                        setTimeout(() => {
                          setActiveMenu(item.key)
                          setTimeout(() => setContentAnimating(false), 50)
                        }, 200)
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </aside>

              <main className="admin-main">
                <div className={`popup-toast ${toastType} ${showToast ? 'visible' : ''}`}>
                  {toastContent}
                </div>
                
                {showReviewNotification && pendingReviews.length > 0 && (
                  <div className="review-notification-overlay" onClick={handleReviewNotificationClose}>
                    <div className="review-notification" onClick={(e) => e.stopPropagation()}>
                      <div className="review-notification-header">
                        <div className="review-notification-title">
                          <span className="notification-icon">📋</span>
                          <span>Application Data Update Notification</span>
                        </div>
                        <button className="review-notification-close" onClick={handleReviewNotificationClose}>
                          ✕
                        </button>
                      </div>
                      
                      <div className="review-notification-summary">
                        <div className="summary-item">
                          <span className="summary-label">Number of Pending Reviews：</span>
                          <span className="summary-value">{pendingReviews.length} Reviews</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Source：</span>
                          <span className="summary-value">Satellite Monitoring System</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Data Type：</span>
                          <span className="summary-value">Fire Event</span>
                        </div>
                      </div>
                      
                      <div className="review-notification-list">
                        {pendingReviews.slice(0, 5).map((review, index) => (
                          <div key={review.id} className="review-item" onClick={() => handleViewReviewItem(review.id)}>
                            <span className="review-item-index">{index + 1}</span>
                            <div className="review-item-info">
                              <div className="review-item-location">
                                📍 {review.latitude?.toFixed(4)}, {review.longitude?.toFixed(4)}
                              </div>
                              <div className="review-item-details">
                                <span className="review-item-satellite">{getSatelliteName(review.satellite)}</span>
                                <span className="review-item-time">{review.acq_datetime}</span>
                              </div>
                            </div>
                            <span className="review-item-action">Check →</span>
                          </div>
                        ))}
                        {pendingReviews.length > 5 && (
                          <div className="review-item-more">
                            ... There are {pendingReviews.length - 5} more reviews
                          </div>
                        )}
                      </div>
                      
                      <div className="review-notification-actions">
                        <button className="btn btn-secondary" onClick={() => {
                          setActiveMenu('data-audit')
                          handleReviewNotificationClose()
                        }}>
                          Check All ({pendingReviews.length})
                        </button>
                        <button className="btn btn-primary" onClick={handleReviewNotificationClose}>
                          Process Later
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className={`content-card ${contentAnimating ? 'content-transitioning' : ''}`}>
                  <div className="content-header">
                    <div>
                      <h2>{activeMenuLabel}</h2>
                      <p className="subtitle">
                        {activeMenu === 'data-audit'
                          ? 'Review and audit satellite fire events before publication.'
                          : activeMenu === 'rbac'
                          ? 'Manage system users and role-based permissions.'
                          : activeMenu === 'zones'
                          ? 'Configure and monitor high-risk fire zones.'
                          : activeMenu === 'logs'
                          ? 'Inspect application operation logs.'
                          : 'Export and import the application backup data.'}
                      </p>
                    </div>
                  </div>

                  {activeMenu === 'data-audit' && (
                    <DataAuditSection
                      canEdit={canPerform('edit_fire_events')}
                      onApprove={handleApproveEvent}
                      onDismiss={handleDismissEvent}
                      onIngest={handleIngestData}
                      ingesting={ingesting}
                    />
                  )}
                  {activeMenu === 'rbac' && (
                    <RBACSection
                      users={users}
                      canManage={canPerform('manage_users')}
                      onAddUser={handleAddUser}
                      onDeleteUser={handleDeleteUser}
                    />
                  )}
                  {activeMenu === 'zones' && (
                    <ZonesSection
                      zones={zones}
                      canManage={canPerform('manage_zones')}
                      zoneForm={zoneForm}
                      setZoneForm={setZoneForm}
                      emptyZone={emptyZone}
                      onSaveZone={handleSaveZone}
                      onDeleteZone={handleDeleteZone}
                      onSyncZones={handleSyncZones}
                      onApproveZone={handleApproveZone}
                      onRejectZone={handleRejectZone}
                      pendingZones={pendingZones}
                      loadingPending={loadingPendingZones}
                      syncing={syncingZones}
                    />
                  )}
                  {activeMenu === 'approvals' && (
                    <ApprovalsSection
                      onApproveUser={handleApproveUser}
                      onRejectUser={handleRejectUser}
                      onLoadPendingUsers={loadPendingUsers}
                      pendingUsers={pendingUsers}
                      loading={loadingPendingUsers}
                      isAdmin={currentUser?.role === 'Admin'}
                    />
                  )}
                  {activeMenu === 'logs' && <LogsSection systemLogs={systemLogs} />}
                  {activeMenu === 'backup' && <BackupSection onExport={handleExportData} onImport={handleImportData} backupHistory={backupHistory} status={backupStatus} isAdmin={currentUser?.role === 'Admin'} />}
                </div>
              </main>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AuthForm({ mode, onLogin, onRegister, onSwitchMode, onClearMessage }: {
  mode: string,
  onLogin: (data: { username: string, password: string }) => Promise<boolean>,
  onRegister: (data: { username: string, password: string, role: string }) => Promise<boolean>,
  onSwitchMode: (mode: string) => void,
  onClearMessage: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('User')
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode === 'login') {
      await onLogin({ username, password })
    } else {
      const saved = await onRegister({ username, password, role })
      if (saved) {
        setUsername('')
        setPassword('')
        setRole('User')
      }
    }
  }

  const handleBack = () => {
    router.push('/home')
  }

  return (
    <div className="login-container">
      <div className="login-panel-left">
        <button className="back-button" type="button" onClick={handleBack}>
          ← Back to Platform
        </button>
        <div className="welcome-content">
          <div className="welcome-top">
            <div className="brand-left">
              <div className="brand-logo">F</div>
              <span className="brand-name">Fire Admin</span>
            </div>
            <h1 className="welcome-title">{mode === 'login' ? 'Hello, Welcome!' : 'Join the Platform'}</h1>
            <p className="welcome-subtitle">
              Cross-jurisdictional fire monitoring & administration platform
            </p>
            <p className="welcome-hint">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </p>
          </div>
          <div className="welcome-bottom">
            <button className="button button-outline" type="button" onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>

      <div className="login-panel-right">
        <div className="login-header">
          <h2 className="login-title">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <p className="login-desc">
            {mode === 'login'
              ? 'Enter your credentials to access the admin panel'
              : 'Register a new system user and select an authorization tier'}
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="input-label">Username</label>
          <input
            className="input-field"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              onClearMessage?.()
            }}
            placeholder="Enter admin username"
          />
          <label className="input-label">Password</label>
          <input
            className="input-field"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              onClearMessage?.()
            }}
            placeholder="Enter security password"
          />
          {mode === 'register' && (
            <>
              <label className="input-label">System Identity / Role</label>
              <select className="select-field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="Admin">Admin</option>
                <option value="User">User</option>
              </select>
            </>
          )}
          <button className="button button-primary login-submit" type="submit">
            {mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Column configuration with default widths
const COLUMNS = [
  { key: 'id', label: 'ID', defaultWidth: 80 },
  { key: 'region', label: 'Region', defaultWidth: 220 },
  { key: 'satelliteType', label: 'Satellite', defaultWidth: 220 },
  { key: 'latitude', label: 'Latitude', defaultWidth: 120 },
  { key: 'longitude', label: 'Longitude', defaultWidth: 120 },
  { key: 'brightness', label: 'Brightness', defaultWidth: 120 },
  { key: 'scan', label: 'Scan', defaultWidth: 80 },
  { key: 'track', label: 'Track', defaultWidth: 80 },
  { key: 'acq_datetime', label: 'Acquisition Time', defaultWidth: 280 },
  { key: 'confidence', label: 'Confidence', defaultWidth: 150 },
  { key: 'brightness_2', label: 'Brightness_2', defaultWidth: 140 },
  { key: 'frp', label: 'FRP', defaultWidth: 100 },
  { key: 'status', label: 'Status', defaultWidth: 120 },
  { key: 'actions', label: 'Actions', defaultWidth: 160 }
]

const STORAGE_KEY = 'fire-admin-table-column-widths'

function DataAuditSection({ 
  canEdit, 
  onApprove, 
  onDismiss, 
  onIngest,
  ingesting,
}: {
  canEdit: boolean
  onApprove: (id: number) => void
  onDismiss: (id: number) => void
  onIngest: (region: string, typename: string, count: string) => Promise<void>
  ingesting: boolean
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchField, setSearchField] = useState<string>('all')
  const [approvedExpanded, setApprovedExpanded] = useState(false)
  const [pendingExpanded, setPendingExpanded] = useState(true)
  
  const pageSize = 20
  
  const [pendingTotal, setPendingTotal] = useState(0)
  const [approvedTotal, setApprovedTotal] = useState(0)
  const [pendingEvents, setPendingEvents] = useState<any[]>([])
  const [approvedEvents, setApprovedEvents] = useState<any[]>([])
  const [loadingPending, setLoadingPending] = useState(false)
  const [loadingApproved, setLoadingApproved] = useState(false)
  const [pendingHistory, setPendingHistory] = useState<any[][]>([])
  const [approvedHistory, setApprovedHistory] = useState<any[][]>([])

  useEffect(() => {
    loadCounts()
  }, [])

  // 监听 Update Data 完成后父组件派发的事件，立即拉取最新数据
  useEffect(() => {
    const handler = () => {
      handleRefresh()
    }
    window.addEventListener('fire-admin:data-audit-refresh', handler)
    return () => window.removeEventListener('fire-admin:data-audit-refresh', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCounts = async () => {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch('/api/fires?limit=0&reviewStatus=pending'),
        fetch('/api/fires?limit=0&reviewStatus=approved')
      ])
      const pendingData = await pendingRes.json()
      const approvedData = await approvedRes.json()
      setPendingTotal(pendingData.total || 0)
      setApprovedTotal(approvedData.total || 0)
    } catch (error) {
      console.error('Failed to load counts:', error)
    }
  }

  useEffect(() => {
    if (pendingExpanded && pendingTotal > 0 && pendingEvents.length === 0) {
      loadPendingData()
    }
  }, [pendingExpanded, pendingTotal])

  useEffect(() => {
    if (approvedExpanded && approvedTotal > 0 && approvedEvents.length === 0) {
      loadApprovedData()
    }
  }, [approvedExpanded, approvedTotal])

  const loadPendingData = async (cursor?: number) => {
    setLoadingPending(true)
    try {
      const cursorParam = cursor ? `&cursor=${cursor}` : ''
      const response = await fetch(`/api/fires?limit=${pageSize}${cursorParam}&reviewStatus=pending`)
      const data = await response.json()
      const events = data.points.map((point: any) => ({
        id: point.id,
        region: point.region || 'Unknown',
        satelliteType: point.satelliteType || 'Unknown',
        location: `${point.latitude?.toFixed(4)}° N, ${point.longitude?.toFixed(4)}° E`,
        latitude: point.latitude,
        longitude: point.longitude,
        brightness: point.brightness,
        scan: point.scan,
        track: point.track,
        acq_date: point.acq_date,
        acq_time: point.acq_time,
        acq_datetime: point.acq_datetime,
        confidence: point.confidence,
        brightness_2: point.brightness_2,
        frp: point.frp,
        status: 'Pending',
        published: false
      }))
      setPendingEvents(events)
    } catch (error) {
      console.error('Failed to load pending data:', error)
    } finally {
      setLoadingPending(false)
    }
  }

  const loadApprovedData = async (cursor?: number) => {
    setLoadingApproved(true)
    try {
      const cursorParam = cursor ? `&cursor=${cursor}` : ''
      const response = await fetch(`/api/fires?limit=${pageSize}${cursorParam}&reviewStatus=approved`)
      const data = await response.json()
      const events = data.points.map((point: any) => ({
        id: point.id,
        region: point.region || 'Unknown',
        satelliteType: point.satelliteType || 'Unknown',
        location: `${point.latitude?.toFixed(4)}° N, ${point.longitude?.toFixed(4)}° E`,
        latitude: point.latitude,
        longitude: point.longitude,
        brightness: point.brightness,
        scan: point.scan,
        track: point.track,
        acq_date: point.acq_date,
        acq_time: point.acq_time,
        acq_datetime: point.acq_datetime,
        confidence: point.confidence,
        brightness_2: point.brightness_2,
        frp: point.frp,
        status: 'Published',
        published: true
      }))
      setApprovedEvents(events)
    } catch (error) {
      console.error('Failed to load approved data:', error)
    } finally {
      setLoadingApproved(false)
    }
  }

  const handlePendingPrevPage = async () => {
    if (pendingHistory.length > 0) {
      const prevPage = pendingHistory[pendingHistory.length - 1]
      setPendingHistory(pendingHistory.slice(0, -1))
      setPendingEvents(prevPage)
    }
  }

  const handlePendingNextPage = async () => {
    const lastEvent = pendingEvents[pendingEvents.length - 1]
    if (lastEvent) {
      setPendingHistory([...pendingHistory, pendingEvents])
      await loadPendingData(Number(lastEvent.id))
    }
  }

  const handleApprovedPrevPage = async () => {
    if (approvedHistory.length > 0) {
      const prevPage = approvedHistory[approvedHistory.length - 1]
      setApprovedHistory(approvedHistory.slice(0, -1))
      setApprovedEvents(prevPage)
    }
  }

  const handleApprovedNextPage = async () => {
    const lastEvent = approvedEvents[approvedEvents.length - 1]
    if (lastEvent) {
      setApprovedHistory([...approvedHistory, approvedEvents])
      await loadApprovedData(Number(lastEvent.id))
    }
  }

  const handleRefresh = async () => {
    await loadCounts()
    setPendingHistory([])
    setApprovedHistory([])
    if (pendingExpanded) await loadPendingData()
    if (approvedExpanded) await loadApprovedData()
  }

  function matchesSearch(event: any, query: string, field: string): boolean {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    if (field === 'all') {
      return (
        String(event.id).toLowerCase().includes(q) ||
        (event.region || '').toLowerCase().includes(q) ||
        (event.satelliteType || '').toLowerCase().includes(q) ||
        (event.location || '').toLowerCase().includes(q) ||
        String(event.confidence || '').toLowerCase().includes(q)
      )
    }
    const val = event[field]
    return String(val || '').toLowerCase().includes(q)
  }

  const filteredPendingEvents = pendingEvents.filter(e => matchesSearch(e, searchQuery, searchField))
  const filteredApprovedEvents = approvedEvents.filter(e => matchesSearch(e, searchQuery, searchField))

  const handleBulkApprove = async () => {
    if (!canEdit || filteredPendingEvents.length === 0) return
    for (const event of filteredPendingEvents) {
      await onApprove(event.id)
    }
    await handleRefresh()
  }

  const handleBulkDismiss = async () => {
    if (!canEdit || filteredPendingEvents.length === 0) return
    for (const event of filteredPendingEvents) {
      await onDismiss(event.id)
    }
    await handleRefresh()
  }

  const handleIngest = (region: string, typename: string, count: string) => {
    onIngest(region, typename, count)
  }

  const regions = ['All', 'Canada', 'Alaska', 'USA_contiguous_and_Hawaii', 'Central_America', 'South_America', 'Europe', 'Northern_and_Central_Africa', 'Southern_Africa', 'Russia_Asia', 'South_Asia', 'SouthEast_Asia', 'Australia_NewZealand']
  const typenameOptions = [
    { value: 'all', label: 'All Satellites' },
    { value: 'ms:fires_snpp_24hrs', label: 'VIIRS S-NPP (24h)' },
    { value: 'ms:fires_noaa20_24hrs', label: 'VIIRS NOAA-20 (24h)' },
    { value: 'ms:fires_noaa21_24hrs', label: 'VIIRS NOAA-21 (24h)' },
    { value: 'ms:fires_modis_24hrs', label: 'MODIS (24h)' },
    { value: 'ms:fires_snpp_7days', label: 'VIIRS S-NPP (7d)' },
    { value: 'ms:fires_noaa20_7days', label: 'VIIRS NOAA-20 (7d)' },
    { value: 'ms:fires_noaa21_7days', label: 'VIIRS NOAA-21 (7d)' },
    { value: 'ms:fires_modis_7days', label: 'MODIS (7d)' },
  ]
  const [selectedRegion, setSelectedRegion] = useState('All')
  const [selectedTypename, setSelectedTypename] = useState('all')
  // 留空表示获取所有数据；填入数字时按指定数量分页拉取
  const [recordCount, setRecordCount] = useState('')

  return (
    <div className="audit-section">
      <div className="audit-header">
        <div className="audit-header-top">
          <div className="audit-header-actions">
            <div className="ingest-controls">
              <select 
                className="select-field ingest-select" 
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                disabled={ingesting}
              >
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select 
                className="select-field ingest-select" 
                value={selectedTypename}
                onChange={(e) => setSelectedTypename(e.target.value)}
                disabled={ingesting}
              >
                {typenameOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                type="number"
                className="input-field ingest-count"
                value={recordCount}
                onChange={(e) => setRecordCount(e.target.value)}
                placeholder="Count (blank = all)"
                disabled={ingesting}
                min="1"
              />
              <button 
                className="button button-primary ingest-btn" 
                onClick={() => handleIngest(selectedRegion, selectedTypename, recordCount)}
                disabled={ingesting || !canEdit}
              >
                {ingesting ? '⟳ Fetching...' : '⟳ Update Data'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="audit-search-bar">
        <div className="search-bar-left">
          <select 
            className="select-field search-field-select" 
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
          >
            <option value="all">All Fields</option>
            <option value="id">ID</option>
            <option value="region">Region</option>
            <option value="satelliteType">Satellite</option>
            <option value="confidence">Confidence</option>
          </select>
          <input
            type="text"
            className="input-field search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fire events..."
          />
          {searchQuery && (
            <button 
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        <div className="search-results-info">
          <span>Pending: {pendingTotal}, Approved: {approvedTotal}</span>
        </div>
      </div>

      <div className="audit-tables-container">
        <div className={`audit-table-section${pendingExpanded ? '' : ' collapsed'}`}>
          <div className="table-section-header" onClick={() => {
            if (pendingExpanded) {
              setPendingExpanded(false)
            } else {
              setPendingExpanded(true)
              setApprovedExpanded(false)
            }
          }}>
            <div className="table-section-title">
              <span className="expand-icon">{pendingExpanded ? '▼' : '▶'}</span>
              <h4>Pending Approval</h4>
              <span className="badge badge-warning">{pendingTotal}</span>
            </div>
            {canEdit && filteredPendingEvents.length > 0 && (
              <div className="bulk-actions" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="button button-success" 
                  onClick={handleBulkApprove}
                >
                  ✓ Approve All
                </button>
                <button 
                  className="button button-danger" 
                  onClick={handleBulkDismiss}
                >
                  ✕ Dismiss All
                </button>
              </div>
            )}
          </div>
          <div className={`table-content${pendingExpanded ? ' expanded' : ''}`}>
            <AuditTable
              events={filteredPendingEvents}
              canEdit={canEdit}
              onApprove={onApprove}
              onDismiss={onDismiss}
              fireLoading={loadingPending}
              totalEvents={pendingTotal}
              hasPrev={pendingHistory.length > 0}
              hasMore={filteredPendingEvents.length >= pageSize}
              onPrevPage={handlePendingPrevPage}
              onNextPage={handlePendingNextPage}
            />
          </div>
        </div>

        <div className={`audit-table-section${approvedExpanded ? '' : ' collapsed'}`}>
          <div className="table-section-header" onClick={() => {
            if (approvedExpanded) {
              setApprovedExpanded(false)
            } else {
              setApprovedExpanded(true)
              setPendingExpanded(false)
            }
          }}>
            <div className="table-section-title">
              <span className="expand-icon">{approvedExpanded ? '▼' : '▶'}</span>
              <h4>Approved & Published</h4>
              <span className="badge badge-success">{approvedTotal}</span>
            </div>
          </div>
          <div className={`table-content${approvedExpanded ? ' expanded' : ''}`}>
            <AuditTable
              events={filteredApprovedEvents}
              canEdit={false}
              onApprove={onApprove}
              onDismiss={onDismiss}
              fireLoading={loadingApproved}
              totalEvents={approvedTotal}
              hasPrev={approvedHistory.length > 0}
              hasMore={filteredApprovedEvents.length >= pageSize}
              onPrevPage={handleApprovedPrevPage}
              onNextPage={handleApprovedNextPage}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditTable({ events, canEdit, onApprove, onDismiss, fireLoading, totalEvents, hasPrev, hasMore, onPrevPage, onNextPage }: {
  events: any[]
  canEdit: boolean
  onApprove: (id: number) => void
  onDismiss: (id: number) => void
  fireLoading: boolean
  totalEvents?: number
  hasPrev?: boolean
  hasMore?: boolean
  onPrevPage?: () => void
  onNextPage?: () => void
}) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('auditColumnWidths')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
      }
    }
    return COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  })

  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    startXRef.current = e.clientX
    startWidthRef.current = columnWidths[columnKey]
  }

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidthRef.current + (e.clientX - startXRef.current))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingColumn])

  useEffect(() => {
    localStorage.setItem('auditColumnWidths', JSON.stringify(columnWidths))
  }, [columnWidths])

  const formatCellValue = (event: any, columnKey: string): string => {
    switch (columnKey) {
      case 'id':
        return String(event.id)
      case 'region':
        return event.region || ''
      case 'satelliteType':
        return event.satelliteType || ''
      case 'latitude':
        return event.latitude?.toFixed(4) || ''
      case 'longitude':
        return event.longitude?.toFixed(4) || ''
      case 'brightness':
        return event.brightness !== null && event.brightness !== undefined ? String(event.brightness) : ''
      case 'scan':
        return event.scan !== null && event.scan !== undefined ? String(event.scan) : ''
      case 'track':
        return event.track !== null && event.track !== undefined ? String(event.track) : ''
      case 'acq_datetime':
        if (event.acqDatetime) return new Date(event.acqDatetime).toLocaleString()
        if (event.acq_datetime) return new Date(event.acq_datetime).toLocaleString()
        return '-'
      case 'confidence':
        return event.confidence !== null && event.confidence !== undefined ? String(event.confidence) : ''
      case 'brightness_2':
        const b2 = event.brightness_2 !== null && event.brightness_2 !== undefined ? event.brightness_2 : event.brightness2
        return b2 !== null && b2 !== undefined ? String(b2) : ''
      case 'frp':
        return event.frp !== null && event.frp !== undefined ? String(event.frp) : ''
      case 'status':
        return event.status || ''
      default:
        return ''
    }
  }

  

  if (events.length === 0) {
    return <div className="table-empty">No events found</div>
  }

  const displayColumns = canEdit ? COLUMNS : COLUMNS.filter(col => col.key !== 'actions')

  return (
    <div className="audit-table-container">
      {fireLoading && <div className="table-loading-overlay">Loading fire events...</div>}
      <div className="audit-table-wrapper">
        <div className="audit-table-scrollable">
          <div className="audit-thead">
            <div className="audit-thead-row">
              {displayColumns.map((col, index) => (
                <div 
                  key={col.key}
                  className={`audit-th ${resizingColumn === col.key ? 'resizing' : ''}`}
                  style={{ 
                    minWidth: `${columnWidths[col.key]}px`, 
                    width: `${columnWidths[col.key]}px` 
                  }}
                >
                  {col.label}
                  {index < displayColumns.length - 1 && (
                    <div 
                      className={`resize-handle ${resizingColumn === col.key ? 'active' : ''}`}
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="audit-tbody-wrapper">
            <div className="audit-tbody">
              {events.map((event) => (
                <div key={event.id} className="audit-tr">
                  {displayColumns.map((col) => (
                    <div 
                      key={col.key}
                      className="audit-td"
                      style={{ 
                        minWidth: `${columnWidths[col.key]}px`, 
                        width: `${columnWidths[col.key]}px` 
                      }}
                      data-tooltip={col.key !== 'actions' ? formatCellValue(event, col.key) : undefined}
                    >
                      {col.key === 'confidence' ? (
                        <span className={`badge ${
                          event.confidence === 'high' || event.confidence === 'HIGH' ? 'danger' : 
                          event.confidence === 'nominal' || event.confidence === 'MEDIUM' || 
                          (typeof event.confidence === 'string' && event.confidence.toLowerCase() === 'n') ? 'warning' : 'info'
                        }`}>
                          {event.confidence}
                        </span>
                      ) : col.key === 'status' ? (
                        <span className={`badge ${event.status === 'Pending' ? 'warning' : event.status === 'Published' ? 'success' : 'info'}`}>
                          {event.status}
                        </span>
                      ) : col.key === 'actions' ? (
                        <div className="panel-actions">
                          <button 
                            className="button button-success button-sm" 
                            disabled={!canEdit || event.status !== 'Pending'} 
                            onClick={() => onApprove(event.id)}
                          >
                            Approve
                          </button>
                          <button 
                            className="button button-danger button-sm" 
                            disabled={!canEdit || event.status !== 'Pending'} 
                            onClick={() => onDismiss(event.id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        formatCellValue(event, col.key)
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="audit-table-footer">
          {totalEvents !== undefined && (
            <div className="table-pagination-inline">
              <div className="pagination-info-inline">
                Showing {events.length} of {totalEvents} total
              </div>
              <div className="pagination-controls-inline">
                <button 
                  className="pagination-btn-inline" 
                  disabled={!hasPrev} 
                  onClick={() => onPrevPage?.()}
                >
                  ← Prev
                </button>
                <button 
                  className="pagination-btn-inline" 
                  disabled={!hasMore} 
                  onClick={() => onNextPage?.()}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function renderPageNumbers(current: number, total: number, onPageChange?: (page: number) => void) {
  const pages = []
  const maxVisible = 5
  
  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) pages.push('...')
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (current < total - 2) pages.push('...')
    pages.push(total)
  }
  
  return pages.map((page, idx) => {
    if (page === '...') {
      return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
    }
    return (
      <button
        key={page}
        className={`pagination-btn ${page === current ? 'active' : ''}`}
        onClick={() => onPageChange?.(page as number)}
      >
        {page}
      </button>
    )
  })
}

const RBAC_COLUMNS = [
  { key: 'uid', label: 'User ID', defaultWidth: 150 },
  { key: 'username', label: 'Username', defaultWidth: 200 },
  { key: 'role', label: 'Assigned Role', defaultWidth: 150 },
  { key: 'lastLogin', label: 'Last Active', defaultWidth: 200 },
  { key: 'action', label: 'Action', defaultWidth: 120 },
]

function RBACSection({ users, canManage, onAddUser, onDeleteUser }: {
  users: any[],
  canManage: boolean,
  onAddUser: (user: any) => Promise<boolean>,
  onDeleteUser: (uid: string) => void
}) {
  const [formState, setFormState] = useState({ username: '', password: '', role: 'User' })
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ uid: string; username: string } | null>(null)

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    return RBAC_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  })
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(0)

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    setStartX(e.clientX)
    setStartWidth(columnWidths[columnKey])
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return
      const diff = e.clientX - startX
      const newWidth = Math.max(80, startWidth + diff)
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      if (resizingColumn) {
        setResizingColumn(null)
      }
    }

    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn, startX, startWidth])

  const submitNewUser = async () => {
    if (!formState.username.trim()) {
      setFormError('Username is required.')
      return
    }
    if (!formState.password.trim()) {
      setFormError('Password is required.')
      return
    }
    setFormError('')
    const success = await onAddUser(formState)
    if (success) {
      setFormState({ username: '', password: '', role: 'User' })
      setIsAddModalOpen(false)
    }
  }

  return (
    <div className="audit-section">
      <div className="audit-header">
        <div className="audit-header-top">
          {canManage && (
            <button className="button button-primary button-sm" onClick={() => setIsAddModalOpen(true)}>Add System User</button>
          )}
        </div>
      </div>
      <div className="audit-table-container" style={{ flex: 1 }}>
        {users.length === 0 ? (
          <div className="table-empty">No users found.</div>
        ) : (
          <div className="audit-table-wrapper">
            <div className="audit-table-scrollable">
              <div className="audit-thead">
                <div className="audit-thead-row">
                  {RBAC_COLUMNS.map((col, index) => (
                    <div 
                      key={col.key}
                      className={`audit-th ${resizingColumn === col.key ? 'resizing' : ''}`}
                      style={{ 
                        minWidth: `${columnWidths[col.key]}px`, 
                        width: `${columnWidths[col.key]}px` 
                      }}
                    >
                      {col.label}
                      {index < RBAC_COLUMNS.length - 1 && (
                        <div 
                          className={`resize-handle ${resizingColumn === col.key ? 'active' : ''}`}
                          onMouseDown={(e) => handleResizeStart(e, col.key)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="audit-tbody-wrapper">
                <div className="audit-tbody">
                  {users.map((user) => (
                    <div key={user.uid} className="audit-tr">
                      {RBAC_COLUMNS.map((col) => (
                        <div 
                          key={col.key}
                          className="audit-td" 
                          style={{ width: `${columnWidths[col.key]}px` }}
                        >
                          {col.key === 'role' ? (
                            <span className={`badge ${user.role === 'Admin' ? 'danger' : user.role === 'User' ? 'success' : 'info'}`}>{user.role}</span>
                          ) : col.key === 'action' ? (
                            canManage ? (
                              <button className="button button-secondary button-sm" onClick={() => setConfirmDelete({ uid: user.uid, username: user.username })}>Revoke</button>
                            ) : (
                              <span className="subtitle">Read-only</span>
                            )
                          ) : (
                            user[col.key]
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {isAddModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add System User</h3>
              <button className="modal-close" onClick={() => setIsAddModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-grid">
                <div>
                  <label className="input-label">Username</label>
                  <input className="input-field" value={formState.username} onChange={(e) => setFormState({ ...formState, username: e.target.value })} placeholder="e.g. john.doe" />
                </div>
                <div>
                  <label className="input-label">Password</label>
                  <input className="input-field" type="password" value={formState.password} onChange={(e) => setFormState({ ...formState, password: e.target.value })} placeholder="Start password" />
                </div>
                <div>
                  <label className="input-label">System Role</label>
                  <select className="select-field" value={formState.role} onChange={(e) => setFormState({ ...formState, role: e.target.value })}>
                    <option value="Admin">Admin</option>
                    <option value="User">User</option>
                  </select>
                </div>
              </div>
              {formError && <div className="modal-error">{formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button className="button button-primary" type="button" onClick={submitNewUser}>Add User</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Revoke</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to revoke user <strong>{confirmDelete.username}</strong>?</p>
              <p className="modal-warning">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="button button-danger" type="button" onClick={() => {
                onDeleteUser(confirmDelete.uid)
                setConfirmDelete(null)
              }}>Revoke User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ZonesSection({
  zones,
  canManage,
  zoneForm,
  setZoneForm,
  emptyZone,
  onSaveZone,
  onDeleteZone,
  onSyncZones,
  onApproveZone,
  onRejectZone,
  pendingZones,
  loadingPending,
  syncing
}: {
  zones: any[],
  canManage: boolean,
  zoneForm: any,
  setZoneForm: (zone: any) => void,
  emptyZone: any,
  onSaveZone: () => Promise<boolean>,
  onDeleteZone: (zoneId: string) => void,
  onSyncZones: () => Promise<void>,
  onApproveZone: (zoneId: string) => Promise<void>,
  onRejectZone: (zoneId: string) => Promise<void>,
  pendingZones: any[],
  loadingPending: boolean,
  syncing: boolean
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pendingExpanded, setPendingExpanded] = useState(true)
  const [approvedExpanded, setApprovedExpanded] = useState(false)

  const ZONE_COLUMNS = [
    { key: 'zoneId', label: 'ID', defaultWidth: 200 },
    { key: 'name', label: 'Name', defaultWidth: 180 },
    { key: 'riskLevel', label: 'Risk', defaultWidth: 80 },
    { key: 'incidents', label: 'Incidents', defaultWidth: 80 },
    { key: 'createdBy', label: 'Created By', defaultWidth: 100 },
    { key: 'actions', label: 'Actions', defaultWidth: 180 }
  ]

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('zonesColumnWidths')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return ZONE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
      }
    }
    return ZONE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  })

  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    startXRef.current = e.clientX
    startWidthRef.current = columnWidths[columnKey]
  }

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidthRef.current + (e.clientX - startXRef.current))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingColumn])

  useEffect(() => {
    localStorage.setItem('zonesColumnWidths', JSON.stringify(columnWidths))
  }, [columnWidths])

  const openCreateModal = () => {
    setZoneForm(emptyZone)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setZoneForm(emptyZone)
  }

  const submitZone = async () => {
    const saved = await onSaveZone()
    if (saved) {
      setIsModalOpen(false)
    }
  }

  const approvedZones = zones.filter(z => z.approvalStatus !== 'pending')
  const pendingZoneList = pendingZones.filter(z => z.approvalStatus === 'pending')

  const handleBulkApprove = async () => {
    for (const zone of pendingZoneList) {
      await onApproveZone(zone.zoneId)
    }
  }

  const handleBulkReject = async () => {
    for (const zone of pendingZoneList) {
      await onRejectZone(zone.zoneId)
    }
  }

  const renderZoneTable = (zoneList: any[], isPending: boolean) => (
    <div className="audit-table-container">
      <div className="audit-table-wrapper">
        <div className="audit-table-scrollable">
          <div className="audit-thead">
            <div className="audit-thead-row">
              {ZONE_COLUMNS.map((col, index) => (
                <div
                  key={col.key}
                  className={`audit-th ${resizingColumn === col.key ? 'resizing' : ''}`}
                  style={{
                    minWidth: `${columnWidths[col.key]}px`,
                    width: `${columnWidths[col.key]}px`
                  }}
                >
                  {col.label}
                  {index < ZONE_COLUMNS.length - 1 && (
                    <div
                      className={`resize-handle ${resizingColumn === col.key ? 'active' : ''}`}
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="audit-tbody-wrapper">
            <div className="audit-tbody">
              {zoneList.map((zone) => (
                <div key={zone.zoneId} className={`audit-tr ${isPending ? 'audit-tr--pending' : ''}`}>
                  {ZONE_COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="audit-td"
                      style={{
                        minWidth: `${columnWidths[col.key]}px`,
                        width: `${columnWidths[col.key]}px`
                      }}
                    >
                      {col.key === 'riskLevel' ? (
                        <span className={`badge ${zone.riskLevel === 'high' ? 'danger' : zone.riskLevel === 'medium' ? 'warning' : 'success'}`}>{zone.riskLevel}</span>
                      ) : col.key === 'actions' ? (
                        isPending ? (
                          <div className="panel-actions">
                            <button
                              className="button button-success button-sm"
                              onClick={() => onApproveZone(zone.zoneId)}
                            >
                              Approve
                            </button>
                            <button
                              className="button button-danger button-sm"
                              onClick={() => onRejectZone(zone.zoneId)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : !canManage ? (
                          <span className="subtitle">Read-only</span>
                        ) : (
                          <div className="panel-actions">
                            <button className="button button-danger button-sm" type="button" onClick={() => onDeleteZone(zone.zoneId)}>Delete</button>
                          </div>
                        )
                      ) : (
                        col.key === 'incidents' ? (zone.incidentCount || zone.historicalIncidents || 0) :
                        col.key === 'createdBy' ? zone.createdBy :
                        col.key === 'name' ? zone.name :
                        zone.zoneId
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {zoneList.length === 0 && (
                <div className="table-empty">{isPending ? 'No pending zones.' : 'No approved zones.'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="zones-section">
      <div className="zones-header">
        <div className="zones-header-actions">
          <button className="button button-secondary btn-fixed" type="button" onClick={onSyncZones} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync from Fire Events'}
          </button>
          {canManage && (
            <button className="button button-primary btn-fixed" type="button" onClick={openCreateModal}>
              Create Zone
            </button>
          )}
          {!canManage && <p className="zones-warning">You do not have permission to manage zones.</p>}
        </div>
      </div>

      <div className="audit-tables-container">
        <div className={`audit-table-section${pendingExpanded ? '' : ' collapsed'}`}>
          <div className="table-section-header" onClick={() => {
            if (pendingExpanded) {
              setPendingExpanded(false)
            } else {
              setPendingExpanded(true)
              setApprovedExpanded(false)
            }
          }}>
            <div className="table-section-title">
              <span className="expand-icon">{pendingExpanded ? '▼' : '▶'}</span>
              <h4>Pending Approval</h4>
              <span className="badge badge-warning">{pendingZoneList.length}</span>
            </div>
            {canManage && pendingZoneList.length > 0 && (
              <div className="bulk-actions" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="button button-success" 
                  onClick={handleBulkApprove}
                >
                  ✓ Approve All
                </button>
                <button 
                  className="button button-danger" 
                  onClick={handleBulkReject}
                >
                  ✕ Reject All
                </button>
              </div>
            )}
          </div>
          <div className={`table-content${pendingExpanded ? ' expanded' : ''}`}>
            {renderZoneTable(pendingZoneList, true)}
          </div>
        </div>

        <div className={`audit-table-section${approvedExpanded ? '' : ' collapsed'}`}>
          <div className="table-section-header" onClick={() => {
            if (approvedExpanded) {
              setApprovedExpanded(false)
            } else {
              setApprovedExpanded(true)
              setPendingExpanded(false)
            }
          }}>
            <div className="table-section-title">
              <span className="expand-icon">{approvedExpanded ? '▼' : '▶'}</span>
              <h4>Approved & Published</h4>
              <span className="badge badge-success">{approvedZones.length}</span>
            </div>
          </div>
          <div className={`table-content${approvedExpanded ? ' expanded' : ''}`}>
            {renderZoneTable(approvedZones, false)}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-dialog modal-dialog--wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New High-Risk Zone</h3>
              <button className="modal-close" type="button" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-grid">
                <div>
                  <label className="input-label">Zone Name</label>
                  <input className="input-field" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="e.g. California North Region" />
                </div>
                <div>
                  <label className="input-label">Min Latitude</label>
                  <input className="input-field" type="number" step="any" value={zoneForm.minLatitude} onChange={(e) => setZoneForm({ ...zoneForm, minLatitude: Number(e.target.value) })} placeholder="Southern boundary" />
                </div>
                <div>
                  <label className="input-label">Max Latitude</label>
                  <input className="input-field" type="number" step="any" value={zoneForm.maxLatitude} onChange={(e) => setZoneForm({ ...zoneForm, maxLatitude: Number(e.target.value) })} placeholder="Northern boundary" />
                </div>
                <div>
                  <label className="input-label">Min Longitude</label>
                  <input className="input-field" type="number" step="any" value={zoneForm.minLongitude} onChange={(e) => setZoneForm({ ...zoneForm, minLongitude: Number(e.target.value) })} placeholder="Western boundary" />
                </div>
                <div>
                  <label className="input-label">Max Longitude</label>
                  <input className="input-field" type="number" step="any" value={zoneForm.maxLongitude} onChange={(e) => setZoneForm({ ...zoneForm, maxLongitude: Number(e.target.value) })} placeholder="Eastern boundary" />
                </div>
                <div>
                  <label className="input-label">Risk Level</label>
                  <select className="select-field" value={zoneForm.riskLevel} onChange={(e) => setZoneForm({ ...zoneForm, riskLevel: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Historical Incidents</label>
                  <input className="input-field" type="number" value={zoneForm.historicalIncidents} onChange={(e) => setZoneForm({ ...zoneForm, historicalIncidents: Number(e.target.value) })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="input-label">Description</label>
                  <textarea className="textarea-field" value={zoneForm.description} onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button>
              <button className="button button-primary" type="button" onClick={submitZone} disabled={!canManage}>
                Create Zone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LogsSection({ systemLogs }: { systemLogs: SysLog[] }) {
  const [filterType, setFilterType] = useState<string>('all')
  const [filterUser, setFilterUser] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const combinedLogs = systemLogs.map((log, idx) => ({
    type: 'system',
    logType: log.type,
    timestamp: log.timestamp,
    username: log.operator,
    action: log.action,
    targetType: log.target,
    status: log.status,
    id: `system-${idx}`
  })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredLogs = combinedLogs.filter(log => {
    if (filterType !== 'all' && log.logType !== filterType) return false
    if (filterUser && !log.username.toLowerCase().includes(filterUser.toLowerCase())) return false
    if (filterStatus !== 'all' && log.status.toLowerCase() !== filterStatus.toLowerCase()) return false
    return true
  })

  const uniqueTypes = [...new Set(combinedLogs.map(log => log.logType))]
  const uniqueUsers = [...new Set(combinedLogs.map(log => log.username))].filter(Boolean)
  const uniqueStatuses = [...new Set(combinedLogs.map(log => log.status))]

  const LOG_COLUMNS = [
    { key: 'logType', label: 'Type', defaultWidth: 100 },
    { key: 'timestamp', label: 'Timestamp', defaultWidth: 180 },
    { key: 'username', label: 'User', defaultWidth: 120 },
    { key: 'action', label: 'Action', defaultWidth: 200 },
    { key: 'targetType', label: 'Target', defaultWidth: 120 },
    { key: 'status', label: 'Status', defaultWidth: 100 }
  ]

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('logsColumnWidths')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return LOG_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
      }
    }
    return LOG_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  })

  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    startXRef.current = e.clientX
    startWidthRef.current = columnWidths[columnKey]
  }

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidthRef.current + (e.clientX - startXRef.current))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingColumn])

  useEffect(() => {
    localStorage.setItem('logsColumnWidths', JSON.stringify(columnWidths))
  }, [columnWidths])

  const getStatusBadgeClass = (status: string) => {
    switch(status.toLowerCase()) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'info';
    }
  };

  return (
    <div className="audit-section">
      <div className="audit-header">
      </div>
      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Type:</label>
          <select className="select-field" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">User:</label>
          <input 
            className="input-field" 
            type="text" 
            value={filterUser} 
            onChange={(e) => setFilterUser(e.target.value)}
            placeholder="Search username..."
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Status:</label>
          <select className="select-field" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="filter-group filter-results">
          <span className="subtitle">Showing {filteredLogs.length} of {combinedLogs.length} logs</span>
        </div>
      </div>
      <div className="audit-table-container" style={{ flex: 1 }}>
        {combinedLogs.length === 0 ? (
          <div className="table-empty">No logs available</div>
        ) : filteredLogs.length === 0 ? (
          <div className="table-empty">No logs match the current filters</div>
        ) : (
          <div className="audit-table-wrapper">
            <div className="audit-table-scrollable">
              <div className="audit-thead">
                <div className="audit-thead-row">
                  {LOG_COLUMNS.map((col, index) => (
                    <div
                      key={col.key}
                      className={`audit-th ${resizingColumn === col.key ? 'resizing' : ''}`}
                      style={{
                        minWidth: `${columnWidths[col.key]}px`,
                        width: `${columnWidths[col.key]}px`
                      }}
                    >
                      {col.label}
                      {index < LOG_COLUMNS.length - 1 && (
                        <div
                          className={`resize-handle ${resizingColumn === col.key ? 'active' : ''}`}
                          onMouseDown={(e) => handleResizeStart(e, col.key)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="audit-tbody-wrapper">
                <div className="audit-tbody">
                  {filteredLogs.map((entry) => (
                    <div key={entry.id} className="audit-tr">
                      {LOG_COLUMNS.map((col) => (
                        <div
                          key={col.key}
                          className="audit-td"
                          style={{
                            minWidth: `${columnWidths[col.key]}px`,
                            width: `${columnWidths[col.key]}px`
                          }}
                        >
                          {col.key === 'logType' ? (
                            <span className={`badge ${entry.type === 'operation' ? 'info' : 
                              entry.logType === 'SYSTEM' ? 'primary' : 
                              entry.logType === 'LOGIN' ? 'warning' : 'success'}`}>
                              {entry.type === 'operation' ? 'Operation' : entry.logType}
                            </span>
                          ) : col.key === 'timestamp' ? (
                            typeof entry.timestamp === 'string' ? entry.timestamp : new Date(entry.timestamp).toLocaleString()
                          ) : col.key === 'status' ? (
                            <span className={`badge ${getStatusBadgeClass(entry.status)}`}>
                              {entry.status}
                            </span>
                          ) : col.key === 'targetType' ? (
                            entry.targetType || '-'
                          ) : col.key === 'username' ? entry.username :
                          entry.action}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BackupSection({ onExport, onImport, backupHistory, status, isAdmin }: {
  onExport: () => void,
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void,
  backupHistory: any[],
  status: string,
  isAdmin: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const isProcessing = status.includes('Exporting') || status.includes('Importing')

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file.name)
      onImport(event)
    }
  }

  return (
    <div className="backup-section">
      <div className="backup-header">
        {status && (
          <div className={`backup-status ${isProcessing ? 'processing' : ''}`}>
            {isProcessing && <span className="spinner"></span>}
            {status}
          </div>
        )}
        {!isAdmin && <p className="zones-warning">You do not have permission to manage backup/restore.</p>}
      </div>
      <div className="backup-section-row">
        <div className="backup-card">
          <h4>Export Data</h4>
          <p className="backup-card-subtitle">Download a complete backup of all system data including users, zones, and operation logs.</p>
          <button 
            className="button button-primary" 
            onClick={onExport}
            disabled={isProcessing || !isAdmin}
          >
            {isProcessing && status.includes('Exporting') ? 'Exporting...' : 'Export Data'}
          </button>
        </div>

        <div className="backup-card">
          <h4>Import Backup</h4>
          <p className="backup-card-subtitle">Restore system data from a previously exported backup file (JSON or JSON.GZ).</p>
          <div className="backup-import-section">
            <div className="backup-file-input-wrapper">
              <div className={`backup-file-select-button ${isProcessing || !isAdmin ? 'disabled' : ''}`} onClick={isProcessing || !isAdmin ? undefined : handleFileClick}>
                {isProcessing && status.includes('Importing') ? '⏳ Importing...' : '📁 Click to select backup file (JSON/GZ)'}
              </div>
              <div className="backup-file-name">{selectedFile || 'No file selected'}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.gz,application/json,application/gzip"
                onChange={handleFileChange}
                disabled={isProcessing || !isAdmin}
              />
            </div>
          </div>
        </div>

        <div className="backup-card backup-card--full">
          <h4>Backup History</h4>
          {backupHistory.length === 0 ? (
            <div className="backup-empty-state">No backup operations yet.</div>
          ) : (
            <div className="backup-history-list">
              {backupHistory.map((item) => (
                <div key={item.id} className="backup-history-item">
                  <div>
                    <div>{item.filename}</div>
                    <div className="backup-history-time">{item.timestamp} • {item.type === 'export' ? 'Exported' : 'Imported'} • {(item.size / 1024).toFixed(2)} KB</div>
                  </div>
                  <div className="backup-history-actions">
                    <span className={`badge ${item.status === 'success' ? 'success' : 'danger'}`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ApprovalsSection({
  onApproveUser,
  onRejectUser,
  onLoadPendingUsers,
  pendingUsers,
  loading,
  isAdmin
}: {
  onApproveUser: (username: string, comment?: string) => Promise<void>
  onRejectUser: (username: string, comment?: string) => Promise<void>
  onLoadPendingUsers: () => Promise<void>
  pendingUsers: any[]
  loading: boolean
  isAdmin: boolean
}) {
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean
    action: 'approve' | 'reject'
    username: string
  } | null>(null)

  const APPROVAL_COLUMNS = [
    { key: 'username', label: 'Username', defaultWidth: 150 },
    { key: 'role', label: 'Requested Role', defaultWidth: 120 },
    { key: 'createdAt', label: 'Registered At', defaultWidth: 180 },
    { key: 'actions', label: 'Actions', defaultWidth: 160 }
  ]

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('approvalsColumnWidths')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return APPROVAL_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
      }
    }
    return APPROVAL_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  })

  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    startXRef.current = e.clientX
    startWidthRef.current = columnWidths[columnKey]
  }

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidthRef.current + (e.clientX - startXRef.current))
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizingColumn])

  useEffect(() => {
    localStorage.setItem('approvalsColumnWidths', JSON.stringify(columnWidths))
  }, [columnWidths])

  useEffect(() => {
    if (isAdmin) {
      onLoadPendingUsers()
    }
  }, [isAdmin])

  if (!isAdmin) {
    return (
      <div className="approvals-section">
        <p className="error-message">Permission denied. Admin only.</p>
      </div>
    )
  }

  const handleApprove = (username: string) => {
    setConfirmDialog({ show: true, action: 'approve', username })
  }

  const handleReject = (username: string) => {
    setConfirmDialog({ show: true, action: 'reject', username })
  }

  const confirmAction = async () => {
    if (!confirmDialog) return
    if (confirmDialog.action === 'approve') {
      await onApproveUser(confirmDialog.username)
    } else {
      await onRejectUser(confirmDialog.username)
    }
    setConfirmDialog(null)
  }

  return (
    <div className="audit-section">
      <div className="audit-header">
      </div>

      <div className="audit-table-container" style={{ flex: 1 }}>
        {loading ? (
          <div className="table-loading">Loading...</div>
        ) : pendingUsers.length === 0 ? (
          <div className="table-empty">No pending registration requests.</div>
        ) : (
          <div className="audit-table">
            <div className="audit-table-wrapper">
              <div className="audit-table-scrollable">
                <div className="audit-thead">
                  <div className="audit-thead-row">
                    {APPROVAL_COLUMNS.map((col, index) => (
                      <div
                        key={col.key}
                        className={`audit-th ${resizingColumn === col.key ? 'resizing' : ''}`}
                        style={{
                          minWidth: `${columnWidths[col.key]}px`,
                          width: `${columnWidths[col.key]}px`
                        }}
                      >
                        {col.label}
                        {index < APPROVAL_COLUMNS.length - 1 && (
                          <div
                            className={`resize-handle ${resizingColumn === col.key ? 'active' : ''}`}
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="audit-tbody-wrapper">
                  <div className="audit-tbody">
                    {pendingUsers.map((user) => (
                      <div key={user.username} className="audit-tr">
                        {APPROVAL_COLUMNS.map((col) => (
                          <div
                            key={col.key}
                            className="audit-td"
                            style={{
                              minWidth: `${columnWidths[col.key]}px`,
                              width: `${columnWidths[col.key]}px`
                            }}
                          >
                            {col.key === 'role' ? (
                              <span className={`badge ${user.role === 'admin' ? 'danger' : 'success'}`}>
                                {user.role}
                              </span>
                            ) : col.key === 'createdAt' ? (
                              new Date(user.createdAt).toLocaleString()
                            ) : col.key === 'actions' ? (
                              <div className="panel-actions">
                                <button
                                  className="button button-success button-sm"
                                  onClick={() => handleApprove(user.username)}
                                >
                                  Approve
                                </button>
                                <button
                                  className="button button-danger button-sm"
                                  onClick={() => handleReject(user.username)}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : user.username}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmDialog && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmDialog.action === 'approve' ? 'Approve' : 'Reject'} User</h3>
              <button className="modal-close" onClick={() => setConfirmDialog(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to <strong>{confirmDialog.action}</strong> user <strong>{confirmDialog.username}</strong>?</p>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button 
                className={`button ${confirmDialog.action === 'approve' ? 'button-success' : 'button-danger'}`} 
                onClick={confirmAction}
              >
                {confirmDialog.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

