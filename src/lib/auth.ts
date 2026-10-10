
import { supabase } from './supabase'

export async function signInWithGitHub() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Check your GitHub Actions variables.'
    )
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + '/Classfinance/',
      scopes: 'read:user user:email',
    },
  })

  if (error) throw error
}

export async function signOut() {
  if (!supabase) return

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
