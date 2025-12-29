# Customer Care – Mini‑CRM installabile (PWA)

Questa è una mini web‑app **installabile** (PWA) pensata per Customer Care / Commerciale.
Funziona **senza backend**: i dati restano **in locale** sul dispositivo (offline‑first).

> Nell’app resta disponibile anche un “Import Excel (legacy)” utile come import iniziale o preview, ma **non** è il database principale.

## Funzioni principali

- **Utenti** (standard / admin) con dati separati per utente
- **Admin**: gestione utenti + “Operare come (dataset)” per vedere/modificare i dati di altri utenti
- **Clienti**: CRUD + ricerca
- **Appuntamenti**: CRUD + filtri (futuri/passati)
- **Interazioni**: registro interazioni per cliente + ricerca
- **Insight**: indicatori derivati dalle interazioni (ultimo contatto, frequenza, giorno/fascia tipici, interesse top, caldo/tiepido/freddo)
- **Backup/Ripristino** JSON per portare i dati da un dispositivo a un altro
- **Invia backup**: su smartphone usa la condivisione (mail/WhatsApp/Drive) con allegato quando supportato

## Avvio (Windows / PowerShell)

Prerequisito: Node.js (LTS).

Se `npm`/`node` non sono nel PATH (classico su alcune postazioni), usa i binari espliciti.

### Opzione A (standard)

```powershell
npm install
npm run dev
```

### Opzione B (se node non è nel PATH)

```powershell
cd "c:\Users\virgi\OneDrive\AA DOCUMENTI GRUPPO IMBALLAGGI FRANCESCA\customer-care-app"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\node.exe" ".\node_modules\vite\bin\vite.js" dev
```

## Installazione come app

- Apri l’app in **Microsoft Edge** o **Google Chrome**
- Premi **Installa** (o usa il menu del browser → *Installa app*)

## Pubblicazione via link (Metodo A)

L’idea è pubblicare la cartella `dist/` su un posto raggiungibile con HTTP/HTTPS (intranet, SharePoint, IIS, un hosting statico).

1) Genera la build:

```powershell
cd "c:\Users\virgi\OneDrive\AA DOCUMENTI GRUPPO IMBALLAGGI FRANCESCA\customer-care-app"
& "C:\Program Files\nodejs\node.exe" ".\node_modules\vite\bin\vite.js" build
```

### GitHub Pages (repo: customer-care-app-)

Su GitHub Pages l'app vive sotto il sottopercorso ` /customer-care-app-/ `.
La build deve quindi usare `VITE_BASE=/customer-care-app-/`.

Se su Windows `node` non è nel PATH, puoi usare lo script:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run build:pages:win
```

2) Prendi la cartella `dist/` e pubblicala.

Note importanti per la PWA:

- La PWA (service worker) **cacha** gli asset. Se pubblichi una versione nuova e un dispositivo continua a vedere la vecchia, in genere basta:
	- aprire l’app → “Ricarica”
	- oppure dal browser: svuotare dati sito / aggiornare hard‑reload.
- Senza backend **non esiste sincronizzazione** tra telefoni/PC diversi: per spostare i dati usa **Backup/Ripristino** (o “Invia backup”).

## Note

- I dati sono in `localStorage` del browser. Se l’utente cancella i dati del sito, li perde: usa Backup.
- Se il dataset cresce molto, si può migrare a IndexedDB (più robusto) mantenendo compatibilità di backup.

