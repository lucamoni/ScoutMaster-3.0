import SheetsSettings from './components/SheetsSettings'
import DataResetSettings from './components/DataResetSettings'
import AuditSettings from './components/AuditSettings'
import CensimentoSettings from './components/CensimentoSettings'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ImpostazioniPage() {
  const supabase = await createClient()
  
  // Fetch impostazioni attuali
  const { data } = await supabase.from('impostazioni').select('*')
  const settings: Record<string, string> = {}
  
  if (data) {
    data.forEach(r => {
      settings[r.chiave] = r.valore
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary">Impostazioni Globali</h1>
        <p className="text-muted-foreground mt-1">
          Gestisci le configurazioni di sistema, le quote censimento (standard e scontate fratelli), la sincronizzazione con Google Sheets e la pulizia dei dati.
        </p>
      </div>

      <CensimentoSettings 
        initialCensimentoStandard={settings.quota_censimento_standard || '45'}
        initialCensimentoFratelli={settings.quota_censimento_fratelli || '35'}
        initialMensileStandard={settings.quota_mensile_standard || '10'}
      />

      <AuditSettings />

      <SheetsSettings 
        initialSpreadsheetId={settings.spreadsheet_id || ''}
        initialSheetName={settings.sheet_name || 'Foglio1'}
        initialSheetNameSpese={settings.sheet_name_spese || 'SPESE'}
      />

      <DataResetSettings />
    </div>
  )
}
