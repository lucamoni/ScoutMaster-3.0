'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/security/auth'

export async function logout(): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) return { error: 'Impossibile uscire dall’account. Riprova.' }
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function login(formData: FormData) {
  const hasSupabaseConfig =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!hasSupabaseConfig) {
    redirect('/login?error=' + encodeURIComponent('Configurazione Supabase mancante su Vercel.'))
  }

  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { data: result, error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  if (!result.user || !getUserRole(result.user)) {
    await supabase.auth.signOut()
    redirect('/login?error=' + encodeURIComponent('Account non abilitato. Contatta l’amministratore.'))
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
