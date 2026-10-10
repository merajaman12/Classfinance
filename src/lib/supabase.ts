
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseKey) &&
  Boolean(supabaseUrl?.startsWith('https://')) &&
  Boolean(supabaseUrl?.endsWith('.supabase.co'))

export const supabase =
  isSupabaseConfigured && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null
