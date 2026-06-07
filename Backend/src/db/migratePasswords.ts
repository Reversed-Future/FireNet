import { pool } from './pool.js'
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 10

async function migratePasswords() {
  console.log('Starting password hash migration...')

  try {
    const result = await pool.query('SELECT id, username, password_hash FROM users')
    const users = result.rows
    console.log(`Found ${users.length} users`)

    let updated = 0
    for (const user of users) {
      const passwordHash = user.password_hash
      
      if (passwordHash.startsWith('$2')) {
        console.log(`✓ ${user.username}: already hashed`)
        continue
      }

      const newHash = await bcrypt.hash(passwordHash, SALT_ROUNDS)
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newHash, user.id]
      )
      console.log(`✓ ${user.username}: hashed`)
      updated++
    }

    console.log(`\n✅ Migrated ${updated} passwords to bcrypt hash`)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

migratePasswords().catch((error) => {
  console.error(error)
  process.exit(1)
})