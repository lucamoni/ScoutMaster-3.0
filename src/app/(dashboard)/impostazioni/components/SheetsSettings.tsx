'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'
import { 
  Save, 
  FileSpreadsheet, 
  Wand2, 
  Loader2, 
  Users, 
  Calendar, 
  Tent, 
  Receipt, 
  ChevronDown, 
  ChevronUp, 
  SlidersHorizontal,
  CheckCircle2
} from 'lucide-react'

interface ColumnMapping {
  sheetName: string
  tableName: string
  columnsMap: Record<string, string>
}

const MODULE_INFO: Record<string, { title: string, description: string, icon: React.ElementType, badgeColor: string }> = {
  ragazzi: {
    title: 'Anagrafica Ragazzi',
    description: 'Nomi, Cognomi, Squadriglie/Pattuglie, Sesso, Censimento e Contatti.',
    icon: Users,
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
  },
  quote_mensili: {
    title: 'Quote Mensili (Unpivot Mesi)',
    description: 'Stato pagamenti mensili da Ottobre a Giugno.',
    icon: Calendar,
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
  },
  partecipazioni_eventi: {
    title: 'Uscite ed Eventi (Unpivot Presenze)',
    description: 'Presenze (Presente/Assente/Pendolare), Quote dovute e Riscosso.',
    icon: Tent,
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
  },
  registro_spese: {
    title: 'Spese di Cassa (Uscite Reali)',
    description: 'Uscite reali di cassa (Data, Voce, Importo, Metodo e Categoria).',
    icon: Receipt,
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
  }
}

