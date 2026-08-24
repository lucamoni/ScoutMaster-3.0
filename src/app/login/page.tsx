import { login } from './actions'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ScoutMasterLogo from '@/components/layout/Logo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-surface-bg text-slate-900 font-sans">
      <Card className="w-full max-w-sm shadow-xl border-slate-200/80 rounded-2xl bg-white overflow-hidden">
        <div className="bg-agesci-blue p-6 text-center border-b border-agesci-blue-light">
          <ScoutMasterLogo className="h-12 w-auto mx-auto" theme="dark" />
        </div>
        <CardHeader className="space-y-1 text-center pt-4 pb-2">
          <CardTitle className="text-lg font-bold text-agesci-blue">Accesso Staff di Reparto</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Inserisci le tue credenziali per accedere al gestionale E/G AGESCI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <form className="grid gap-4" action={login}>
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Email Capo Reparto</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="capo@reparto.it"
                required
                className="h-10 text-xs rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-700">Password</Label>
              <Input id="password" name="password" type="password" required className="h-10 text-xs rounded-xl" />
            </div>
            
            {error && (
              <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200 font-medium">
                {error}
              </div>
            )}
            
            <Button type="submit" className="w-full h-10 font-bold bg-agesci-blue hover:bg-agesci-blue-light text-white rounded-xl shadow-sm transition-all">
              Accedi a ScoutMaster
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
