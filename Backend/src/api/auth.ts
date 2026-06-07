import { Router, type Request, type Response } from 'express'
import { pool } from '../db/pool.js'
import { PlatformRepository } from '../repositories/platformRepository.js'
import { generateToken } from '../middleware/auth.js'

export const authRouter = Router()
const repo = new PlatformRepository(pool)

authRouter.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body
    
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: 'Username and password required'
      })
    }

    const user = await repo.validateUserCredentials(username, password)
    
    if (!user) {
      await repo.createLog({
        logType: 'LOGIN',
        operator: username || 'unknown',
        action: 'Login',
        status: 'ERROR',
        target: 'User'
      })
      return res.status(400).json({
        code: 400,
        message: 'Username or password is incorrect'
      })
    }

    if (user.approvalStatus === 'pending') {
      await repo.createLog({
        logType: 'LOGIN',
        operator: username,
        action: 'Login',
        status: 'PENDING',
        target: 'User'
      })
      return res.status(403).json({
        code: 403,
        message: 'Your account is pending approval, please try again later'
      })
    }

    if (user.approvalStatus === 'rejected') {
      await repo.createLog({
        logType: 'LOGIN',
        operator: username,
        action: 'Login',
        status: 'REJECTED',
        target: 'User'
      })
      return res.status(403).json({
        code: 403,
        message: 'Your account approval has been rejected, please contact the admin'
      })
    }

    await repo.updateLastLogin(user.id)
    await repo.createLog({
      logType: 'LOGIN',
      operator: username,
      action: 'Login',
      status: 'SUCCESS',
      target: 'User'
    })

    const token = generateToken(user.username, user.role)

    res.json({
      code: 0,
      message: 'success',
      data: {
        token,
        user: {
          username: user.username,
          role: user.role,
          approvalStatus: user.approvalStatus
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/logs', async (req: Request, res: Response, next) => {
  try {
    const logs = await repo.getAllLogs(1000)
    res.json({
      code: 0,
      message: 'success',
      data: logs.map(log => ({
        type: log.logType,
        operator: log.operator,
        action: log.action,
        status: log.status,
        target: log.target,
        timestamp: log.createdAt.toISOString()
      }))
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logs', async (req: Request, res: Response, next) => {
  try {
    const { username, action, targetType, targetId, targetDetails, status } = req.body
    const operator = username || 'system'
    await repo.createLog({
      logType: 'OPERATION',
      operator,
      action: action || 'Unknown',
      status: status || 'SUCCESS',
      target: targetType || 'Unknown',
      details: targetDetails || {}
    })
    res.json({
      code: 0,
      message: 'success'
    })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/admin/regions', async (req: Request, res: Response, next) => {
  try {
    const regions = await repo.getAdminRegions()
    res.json({
      code: 0,
      message: 'success',
      data: regions
    })
  } catch (error) {
    next(error)
  }
})