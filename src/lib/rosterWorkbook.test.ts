import {it,expect} from 'vitest'
import * as XLSX from 'xlsx'
import {rosterWorkbook,readRosterWorkbook} from './rosterWorkbook'
import {ROSTER_FIELDS,type Boy} from './roster'
it('modello con codici e telefoni come testo, vuoto senza righe spurie',()=>{const wb=rosterWorkbook();const c=ROSTER_FIELDS.indexOf('telefono_ragazzo');expect(wb.Sheets.ANAGRAFICA[XLSX.utils.encode_cell({r:1,c})].z).toBe('@');expect(readRosterWorkbook(XLSX.write(wb,{type:'array',bookType:'xlsx'}))).toEqual([])})
it('esporta tutte le colonne, archiviati, CF, telefoni, salute e JSON senza perdere zeri',()=>{const b={id:'id',nome:'Mario',cognome:'Rossi',attivo:false,codice_censimento:'00123',telefono_ragazzo:'00393331234567',codice_fiscale:'RSSMRA10A01H501U',note_sanitarie:'Dato di prova',stati_documenti:{privacy:true}} as unknown as Boy;const wb=rosterWorkbook([b]);const rows=readRosterWorkbook(XLSX.write(wb,{type:'array',bookType:'xlsx'}));expect(Object.keys(rows[0])).toEqual([...ROSTER_FIELDS]);expect(rows[0]).toMatchObject({codice_censimento:'00123',telefono_ragazzo:'00393331234567',note_sanitarie:'Dato di prova',stati_documenti:'{"privacy":true}',attivo:'FALSE'})})
