import { pool } from './pool.js'

async function runMigration() {
  console.log('Starting database migration...')

  try {
    // Check and add new columns
    console.log('Adding new columns...')
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fire_events' AND column_name='region') THEN
          ALTER TABLE fire_events ADD COLUMN region VARCHAR(100);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fire_events' AND column_name='satellite_type') THEN
          ALTER TABLE fire_events ADD COLUMN satellite_type VARCHAR(100);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fire_events' AND column_name='unique_key') THEN
          ALTER TABLE fire_events ADD COLUMN unique_key VARCHAR(200);
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fire_events' AND column_name='confidence_raw') THEN
          ALTER TABLE fire_events RENAME COLUMN confidence_raw TO confidence;
        END IF;
      END $$;
    `)
    console.log('✓ New columns added')

    // Add indexes
    console.log('Adding indexes...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fire_events_region ON fire_events(region);
      CREATE INDEX IF NOT EXISTS idx_fire_events_satellite_type ON fire_events(satellite_type);
      CREATE INDEX IF NOT EXISTS idx_fire_events_unique_key ON fire_events(unique_key);
    `)
    console.log('✓ Indexes added')

    // Update existing data
    console.log('Updating existing data...')
    const updateResult = await pool.query(`
      UPDATE fire_events
      SET region = split_part(source, ':', 2),
          satellite_type = split_part(source, ':', 3) || ':' || split_part(source, ':', 4)
      WHERE source LIKE 'firms_wfs:%'
    `)
    console.log(`✓ Updated ${updateResult.rowCount} records`)

    // Generate unique_key
    console.log('Generating unique keys...')
    const uniqueKeyResult = await pool.query(`
      UPDATE fire_events
      SET unique_key = CASE
        WHEN satellite_type LIKE '%_7days' THEN 
          replace(satellite_type, '_7days', '_24hrs') || ':' || 
          ROUND(latitude::numeric, 4) || ':' || 
          ROUND(longitude::numeric, 4) || ':' ||
          TO_CHAR(COALESCE(acq_datetime, now()), 'YYYY-MM-DD"T"HH24:MI')
        WHEN satellite_type LIKE '%_24hrs' THEN
          satellite_type || ':' || 
          ROUND(latitude::numeric, 4) || ':' || 
          ROUND(longitude::numeric, 4) || ':' ||
          TO_CHAR(COALESCE(acq_datetime, now()), 'YYYY-MM-DD"T"HH24:MI')
        ELSE NULL
      END
      WHERE region IS NOT NULL AND satellite_type IS NOT NULL
    `)
    console.log(`✓ Generated unique keys for ${uniqueKeyResult.rowCount} records`)

    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

runMigration().catch((error) => {
  console.error(error)
  process.exit(1)
})
