// Authentication & Authorization Service
import type { User, UserRole } from '../domain/platform.js'

interface TokenData {
  token: string
  username: string
  role: UserRole
}

export class AuthService {
  private static instance: AuthService
  private tokenStore: Map<string, TokenData> = new Map()

  private constructor() {
    this.tokenStore.set('Bearer_secret_token_admin', {
      token: 'Bearer_secret_token_admin',
      username: 'admin',
      role: 'admin'
    })
    this.tokenStore.set('Bearer_secret_token_user', {
      token: 'Bearer_secret_token_user',
      username: 'user',
      role: 'user'
    })
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  generateToken(user: User): string {
    const token = `Bearer_token_${user.username}_${Date.now()}`
    this.tokenStore.set(token, {
      token,
      username: user.username,
      role: user.role
    })
    return token
  }

  validateToken(token: string): TokenData | null {
    return this.tokenStore.get(token) || null
  }

  getUsernameByToken(token: string): string {
    const data = this.tokenStore.get(token)
    return data ? data.username : 'unknown'
  }

  checkPermission(token: string, requiredRole: UserRole): boolean {
    const data = this.tokenStore.get(token)
    if (!data) return false
    
    if (requiredRole === 'admin') {
      return data.role === 'admin'
    }
    return true
  }

  registerToken(token: string, username: string, role: UserRole): void {
    this.tokenStore.set(token, { token, username, role })
  }

  static getDemoTokenForUser(username: string): string | null {
    if (username === 'admin') return 'Bearer_secret_token_admin'
    if (username === 'user') return 'Bearer_secret_token_user'
    return null
  }
}