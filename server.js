/**
 * 授权码管理后端服务
 * 使用 Node.js + Express + SQLite
 */

const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const crypto = require('crypto')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors({
  origin: '*', // 允许所有来源（GitHub Pages）
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}))
app.use(express.json())

// 初始化数据库（Vercel 使用 /tmp 目录）
const dbPath = process.env.VERCEL ? '/tmp/auth.db' : './auth.db'
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err)
  } else {
    console.log('✅ 数据库已连接')
    initDatabase()
  }
})

// 创建表结构
function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auth_code TEXT UNIQUE NOT NULL,
      device_id TEXT,
      is_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      notes TEXT
    )
  `, (err) => {
    if (err) {
      console.error('创建表失败:', err)
    } else {
      console.log('✅ 数据表已就绪')
    }
  })
}

/**
 * 生成授权码（管理员接口）
 */
app.post('/api/admin/generate', (req, res) => {
  const { count = 1, notes = '' } = req.body
  const codes = []

  for (let i = 0; i < count; i++) {
    const authCode = generateAuthCode()
    codes.push(authCode)

    db.run(
      'INSERT INTO auth_codes (auth_code, created_at, notes) VALUES (?, ?, ?)',
      [authCode, new Date().toISOString(), notes],
      (err) => {
        if (err) {
          console.error('插入授权码失败:', err)
        }
      }
    )
  }

  res.json({ success: true, codes })
})

/**
 * 激活授权码（用户接口）
 */
app.post('/api/activate', (req, res) => {
  const { deviceId, authCode } = req.body

  if (!deviceId || !authCode) {
    return res.json({ success: false, message: '参数不完整' })
  }

  // 查询授权码
  db.get(
    'SELECT * FROM auth_codes WHERE auth_code = ?',
    [authCode],
    (err, row) => {
      if (err) {
        return res.json({ success: false, message: '数据库错误' })
      }

      if (!row) {
        return res.json({ success: false, message: '授权码不存在' })
      }

      if (row.is_used) {
        return res.json({ success: false, message: '授权码已被使用' })
      }

      // 激活授权码
      db.run(
        'UPDATE auth_codes SET device_id = ?, is_used = 1, activated_at = ? WHERE auth_code = ?',
        [deviceId, new Date().toISOString(), authCode],
        (err) => {
          if (err) {
            return res.json({ success: false, message: '激活失败' })
          }

          res.json({ success: true, message: '授权成功' })
        }
      )
    }
  )
})

/**
 * 验证授权码（应用启动时验证）
 */
app.post('/api/verify', (req, res) => {
  const { deviceId, authCode } = req.body

  db.get(
    'SELECT * FROM auth_codes WHERE auth_code = ? AND device_id = ? AND is_used = 1',
    [authCode, deviceId],
    (err, row) => {
      if (err || !row) {
        return res.json({ valid: false })
      }

      res.json({ valid: true })
    }
  )
})

/**
 * 查询所有授权码（管理员接口）
 */
app.get('/api/admin/codes', (req, res) => {
  db.all('SELECT * FROM auth_codes ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.json({ success: false, message: '查询失败' })
    }

    res.json({ success: true, codes: rows })
  })
})

/**
 * 删除授权码（管理员接口）
 */
app.delete('/api/admin/codes/:code', (req, res) => {
  const { code } = req.params

  db.run('DELETE FROM auth_codes WHERE auth_code = ?', [code], (err) => {
    if (err) {
      return res.json({ success: false, message: '删除失败' })
    }

    res.json({ success: true, message: '删除成功' })
  })
})

// 生成随机授权码
function generateAuthCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混淆字符
  let code = ''
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// 启动服务器
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 授权服务器运行在 http://localhost:${PORT}`)
  })
}

// Vercel 导出
module.exports = app

