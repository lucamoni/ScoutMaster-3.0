import { requireRole, AuthorizationError } from '@/lib/security/auth'
import { redirect } from 'next/navigation'
import RosterSettings from './components/RosterSettings'
import UserSettings from './components/UserSettings'
import { getAccountingPeriod } from '@/lib/utils/accounting'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import SheetsSettings from './components/SheetsSettings'
import DataResetSettings from './components/DataResetSettings'
import AuditSettings from './components/AuditSettings'
import CensimentoSettings from './components/CensimentoSettings'
import { createClient } from '@/lib/supabase/server'
import { getWorkingYear } from '@/lib/workingYear'
import { workingYearSettings } from '@/lib/utils/workingYear'
import { getMonthlyQuotaAmount } from '@/lib/utils/monthlyQuota'

export const dynamic = 'force-dynamic'

export default async function ImpostazioniPage() {
  try { await requireRole(['admin']) } catch (error) { if (error instanceof AuthorizationError) redirect('/'); throw error }
  const supabase = await createClient()
  
  // Fetch impostazioni attuali
  const { data } = await supabase.from('impostazioni').select('*')
  const settings: Record<string, string> = {}
  
  if (data) {
    data.forEach(r => {
      settings[r.chiave] = r.valore
    })
  }

  const period = getAccountingPeriod(workingYearSettings(new Map(Object.entries(settings)), await getWorkingYear(settings.anno_scout_corrente)), getCurrentAnnoScout())

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary">Impostazioni Globali</h1>
        <p className="text-muted-foreground mt-1">
          Gestisci le configurazioni di sistema, le quote censimento (standard e scontate fratelli), la sincronizzazione con Google Sheets e la pulizia dei dati.
        </p>
      </div>

      <UserSettings />
      <RosterSettings key={period.currentYear} currentYear={period.currentYear} />

      <CensimentoSettings key={period.currentYear}
        currentYear={period.currentYear}
        initialCensimentoStandard={settings.quota_censimento_standard || '45'}
        initialCensimentoFratelli={settings.quota_censimento_fratelli || '35'}
        initialMensileStandard={String(getMonthlyQuotaAmount(new Map(Object.entries(settings)), period.currentYear))}
        initialSaldoContanti={String(period.initialCash)}
        initialSaldoBanca={String(period.initialBank)}
      />

      <AuditSettings />

      <SheetsSettings 
        initialSpreadsheetId={settings.spreadsheet_id || ''}
        initialSheetName={settings.sheet_name || 'Foglio1'}
        initialSheetNameSpese={settings.sheet_name_spese || 'SPESE'}
        initialAnnoScout={period.currentYear}
      />

      <DataResetSettings currentYear={period.currentYear} />
    </div>
  )
}
