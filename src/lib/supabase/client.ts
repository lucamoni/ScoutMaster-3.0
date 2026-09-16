import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Configurazione Supabase client mancante')
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key)
  }

  return browserClient
}
