# ScoutMaster PaddleOCR service

Servizio OCR privato per scontrini, separato dall'app Next.js perché Vercel non
può eseguire PaddleOCR/Python in una funzione serverless.

## Avvio locale

```bash
docker build -t scoutmaster-paddleocr services/paddle-ocr
docker run --rm -p 8000:8000 \
  -e OCR_SERVICE_TOKEN=change-me \
  scoutmaster-paddleocr
```

Al primo avvio PaddleOCR scarica i modelli ufficiali. Verifica il servizio con:

```bash
curl http://localhost:8000/health
```

## Configurazione dell'app

Impostare su Vercel:

- `PADDLE_OCR_URL=https://ocr.example.org`
- `PADDLE_OCR_TOKEN=` lo stesso valore di `OCR_SERVICE_TOKEN`

Il servizio va pubblicato dietro HTTPS. Non esporlo senza token: gli scontrini
possono contenere dati fiscali e informazioni sui pagamenti.

## Endpoint

`POST /v1/receipts/parse` accetta multipart/form-data:

- `file`: JPEG, PNG o WebP, massimo 5 MB;
- `categories`: array JSON con le categorie configurate nell'app;
- header `X-OCR-Token`, se il token è configurato.

La risposta include campi proposti e testo grezzo. L'utente deve sempre
controllare importo e data prima del salvataggio.
