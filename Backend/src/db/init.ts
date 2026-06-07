import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pool } from './pool.js'

export async function initDb(): Promise<void> {
  try {
    console.log('Starting database initialization...')

    const schemaPath = resolve(process.cwd(), 'sql', '00_complete_schema.sql')
    console.log(`Reading schema from: ${schemaPath}`)

    const schemaSql = await readFile(schemaPath, 'utf-8')
    console.log('Schema file loaded successfully')

    console.log('Executing database schema...')
    await pool.query(schemaSql)

    console.log('✓ Database schema initialized successfully')
    console.log('✓ All tables, indexes, and functions created')
  } catch (error) {
    console.error('✗ Database initialization failed:')
    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`)
      if ('code' in error) {
        console.error(`  Code: ${(error as any).code}`)
      }
    } else {
      console.error(error)
    }
    throw error
  }
}