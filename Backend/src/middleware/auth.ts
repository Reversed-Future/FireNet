import type { Request, Response, NextFunction } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { config } from '../config.js'

export interface JwtPayload {
  username: string
  role: 'admin' | 'user'
  iat?: number
  exp?: number
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: 'No authentication token provided'
    })
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload
    req.user = payload
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        code: 401,
        message: 'Authentication token expired'
      })
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid authentication token'   
      })
    }
    return res.status(401).json({
      code: 401,
      message: 'Authentication failed'
    })
  }
}

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      code: 401,
      message: 'No authentication token provided'
    })
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      code: 403,
      message: 'Insufficient permissions: admin role required'
    })
  }

  next()
}

export const generateToken = (username: string, role: 'admin' | 'user'): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn']
  }
  return jwt.sign(
    { username, role },
    config.jwtSecret,
    options
  )
}

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload
  } catch {
    return null
  }
}