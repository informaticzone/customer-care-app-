# Deploy su GitHub Pages (Opzione 2)

Questa app è una PWA statica (solo frontend). Per pubblicarla “ovunque” senza tenere acceso il PC, il modo più semplice è GitHub Pages.

> Nota dati: ogni dispositivo salva i dati localmente nel browser. Nessuna sincronizzazione automatica.

## 1) Crea un repository GitHub

- Crea un nuovo repo, ad esempio `customer-care-app`
- Carica **tutto il contenuto** della cartella `customer-care-app/` (questa)

## 2) Imposta la base path

Su GitHub Pages l’app vive sotto un sottopercorso:

- `https://<utente-o-org>.github.io/customer-care-app/`

Per questo la build deve usare `VITE_BASE=/customer-care-app/`.

## 3) Build + deploy (manuale)

1) Build:

```powershell
cd "c:\Users\virgi\OneDrive\AA DOCUMENTI GRUPPO IMBALLAGGI FRANCESCA\customer-care-app"
$env:VITE_BASE="/customer-care-app/"
& "C:\Program Files\nodejs\node.exe" ".\node_modules\vite\bin\vite.js" build
```

2) Pubblica la cartella `dist/` come contenuto di Pages.

### Variante A (consigliata): workflow automatico

Se abiliti GitHub Pages da Actions, la pipeline (workflow) fa build e deploy ad ogni push.

Vedi file: `.github/workflows/deploy-pages.yml`

## 4) Abilita GitHub Pages

Nel repo su GitHub:

- Settings → Pages
- Build and deployment → Source: **GitHub Actions**

Dopo il primo deploy, GitHub mostrerà l’URL pubblico.

## 5) Aggiornare

- Modifichi i file
- Fai push
- Pages si aggiorna.

## Note PWA

- Essendo PWA, il service worker può tenere in cache. Se vedi una versione vecchia:
  - Usa il pulsante “Ricarica”
  - Oppure disinstalla e reinstalla la PWA
  - Oppure pulisci dati del sito dal browser.
