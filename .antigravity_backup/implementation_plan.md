# Gestione Entrate Automatiche e Manuali in Cassa

Attualmente la Cassa (tabella `registro_spese`) gestisce unicamente le uscite (Spese). La richiesta è di trasformarla in un vero e proprio "Libro Cassa" a doppia entrata (Entrate e Uscite), con inserimento automatico quando si flagga il pagamento di un ragazzo nelle Quote o negli Eventi, mantenendo la possibilità di inserire entrate manuali extra.

## Modifiche Architetturali Necessarie

### 1. Database (Modifiche alla tabella `registro_spese`)
Per permettere la registrazione delle entrate e automatizzarle, dovremo aggiungere nuove colonne alla tabella `registro_spese`:
- `tipo_movimento` (testo): 'ENTRATA' o 'USCITA' (di default 'USCITA' per i record vecchi).
- `ragazzo_id` (uuid, opzionale): per tracciare a quale ragazzo si riferisce la quota automatica.
- `riferimento_quota` (testo, opzionale): per salvare il mese (es. 'gennaio') o l'evento, in modo da poter cancellare l'entrata in automatico se togliamo la spunta.

> [!WARNING]
> Dovrai eseguire un nuovo script SQL su Supabase per aggiornare la struttura della tabella senza perdere le vecchie spese.

### 2. Automazione Quote Mensili (`QuoteClient.tsx`)
Quando spunti un mese (es. Novembre per "Mario Rossi"):
- L'app segnerà la quota come pagata.
- **In automatico**, creerà un movimento in Cassa di tipo 'ENTRATA' con l'importo standard (es. 15€), categoria "Quota Mensile" (creata in automatico), e nelle note scriverà "Quota Novembre - Mario Rossi".
- Se togli la spunta, il movimento in Cassa verrà **cancellato automaticamente**.

### 3. Automazione Eventi (`UsciteClient.tsx`)
Quando spunti "Pagato" (riscosso) per un evento (es. Uscita Invernale per "Giulia Bianchi"):
- L'app inserirà in automatico in Cassa un'ENTRATA pari all'importo impostato per quell'evento, con la categoria dell'evento (es. "Evento: Uscita Invernale") e nelle note "Pagamento Evento - Giulia Bianchi".
- Se togli la spunta, l'entrata viene rimossa dalla Cassa.

### 4. Gestione Cassa (`CassaClient.tsx`)
- Il form "Nuova Spesa Manuale" diventerà "Nuovo Movimento". Potrai scegliere se inserire un'**Entrata** o un'**Uscita**.
- La tabella della Cassa mostrerà gli importi in **verde (+€)** per le entrate e in **rosso (-€)** per le uscite.
- I saldi in alto verranno calcolati dinamicamente sommando tutte le righe ENTRATA e sottraendo tutte le righe USCITA.

## Open Questions

> [!IMPORTANT]
> 1. Per le Quote Mensili, l'inserimento automatico dell'Entrata in Cassa andrà a finire nei "Contanti" o nella "Banca"? Di default lo metterei su "Contanti". Ti va bene o vuoi poterlo scegliere quando clicchi sulla spunta? (Se mettiamo un menu a tendina per ogni spunta della tabella Quote diventa molto caotico visivamente).
> 2. Per gli Eventi c'è già il campo "Metodo di pagamento" (Contanti/Bonifico) a fianco, quindi posso prendere l'Entrata in cassa da quello. Confermi?
> 3. Sei d'accordo con queste modifiche alla struttura per permettere gli automatismi?
