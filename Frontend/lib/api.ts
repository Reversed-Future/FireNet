const API_BASE_URL = 'http://localhost:8000/api'
const FIRENET_API_BASE = 'http://localhost:8000/api'

export interface LoginResponse {
  code: number
  message: string
  data: {
    token: string
    user: {
      username: string
      role: string
    }
  }
}

export interface SysLog {
  type: string
  operator: string
  action: string
  status: string
  target?: string
  timestamp: string
}

export interface ApprovalRequest {
  id: string
  applicant: string
  requestedRole: string
  reason: string
  status: string
  comment?: string
  timestamp: string
}

// FireNet API Types
export type FireLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export interface FirePoint {
  id: string
  latitude: number
  longitude: number
  intensity: string
  intensityValue: number
  level: FireLevel
  dateTime: string
  locationName?: string
  confidence: number
  source: string
}

export interface FireStats {
  code: number
  message: string
  updatedAt: string
  total: number
  limit: number
  offset: number
  points: FirePoint[]
  data: FirePoint[]
}

export interface FireStatistics {
  code: number
  message: string
  total: number
  byLevel: Record<FireLevel, number>
  latestDetectedAt: string | null
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      const user = sessionStorage.getItem('currentUser')
      if (user) {
        const parsed = JSON.parse(user)
        return parsed.token || null
      }
    }
    return null
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }

    const url = `${API_BASE_URL}${endpoint}`
    console.log(`[API] Requesting: ${url}`)
    
    const response = await fetch(url, {
      ...options,
      headers
    })

    console.log(`[API] Response status: ${response.status} for ${url}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      // 401 错误（未登录时访问受保护接口）是预期的，减少日志噪音
      if (response.status !== 401) {
        console.error(`[API] Error:`, errorData)
      } else {
        console.log(`[API] Auth required for ${url}`)
      }
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log(`[API] Response data for ${url}:`, result)
    return result
  }

  // Authentication & Platform APIs
  async login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  }

  async getLogs(): Promise<{ code: number; message: string; data: SysLog[] }> {
    return this.request('/logs')
  }

  async createLog(log: any): Promise<{ code: number; message: string }> {
    return this.request('/logs', {
      method: 'POST',
      body: JSON.stringify(log)
    })
  }

  async getAdminRegions(): Promise<{ code: number; message: string; data: string[] }> {
    return this.request('/admin/regions')
  }

  async getUserRegions(): Promise<{ code: number; message: string; data: Record<string, 'HIGH_RISK' | 'LOW_RISK'> }> {
    return this.request('/manage/regions')
  }

  async reportUserRegion(username: string, riskLevel: 'HIGH_RISK' | 'LOW_RISK'): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/regions/report?username=${encodeURIComponent(username)}&riskLevel=${riskLevel}`, {
      method: 'POST'
    })
  }

  async getApprovals(): Promise<{ code: number; message: string; data: ApprovalRequest[] }> {
    return this.request('/manage/approvals')
  }

  async applyApproval(applicant: string, requestedRole: string, reason: string): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/approvals/apply?applicant=${encodeURIComponent(applicant)}&requestedRole=${requestedRole}&reason=${encodeURIComponent(reason)}`, {
      method: 'POST'
    })
  }

  async reviewApproval(id: string, action: string, comment: string): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/approvals/review?id=${encodeURIComponent(id)}&action=${action}&comment=${encodeURIComponent(comment)}`, {
      method: 'POST'
    })
  }

  // User Registration APIs
  async registerUser(username: string, password: string, role: string): Promise<{ code: number; message: string; data: { id: number; username: string; role: string; createdAt: string } }> {
    return this.request('/manage/users/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    })
  }

  async getUsers(): Promise<{ code: number; message: string; data: { id: number; uid: string; username: string; email: string; role: string; approvalStatus?: string; lastLogin: string; createdAt: string }[] }> {
    return this.request('/manage/users')
  }

  async getPendingUsers(): Promise<{ code: number; message: string; data: { id: number; uid: string; username: string; email: string; role: string; createdAt: string }[] }> {
    return this.request('/manage/users/pending')
  }

  async approveUser(username: string, comment?: string): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/users/${encodeURIComponent(username)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    })
  }

  async rejectUser(username: string, comment?: string): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/users/${encodeURIComponent(username)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    })
  }

  async deleteUser(username: string): Promise<{ code: number; message: string; data: string }> {
    return this.request(`/manage/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    })
  }

  // High Risk Zone APIs
  async getZones(): Promise<any> {
    return this.request('/manage/zones')
  }

  async getPendingZones(): Promise<any> {
    return this.request('/manage/zones/pending')
  }

  async createZone(zone: any): Promise<any> {
    return this.request('/manage/zones', {
      method: 'POST',
      body: JSON.stringify(zone)
    })
  }

  async updateZone(zoneId: string, zone: any): Promise<any> {
    return this.request(`/manage/zones/${zoneId}`, {
      method: 'PUT',
      body: JSON.stringify(zone)
    })
  }

  async deleteZone(zoneId: string): Promise<any> {
    return this.request(`/manage/zones/${zoneId}`, {
      method: 'DELETE'
    })
  }

  async approveZone(zoneId: string): Promise<any> {
    return this.request(`/manage/zones/${zoneId}/approve`, {
      method: 'POST'
    })
  }

  async rejectZone(zoneId: string): Promise<any> {
    return this.request(`/manage/zones/${zoneId}/reject`, {
      method: 'POST'
    })
  }

  async syncHighRiskZones(sinceHours: number = 168): Promise<{ added: number; updated: number; removed: number }> {
    const response = await this.request<{ code: number; message: string; data: { added: number; updated: number; removed: number } }>('/manage/regions/sync', {
      method: 'POST',
      body: JSON.stringify({ sinceHours })
    })
    return response.data
  }

  // FireNet Data APIs
  async getFires(options?: {
    level?: FireLevel
    limit?: number
    offset?: number
    bbox?: string
  }): Promise<FireStats> {
    const params = new URLSearchParams()
    if (options?.level) params.append('level', options.level)
    if (options?.limit) params.append('limit', String(options.limit))
    if (options?.offset) params.append('offset', String(options.offset))
    if (options?.bbox) params.append('bbox', options.bbox)

    const queryString = params.toString()
    return this.request(`/fires${queryString ? `?${queryString}` : ''}`)
  }

  async getFire(id: string): Promise<any> {
    return this.request(`/fires/${id}`)
  }

  async getFireStatistics(): Promise<FireStatistics> {
    return this.request('/fires/stats')
  }

  async getQualitySummary(): Promise<any> {
    return this.request('/quality/summary')
  }

  async reviewFireEvent(id: number, reviewStatus: 'pending' | 'approved' | 'dismissed'): Promise<any> {
    return this.request(`/fires/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewStatus, published: reviewStatus === 'approved' })
    })
  }

  // Backup & Restore APIs
  async exportData(): Promise<Blob> {
    const token = this.getToken()
    const url = `${API_BASE_URL}/manage/export`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }
    return response.blob()
  }

  async importData(data: any): Promise<{ code: number; message: string }> {
    return this.request('/manage/import', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  // 解压gzip数据
  async decompressGzip(blob: Blob): Promise<any> {
    const arrayBuffer = await blob.arrayBuffer()
    const decompressedStream = new Response(arrayBuffer).body?.pipeThrough(
      new DecompressionStream('gzip')
    )
    if (!decompressedStream) {
      throw new Error('Decompression failed')
    }
    const decompressedBlob = await new Response(decompressedStream).text()
    return JSON.parse(decompressedBlob)
  }

  // 检查文件是否是gzip压缩的
  isGzipFile(filename: string): boolean {
    return filename.toLowerCase().endsWith('.gz')
  }
}

export const apiClient = new ApiClient()

