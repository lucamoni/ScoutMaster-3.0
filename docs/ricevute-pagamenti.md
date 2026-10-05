# Anagrafiche e ricevute pagamenti

## Uso

- Impostazioni → Importa ed esporta anagrafiche: modello Excel, esportazione di tutte le colonne (compresi archiviati e dati sanitari), anteprima e importazione transazionale. Le celle vuote mantengono i dati esistenti. Mantieni i codici/telefoni come testo. Puoi compilare il modello in Google Sheets e scaricarlo in Excel; per importazione diretta di fogli privati usa l'account di servizio configurato. Non occorre pubblicare dati personali.
- Gestione utenti: scegli il ruolo ADMIN, CAPO UNITÀ o AIUTO CAPO UNITÀ, poi assegna separatamente la qualifica TESORIERE DI UNITÀ. La qualifica consente la gestione di nome e firma delle ricevute; non amplia i permessi sulle impostazioni di sistema o sulla gestione utenti, che dipendono dal ruolo. Gli account con il precedente ruolo tesoriere sono riconosciuti come AIUTO CAPO UNITÀ con la qualifica aggiuntiva.
- Anagrafica: codice fiscale ragazzo, telefono ragazzo, due genitori con nome, WhatsApp, email e codice fiscale del pagatore.
- Cassa: associa le entrate individuali al ragazzo, senza reinterpretare entrate generiche. I collegamenti provenienti da quote/eventi restano protetti.
- Ricevute pagamenti → Prove bonifico: seleziona uno o più movimenti di un ragazzo coperti dal documento, carica PNG/JPEG/PDF, leggi ordinante/importo/data/stato, verifica e conferma il genitore e l'avvenuta esecuzione. La prova non crea nuovi movimenti né considera saldato un pagamento da eseguire.
- Ricevute pagamenti → Firma e invio: nome del tesoriere e firma PNG/JPEG sostituibili da tesoriere/admin/capo.
- Genera: seleziona entrate positive dell'anno, visualizza PDF, conferma pagatore, emetti. Le prove confermate determinano il genitore; pagatori diversi vengono separati. Il censimento realmente registrato può essere certificato anche se escluso dal computo entrate. Nessuna ricevuta viene inferita dal solo flag saldato senza movimento.
- Archivio: PDF numerati e snapshot immutabili. Un movimento è certificabile una volta; aggiornamenti/eliminazioni di Cassa non riscrivono le ricevute. In caso di errore nei dati di una ricevuta già emessa occorre una procedura di rettifica dedicata: questa versione non cancella certificazioni né libera automaticamente movimenti.
- WhatsApp: condividi il PDF dal telefono o scaricalo e allegalo alla chat del genitore. Nessun invio automatico o in massa via WhatsApp.
- Email: prepara e conferma elenco destinatari/PDF. Ogni email è individuale. Una consegna già riuscita/in corso/incerta non viene automaticamente ripetuta; esito incerto da verificare in Posta inviata.

## Attivare Gmail (configurazione esterna ancora necessaria)

Mittente previsto: `repartoeirenebrownsea.prato6@gmail.com`.

1. Nel progetto Google Cloud del gruppo abilita Gmail API e configura consenso OAuth e un client **Applicazione web**. In modalità test aggiungi la casella del reparto come utente di test. Il permesso `gmail.send` può richiedere verifica Google per la pubblicazione dell'app; in modalità test i token possono scadere rapidamente.
2. URI di reindirizzamento autorizzato: `https://scout-master-3-0.vercel.app/api/ricevute/gmail/callback`.
3. In Vercel, Production, configura `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY` (32 byte casuali codificati base64). Non inserire segreti in chat o nel repository. Imposta gli stessi valori nel solo ambiente che deve collegare Gmail, poi ridistribuisci.
4. ADMIN/CAPO → Ricevute pagamenti → Firma e invio → Collega Gmail. Il titolare completa accesso e consenso Google con la casella del reparto. Sono richiesti soltanto `openid`, `email`, `gmail.send`; l'app verifica indirizzo e email_verified, non legge la posta.
5. Esegui un invio di prova verso un contatto di prova autorizzato e verifica allegato e Posta inviata prima di invii reali.

Il refresh token è cifrato AES-256-GCM in una tabella accessibile soltanto al server. Il mittente non viene simulato e l'invio rimane disabilitato senza configurazione/collegamento. I documenti di prova OCR usano i provider già configurati: Groq per immagini, Gemini per PDF o riserva; analisi errata/non disponibile consente conferma manuale.

## Architettura e verifica

Migrazione `20261005123500_issued_receipts_and_roster_contacts.sql`: quattro nuove colonne anagrafica, riconoscimento ruolo tesoriere, sei tabelle con RLS e privilegi client revocati, due bucket privati senza policy client, tre RPC SECURITY INVOKER riservate a service_role. Le API verificano lo staff tramite `getUser`/app_metadata e l'origine delle mutazioni. Firma e token non sono pubblici. L'assenza di policy sulle tabelle server-only è intenzionale (advisor INFO).

La qualifica è salvata in `app_metadata.treasurer` come booleano, impostato soltanto dalle API amministrative. `user_metadata` non autorizza la gestione della firma. La lettura compatibile di `role: tesoriere_unita` conserva qualifica e permessi durante la conversione degli account; al salvataggio il ruolo torna uno dei tre ruoli base.

Emissione/import/prove sono transazionali; l'emissione e l'associazione prove condividono un lock e verificano importi e pagatore. Unicità movimento certificato e numero per anno. Le prove conservano fonte/ragazzo/importo/data per segnalare modifiche successive. Il PDF viene archiviato nel bucket; in caso di upload fallito il documento è recuperabile dallo snapshot senza nuova emissione.

Numerazione per anno scout, non anno solare; diciture del facsimile fornite dal gruppo, nessuna validazione legale o promessa di firma digitale certificata.
