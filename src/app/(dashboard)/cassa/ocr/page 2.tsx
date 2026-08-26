'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Camera, UploadCloud, Loader2, ArrowLeft } from 'lucide-react'
import { Database } from '@/types/database.types'

export default function OCRScannerPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState<Record<string, unknown> | null>(null)
  
  const [formData, setFormData] = useState({
    voce_spesa: '',
    importo: '',
    data: '',
    fornitore: '',
    metodo: 'Contanti',
    momento_anno: 'ANNO',
    note: ''
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setExtractedData(null)
    }
  }

  const handleScan = async () => {
    if (!file) return

    setLoading(true)
    try {
      const data = new FormData()
      data.append('file', file)

      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: data
      })

      if (!response.ok) throw new Error('Errore OCR')

      const result = await response.json()
      setExtractedData(result)
      
      setFormData(prev => ({
        ...prev,
        importo: result.importo.toString(),
        data: result.data,
        fornitore: result.fornitore,
        voce_spesa: result.voce_spesa,
        note: `Acquisto presso ${result.fornitore}`
      }))
    } catch (error) {
      console.error(error)
      alert("Impossibile analizzare lo scontrino. Riprova.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      let photoUrl = null

      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('scontrini')
          .upload(fileName, file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('scontrini')
          .getPublicUrl(fileName)
        
        photoUrl = publicUrl
      }

      const { error } = await supabase
        .from('registro_spese')
        .insert({
          voce_spesa: formData.voce_spesa,
          importo: Number(formData.importo),
          data: formData.data || new Date().toISOString().split('T')[0],
          metodo: formData.metodo,
          momento_anno: formData.momento_anno,
          note: formData.note,
          ricevuta_presente: true,
          foto_scontrino_url: photoUrl
        })

      if (error) throw error

      router.push('/cassa')
    } catch (error) {
      console.error(error)
      alert("Errore nel salvataggio della spesa.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/cassa')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Scanner Scontrini AI</h1>
      </div>

      {!extractedData ? (
        <Card>
          <CardHeader>
            <CardTitle>Carica Ricevuta</CardTitle>
            <CardDescription>Scatta una foto allo scontrino per estrarre i dati automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewUrl ? (
              <div className="relative aspect-[3/4] w-full rounded-md border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="object-cover w-full h-full" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-md bg-muted/50">
                <Camera className="h-10 w-10 text-muted-foreground mb-4" />
                <Label htmlFor="photo-upload" className="cursor-pointer bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90">
                  Apri Fotocamera
                </Label>
                <Input 
                  id="photo-upload" 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </div>
            )}

            {file && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setFile(null); setPreviewUrl(null) }}>
                  Riprova
                </Button>
                <Button className="flex-1" onClick={handleScan} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  Analizza (Gemini OCR)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Conferma Dati</CardTitle>
            <CardDescription>Gemini ha estratto i seguenti dati. Controlla e salva.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Importo (€)</Label>
                  <Input type="number" step="0.01" required value={formData.importo} onChange={e => setFormData({...formData, importo: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" required value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fornitore</Label>
                <Input required value={formData.fornitore} onChange={e => setFormData({...formData, fornitore: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label>Categoria Suggerita</Label>
                <Select value={formData.voce_spesa} onValueChange={v => setFormData({...formData, voce_spesa: v || ''})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Materiale da Lavoro">Materiale da Lavoro</SelectItem>
                    <SelectItem value="KAMBU">KAMBU (Spesa Alimentari)</SelectItem>
                    <SelectItem value="Materiale vario attività">Materiale vario attività</SelectItem>
                    <SelectItem value="Altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Metodo Pagamento</Label>
                  <Select value={formData.metodo} onValueChange={v => setFormData({...formData, metodo: v || ''})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Contanti">Contanti</SelectItem>
                      <SelectItem value="Carta">Carta (C/C)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Momento Anno</Label>
                  <Select value={formData.momento_anno} onValueChange={v => setFormData({...formData, momento_anno: v || ''})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANNO">ANNO</SelectItem>
                      <SelectItem value="CI">Campo Invernale</SelectItem>
                      <SelectItem value="CE">Campo Estivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Input value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} />
              </div>

              <div className="pt-4 flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setExtractedData(null)}>
                  Annulla
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salva Spesa
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
