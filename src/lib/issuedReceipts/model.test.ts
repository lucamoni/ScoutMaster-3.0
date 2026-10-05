import { describe,it,expect } from 'vitest'
import { receiptRecipient,makeSnapshot,amountWords, paymentMethod,type Movement,type ReceiptConfig } from './model'
import { previewRoster,type Boy } from '@/lib/roster'
import { suggestParent,normalizeProof } from './proof'
import { canManageSystem,getStaffRole,roleAllowed } from '@/lib/security/roles'
const boy={id:'boy',nome:'Mario',cognome:'Rossi',codice_fiscale:'RSSMRA10A01H501U',genitore_1_nome:'Luigi Rossi',genitore_1_codice_fiscale:'RSSLGU80A01H501U',genitore_1_email:'test@example.invalid',genitore_2_nome:'Anna Verdi',genitore_2_codice_fiscale:'VRDNNA80A01H501U'} as Boy
const config={treasurer:'Tesoriere',signature:'data:image/png;base64,AA=='} satisfies ReceiptConfig
const line={id:'a',ragazzo_id:'boy',data:'2026-01-01',importo:10,metodo:'Bonifico',tipo_movimento:'ENTRATA',voce_spesa:'Quote',note:'Gennaio',momento_anno:'ANNO'} as Movement
const build=(lines:Movement[]=[line],b=boy,issued=new Set<string>())=>makeSnapshot(b,lines,'2025-2026',1,config,issued,'2026-10-05')
describe('Ricevute raggruppate e immutabili',()=>{
 it('somma in centesimi, distingue i due CF e include i metodi misti',()=>{const s=build([{...line,importo:0.1},{...line,id:'b',importo:0.2,metodo:'Contanti'}]);expect(s.total).toBe(.3);expect(s.boy.cf).toBe(boy.codice_fiscale);expect(s.payer.cf).toBe(boy.genitore_1_codice_fiscale);expect(s.lines.map(l=>l.method)).toEqual(['Bonifico','Contanti']);expect(s.parent).toBe(1)})
 it('rifiuta uscite, duplicati, anno diverso, movimenti già certificati e ragazzo diverso',()=>{for(const bad of [{...line,tipo_movimento:'USCITA'},{...line,data:'2026-10-01'},{...line,ragazzo_id:'other'},{...line,importo:0}])expect(()=>build([bad])).toThrow();expect(()=>build([line,line])).toThrow();expect(()=>build([line],boy,new Set(['a']))).toThrow()})
 it('rifiuta CF mancanti e metodo ignoto invece di assumere contanti',()=>{expect(()=>build([line],{...boy,codice_fiscale:null})).toThrow();expect(()=>build([line],{...boy,genitore_1_codice_fiscale:null})).toThrow();expect(()=>paymentMethod(null)).toThrow()})
 it('contatti di un pagatore diverso non vengono usati per inviare documenti',()=>{const s=build();expect(receiptRecipient(s,{...boy,genitore_1_codice_fiscale:'VRDNNA80A01H501U',genitore_1_email:'altro@example.invalid'}).email).toBe('test@example.invalid')})
 it('usa contatti aggiornati solo per lo stesso pagatore senza cambiare il PDF',()=>{const s=build();const updated={...boy,genitore_1_email:'nuovo@example.invalid'};expect(receiptRecipient(s,updated).email).toBe('nuovo@example.invalid');expect(s.payer.email).toBe('test@example.invalid')})
 it('include censimento realmente registrato, indipendentemente dal computo di cassa',()=>{expect(build([{...line,voce_spesa:'Censimento',riferimento_censimento_anno:'2025-2026'}]).total).toBe(10)})
 it('fotografa dati e firma senza conservare riferimenti mutabili',()=>{const b={...boy};const s=build([line],b);b.nome='Modificato';config.treasurer='Nuovo';expect(s.boy.name).toBe('Mario Rossi');expect(s.treasurer).toBe('Tesoriere');config.treasurer='Tesoriere'})
 it.each([[0,'zero/00'],[21.05,'ventuno/05'],[28,'ventotto/00'],[180,'centottanta/00'],[2800,'duemilaottocento/00'],[1001,'milleuno/00']])('importo %s in lettere',(n,w)=>expect(amountWords(Number(n))).toBe(w))
})
describe('Importazione anagrafiche',()=>{
 it('crea, aggiorna e salta senza cancellare campi con celle vuote',()=>{const rows=[{nome:'Mario',cognome:'Rossi',codice_fiscale:boy.codice_fiscale,genitore_1_email:''}];expect(previewRoster(rows,[boy],'create')[0].action).toBe('skip');const p=previewRoster(rows,[boy],'update')[0];expect(p.action).toBe('update');expect(p.data.id).toBe('boy');expect(p.data).not.toHaveProperty('genitore_1_email')})
 it('blocca duplicati, CF malformati, colonne sconosciute e email non valida',()=>{const rows=[{nome:'Mario',cognome:'Rossi',codice_fiscale:'?',genitore_1_email:'x',intruso:'y'},{nome:'Mario',cognome:'Rossi'}];expect(previewRoster(rows,[],'create').every(r=>r.errors.length>0)).toBe(true)})
 it('rifiuta identità ambigue e ID inesistente',()=>{expect(previewRoster([{nome:'Mario',cognome:'Rossi'}],[boy,{...boy,id:'b'}],'update')[0].errors.length).toBeGreaterThan(0);expect(previewRoster([{id:'x',nome:'Anna',cognome:'Verdi'}],[boy],'update')[0].errors.length).toBeGreaterThan(0)})
 it('conserva telefoni, normalizza date e flag, esportazione reimportabile JSON',()=>{const p=previewRoster([{nome:'Anna',cognome:'Verdi',telefono_ragazzo:'+39 333',data_nascita:'03/02/2010',attivo:'Sì',stati_documenti:'{"privacy":true}'}],[],'create')[0];expect(p.errors).toEqual([]);expect(p.data).toMatchObject({telefono_ragazzo:'+39 333',data_nascita:'2010-02-03',attivo:true,stati_documenti:{privacy:true}})})
})
describe('Prove e ruolo tesoriere',()=>{
 it('riconosce un genitore anche con ordine nome invertito, ma non nomi parziali o ambigui',()=>{expect(suggestParent('ROSSI Luigi',['Luigi Rossi','Anna Verdi'])).toBe(1);expect(suggestParent('Rossi',['Luigi Rossi','Anna Verdi'])).toBeNull();expect(suggestParent('Luigi Rossi',['Luigi Rossi','Luigi Rossi'])).toBeNull()})
 it('non inventa importi/date e non salva IBAN letti',()=>{expect(normalizeProof({payer:'Luigi Rossi',amount:'100',date:'2026-02-31',iban:'secret'},[boy.genitore_1_nome,null])).toMatchObject({amount:null,date:null,suggestedParent:1});expect(normalizeProof({iban:'secret'},[])).not.toHaveProperty('iban')})
 it('tesoriere può operare e firmare, ma non gestire le impostazioni',()=>{expect(getStaffRole({app_metadata:{role:'tesoriere_unita'}})).toBe('tesoriere_unita');expect(canManageSystem('tesoriere_unita')).toBe(false);expect(roleAllowed('tesoriere_unita',['admin'])).toBe(false);expect(roleAllowed('tesoriere_unita',['admin','tesoriere_unita'])).toBe(true)})
})
