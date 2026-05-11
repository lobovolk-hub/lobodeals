import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

async function loadKeyValueFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')

    for (const originalLine of raw.split(/\r?\n/)) {
      const line = originalLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      let value = line.slice(separatorIndex + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // Missing env files are ignored. Required variables are validated later.
  }
}

function summarizeError(error) {
  if (!error) return 'Unknown error'
  if (error instanceof Error) return error.message

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function main() {
  await loadKeyValueFile(path.resolve(process.cwd(), '.env.local'))
  await loadKeyValueFile(
    path.resolve(process.cwd(), '..', 'worker-playstation-ingest', '.dev.vars')
  )

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  console.log('Refreshing catalog_public_cache with refresh_catalog_public_cache_v15...')

  const { data, error } = await admin.rpc('refresh_catalog_public_cache_v15')

  if (error) {
    throw error
  }

  console.log('CACHE_REFRESH_RESULT:')
  console.log(JSON.stringify(data, null, 2))
}

main().catch((error) => {
  console.error(summarizeError(error))
  process.exit(1)
})