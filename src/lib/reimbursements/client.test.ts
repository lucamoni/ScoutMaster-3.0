import { afterEach, expect, it, vi } from 'vitest'
import { saveExpenseEntry, submitReimbursement } from './client'
import { imageForRecognition } from '@/lib/ocr/receipt'
vi.mock('@/lib/ocr/receipt', () => ({ imageForRecognition: vi.fn() }))
const input = { id: '00000000-0000-4000-8000-000000000001', beneficiary: '00000000-0000-4000-8000-000000000002', year: '2026-2027', date: '2026-10-01', amount: '24.50', category: 'Materiale', period: 'CI', note: 'Prova' }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('richiede una scelta esplicita prima di scrivere qualsiasi dato', async () => {
 const movement = vi.fn(), advance = vi.fn()
 await expect(saveExpenseEntry('', movement, advance)).rejects.toThrow('Scegli chi ha pagato')
 expect(movement).not.toHaveBeenCalled(); expect(advance).not.toHaveBeenCalled()
})
it('una spesa personale con foto usa solo il rimborso e conserva dati e beneficiario', async () => {
 const photo = new File(['foto'], 'scontrino.png', { type: 'image/png' })
 vi.mocked(imageForRecognition).mockResolvedValue(new Blob(['ridotta'], { type: 'image/jpeg' }))
 const fetchMock = vi.fn().mockResolvedValue({ok:true,redirected:false,json:async()=>({ok:true,id:input.id})}); vi.stubGlobal('fetch',fetchMock)
 const movement = vi.fn()
 const result = await saveExpenseEntry('PERSONAL', movement, () => submitReimbursement(input, photo))
 expect(result.kind).toBe('advance'); expect(movement).not.toHaveBeenCalled()
 expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][0]).toBe('/api/rimborsi')
 const body = fetchMock.mock.calls[0][1].body as FormData
 for(const [key,value] of Object.entries(input)) expect(body.get(key)).toBe(value)
 expect((body.get('file') as File).name).toBe('scontrino.jpg')
 expect(await (body.get('file') as File).text()).toBe('ridotta')
})
it('una spesa del reparto usa solo il movimento', async () => {
 const movement = vi.fn().mockResolvedValue({id:'ledger'}), advance = vi.fn()
 expect(await saveExpenseEntry('UNIT',movement,advance)).toEqual({kind:'movement',movement:{id:'ledger'}})
 expect(movement).toHaveBeenCalledTimes(1); expect(advance).not.toHaveBeenCalled()
})
it('un errore nel rimborso non ripiega mai su una spesa in cassa', async () => {
 const movement = vi.fn(), advance = vi.fn().mockRejectedValue(Error('Rete non disponibile'))
 await expect(saveExpenseEntry('PERSONAL',movement,advance)).rejects.toThrow('Rete non disponibile')
 expect(movement).not.toHaveBeenCalled()
})
it('non carica documenti oltre il limite e non nasconde errori di accesso', async () => {
 const request = vi.fn(); vi.stubGlobal('fetch',request)
 await expect(submitReimbursement(input,new File([new Uint8Array(3145729)],'file.pdf',{type:'application/pdf'}))).rejects.toThrow('supera 3 MB')
 expect(request).not.toHaveBeenCalled()
 request.mockResolvedValue({ok:true,redirected:true})
 await expect(submitReimbursement(input,null)).rejects.toThrow('Accedi di nuovo')
})
