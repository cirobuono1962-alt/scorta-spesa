# Scorta — Spesa & Prezzi

App PWA per archiviare i prodotti di casa con i prezzi nei vari supermercati,
scansionare i codici a barre, confrontare i prezzi e generare la lista della
spesa in PDF divisa per supermercato.

## 1. Crea il progetto Firebase (5 minuti)

1. Vai su **console.firebase.google.com** → "Aggiungi progetto" → dagli un nome (es. `scorta-spesa`).
2. Nel menu a sinistra apri **Build → Firestore Database** → "Crea database" → scegli una
   località vicina (es. `eur3 (europe-west)`) → modalità **produzione**.
3. Nel menu a sinistra apri **Build → Authentication** → scheda "Sign-in method" →
   attiva il provider **Anonimo**. Serve solo a proteggere i tuoi dati, non dovrai
   fare login manualmente: l'app si autentica da sola in background.
4. Nel menu a sinistra vai su **Impostazioni progetto** (icona ingranaggio) → scorri
   fino a "Le tue app" → clicca l'icona **`</>`** (web) → dai un nome all'app →
   Firebase ti mostra un blocco `firebaseConfig = {...}`: copialo.
5. Apri il file **`index.html`**, cerca `window.__FIREBASE_CONFIG__` verso il fondo
   del file e incolla i tuoi valori al posto di `INSERISCI_...`.
6. Nella scheda **Firestore Database → Regole**, incolla il contenuto del file
   `firestore.rules` incluso in questo pacchetto e pubblica.

## 2. Pubblica su Netlify

**Opzione più semplice (drag & drop):**
1. Vai su **app.netlify.com** → "Add new site" → "Deploy manually"
2. Trascina l'intera cartella di questo progetto nella finestra di Netlify
3. Netlify ti darà un indirizzo tipo `https://nome-a-caso.netlify.app` — funziona subito

**Opzione con GitHub (aggiornamenti futuri più comodi):**
1. Crea un repository GitHub con questi file
2. Su Netlify: "Add new site" → "Import an existing project" → collega il repo
3. Non serve build command: lascia i campi vuoti, la cartella di pubblicazione è la radice (`/`)

Netlify fornisce automaticamente HTTPS, necessario per far funzionare la fotocamera
per la scansione dei codici a barre.

## 3. Aggiungi l'app alla schermata Home (iPhone)

Apri il link Netlify da Safari → tasto Condividi → "Aggiungi alla schermata Home".
Da quel momento si apre come un'app vera, a schermo intero.

## Come si usa

- **Prodotti**: tocca **+** per aggiungere un prodotto (nome, categoria, unità di
  misura); puoi scansionare il codice a barre col tasto 📷 accanto al campo, oppure
  tieni premuto il tasto **+** per aprire subito la fotocamera.
- Tocca un prodotto per aprire la sua scheda: lì aggiungi/aggiorni il prezzo per
  ogni supermercato (viene sempre salvato l'ultimo prezzo inserito per quel negozio).
- **Confronto**: tabella con tutti i prodotti e i prezzi per supermercato, con il
  prezzo più conveniente evidenziato in verde.
- **Lista spesa**: seleziona la casella accanto ai prodotti da comprare e imposta
  la quantità. Il riepilogo calcola automaticamente in quale supermercato conviene
  comprare ogni cosa. Il tasto **"Genera PDF per supermercato"** crea un PDF con
  una pagina per ciascun supermercato: prodotti, quantità, prezzo unitario e totale.

## File del progetto

- `index.html` — struttura e stile dell'app
- `app.js` — logica (Firebase, scanner, PDF)
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — resi installabile come PWA
- `firestore.rules` — regole di sicurezza da incollare nella console Firebase

## Note

- I dati sono privati: solo chi apre l'app dal tuo link/dispositivo con
  l'autenticazione anonima attiva può leggerli e scriverli. Se vuoi un login vero
  (email/password) per maggiore sicurezza, dimmelo e aggiungo lo schermo di accesso.
- La scansione barcode funziona nei browser mobili moderni (Safari iOS, Chrome
  Android) solo su connessione HTTPS — Netlify la fornisce automaticamente.