export default function SheetsSettings({ 
  initialSpreadsheetId, 
  initialSheetName,
  initialSheetNameSpese
}: { 
  initialSpreadsheetId: string, 
  initialSheetName: string,
  initialSheetNameSpese: string
}) {
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId)

  // Estrae l'ID pulito da un URL Google Sheets oppure restituisce la stringa com'è se già un ID
  const extractSheetId = (raw: string): string => {
    const trimmed = raw.trim()
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : trimmed
  }
  const [sheetName] = useState(initialSheetName)
  const [sheetNameSpese] = useState(initialSheetNameSpese)
  const [isSaving, setIsSaving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  
  const [aiMappings, setAiMappings] = useState<ColumnMapping[] | null>(null)
  
  // Selezione personalizzata dei moduli e dei fogli
  const [selectedTables, setSelectedTables] = useState<string[]>(['ragazzi', 'quote_mensili', 'partecipazioni_eventi', 'registro_spese'])
  const [selectedSheets, setSelectedSheets] = useState<string[]>([])
  const [annoScout, setAnnoScout] = useState<string>('2024-2025')
  const [showDetails, setShowDetails] = useState<boolean>(false)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates = [
        { chiave: 'spreadsheet_id', valore: spreadsheetId },
        { chiave: 'sheet_name', valore: sheetName },
        { chiave: 'sheet_name_spese', valore: sheetNameSpese }
      ]

      const { error } = await supabase.from('impostazioni').upsert(updates, { onConflict: 'chiave' })
      if (error) throw error
      
      toast.success('Impostazioni Google Sheets salvate con successo!')
    } catch (error: unknown) {
      const err = error as Error
      toast.error('Errore nel salvataggio: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAiMap = async () => {
    if (!spreadsheetId || !spreadsheetId.trim()) {
      toast.error('Inserisci l\'ID del Foglio Google prima di analizzare!')
      return
    }

    setIsAnalyzing(true)
    setAiMappings(null)
    toast.loading('Analisi dei fogli con intelligenza artificiale...', { id: 'ai-map' })
    try {
      await handleSave()
      
      const cleanId = extractSheetId(spreadsheetId.trim())
      const res = await fetch(`/api/sheets/ai-map?spreadsheetId=${encodeURIComponent(cleanId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore durante l\'analisi AI')

      const mappings: ColumnMapping[] = data.mappings || []
      setAiMappings(mappings)
      
      // Inizializza tutti i fogli trovati come selezionati
      const allSheetNames = Array.from(new Set(mappings.map(m => m.sheetName)))
      setSelectedSheets(allSheetNames)

      // Inizializza tutti i moduli presenti nelle mappature
      const allTables = Array.from(new Set(mappings.map(m => m.tableName)))
      setSelectedTables(allTables)

      toast.success(`Analisi completata! Trovati ${allSheetNames.length} fogli per ${allTables.length} moduli.`, { id: 'ai-map' })
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message, { id: 'ai-map' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggleTable = (tableKey: string) => {
    setSelectedTables(prev => 
      prev.includes(tableKey) 
        ? prev.filter(t => t !== tableKey) 
        : [...prev, tableKey]
    )
  }

  const toggleSheet = (sheetName: string) => {
    setSelectedSheets(prev => 
      prev.includes(sheetName) 
        ? prev.filter(s => s !== sheetName) 
        : [...prev, sheetName]
    )
  }

  const handleImport = async () => {
    if (selectedTables.length === 0) {
      toast.error('Seleziona almeno un modulo da importare!')
      return
    }

    if (selectedSheets.length === 0) {
      toast.error('Seleziona almeno un foglio da importare!')
      return
    }

    setIsImporting(true)
    toast.loading('Importazione dati selezionati in corso...', { id: 'ai-import' })
    try {
      const res = await fetch('/api/sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mappings: aiMappings, 
          spreadsheetId,
          selectedTables,
          selectedSheets,
          annoScout
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore durante l\'importazione')

      let totalInserted = 0
      let totalUpdated = 0
      data.results?.forEach((r: { sheetName: string, tableName: string, inserted: number, updated: number, skipped: number }) => {
        totalInserted += r.inserted
        totalUpdated += r.updated
      })

      toast.success(`Importazione completata con successo! Inseriti ${totalInserted} record e aggiornati ${totalUpdated}.`, { id: 'ai-import', duration: 10000 })
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message, { id: 'ai-import' })
    } finally {
      setIsImporting(false)
    }
  }

  // Mappature raggruppate per tabella
  const availableTablesInMappings = aiMappings ? Array.from(new Set(aiMappings.map(m => m.tableName))) : []
  const availableSheetsInMappings = aiMappings ? Array.from(new Set(aiMappings.map(m => m.sheetName))) : []

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-bold">
          <FileSpreadsheet className="w-6 h-6 text-green-600" />
          Integrazione & Importazione Google Sheets
        </CardTitle>
        <CardDescription>
          Configura l&apos;ID del foglio Google ed usa la procedura guidata per selezionare **cosa, come e quanto** importare.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Sezione ID Foglio Google */}
        <div className="space-y-2">
          <Label htmlFor="spreadsheetId" className="font-semibold">Google Spreadsheet ID</Label>
          <div className="flex gap-2">
            <Input 
              id="spreadsheetId" 
              placeholder="es. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" 
              value={spreadsheetId}
              onChange={e => setSpreadsheetId(extractSheetId(e.target.value))}
              className="font-mono text-sm"
            />
            <Button onClick={handleAiMap} disabled={isAnalyzing || !spreadsheetId.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
              {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isAnalyzing ? 'Analisi...' : 'Analizza Fogli con AI'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Lo trovi nell&apos;URL del tuo foglio Google tra /d/ e /edit. Assicurati che il foglio sia condiviso in lettura con il link.</p>
        </div>

        {/* Mappature trovate ed Opzioni di Selezione */}
        {aiMappings && (
          <div className="border rounded-lg p-5 space-y-6 bg-card shadow-sm border-indigo-200 dark:border-indigo-900 animate-in fade-in slide-in-from-top-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b pb-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                  <SlidersHorizontal className="w-5 h-5" /> Configurazione Personalizzata Importazione
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Scegli quali moduli e fogli sincronizzare ed imposta i parametri desiderati.</p>
              </div>
              <Badge variant="outline" className="w-fit border-indigo-300 text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300">
                {selectedTables.length} moduli / {selectedSheets.length} fogli selezionati
              </Badge>
            </div>

            {/* SELEZIONE MODULI PRINCIPALI */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                1. Scegli cosa importare (Moduli di sistema):
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(MODULE_INFO).map(([tableKey, info]) => {
                  const IconComp = info.icon
                  const isPresent = availableTablesInMappings.includes(tableKey)
                  const isChecked = selectedTables.includes(tableKey)
                  const sheetsForThisModule = aiMappings.filter(m => m.tableName === tableKey).map(m => m.sheetName)

                  return (
                    <div 
                      key={tableKey} 
                      onClick={() => isPresent && toggleTable(tableKey)}
                      className={`border rounded-lg p-3 transition-all cursor-pointer flex items-start gap-3 ${
                        !isPresent 
                          ? 'opacity-40 bg-muted cursor-not-allowed' 
                          : isChecked 
                            ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-sm' 
                            : 'hover:border-slate-300 bg-card'
                      }`}
                    >
                      <Checkbox 
                        checked={isChecked && isPresent} 
                        disabled={!isPresent}
                        onCheckedChange={() => toggleTable(tableKey)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-sm flex items-center gap-1.5">
                            <IconComp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            {info.title}
                          </p>
                          {isPresent ? (
                            <Badge className={`text-[10px] shrink-0 ${info.badgeColor}`}>
                              {sheetsForThisModule.join(', ')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] shrink-0">Non rilevato</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{info.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* SELEZIONE SINGOLI FOGLI TAB GOOGLE */}
            <div className="space-y-3 pt-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                2. Filtra per Singolo Foglio (Tab nel Google Sheet):
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableSheetsInMappings.map(sName => {
                  const isChecked = selectedSheets.includes(sName)
                  const mappedTables = Array.from(new Set(aiMappings.filter(m => m.sheetName === sName).map(m => m.tableName)))
                  return (
                    <button
                      key={sName}
                      type="button"
                      onClick={() => toggleSheet(sName)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5 ${
                        isChecked 
                          ? 'border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700 shadow-sm' 
                          : 'border-slate-200 bg-muted/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Checkbox checked={isChecked} className="size-3" />
                      <span>{sName}</span>
                      <span className="text-[10px] opacity-75 font-mono">({mappedTables.join(', ')})</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* PARAMETRI E OPZIONI DI IMPORTAZIONE ("COME E QUANTO") */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold flex items-center gap-2">
                3. Imposta i Parametri di Importazione:
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-md">
                <div className="space-y-1.5">
                  <Label htmlFor="annoScout" className="text-xs font-medium">Anno Scout Target (Quote Mensili)</Label>
                  <Input 
                    id="annoScout"
                    value={annoScout}
                    onChange={e => setAnnoScout(e.target.value)}
                    placeholder="es. 2024-2025"
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Le quote mensili sbloccate verranno salvate sotto questo anno scout.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Regola Deduplicazione Righe</Label>
                  <p className="text-xs text-muted-foreground pt-1">
                    I ragazzi già presenti in anagrafica e le partecipazioni già registrate verranno **aggiornati** senza creare duplicati.
                  </p>
                </div>
              </div>
            </div>

            {/* ANTEPRIMA COLONNE MAPPATE (EXPANDABLE) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 hover:underline"
              >
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showDetails ? 'Nascondi dettagli mappatura colonne' : 'Mostra dettaglio colonne mappate per foglio'}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-3 animate-in fade-in">
                  {aiMappings
                    .filter(m => selectedTables.includes(m.tableName) && selectedSheets.includes(m.sheetName))
                    .map((m, idx) => (
                      <div key={idx} className="border p-3 rounded bg-card text-xs">
                        <div className="flex justify-between items-center font-semibold mb-2 border-b pb-1">
                          <span>Foglio: <strong className="text-indigo-600">{m.sheetName}</strong></span>
                          <span>Tabella: <strong className="text-green-600">{m.tableName}</strong></span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px]">
                          {Object.entries(m.columnsMap).map(([sheetCol, dbCol]) => (
                            <div key={sheetCol} className="flex justify-between border-b border-muted pb-0.5">
                              <span className="truncate pr-1">{sheetCol}</span>
                              <span className="font-mono text-primary truncate">{String(dbCol)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* BOTTONE AZIONE CONFERMA */}
            <Button 
              onClick={handleImport} 
              disabled={isImporting || selectedTables.length === 0 || selectedSheets.length === 0} 
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-5 text-base shadow-md transition-all"
            >
              {isImporting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
              {isImporting 
                ? 'Importazione in corso...' 
                : `Conferma ed Importa (${selectedTables.length} Moduli su ${selectedSheets.length} Fogli)`}
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t pt-4">
        <Button variant="outline" onClick={handleSave} disabled={isSaving} className="text-xs">
          {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salva solo ID Foglio
        </Button>
      </CardFooter>
    </Card>
  )
}
