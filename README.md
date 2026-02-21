# Pay It Forward — Stalin Tree Experiment

A pay-it-forward community website. One person requests help. A helper picks them (plus 2 others) and helps all three. Each helped person eventually helps 3 more. The tree grows.

**Live URL** (after deploy): `https://<your-username>.github.io/payitforward/`

---

## Stack

| Layer    | Tech                                    |
|----------|-----------------------------------------|
| Frontend | Vite + React 18 + TypeScript            |
| Graph    | React Flow + Dagre auto-layout          |
| Routing  | React Router v6 (HashRouter)            |
| Backend  | Google Apps Script Web App              |
| Database | Google Sheets (two sheets)              |
| Hosting  | GitHub Pages (via GitHub Actions)       |

---

## Project Structure

```
payitforward/
├── .github/workflows/deploy.yml  ← CI/CD to GitHub Pages
├── apps-script/Code.gs           ← Backend (paste into Apps Script)
├── src/
│   ├── api/client.ts             ← fetch wrappers
│   ├── types/index.ts            ← shared TypeScript types
│   ├── components/Layout.tsx     ← nav shell
│   └── pages/
│       ├── Home.tsx              ← stats + intro
│       ├── RequestHelp.tsx       ← request form
│       ├── HelpPeople.tsx        ← helper form (pick 3)
│       └── Tree.tsx              ← React Flow graph
├── .env.example
├── index.html
├── package.json
└── vite.config.ts
```

---

## Part 1 — Backend Setup (Google Apps Script)

### 1. Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Note the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

### 2. Open Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**.
2. Delete any existing code in `Code.gs`.
3. Paste the contents of `apps-script/Code.gs` from this repo.
4. Replace `YOUR_SPREADSHEET_ID_HERE` with your actual spreadsheet ID.
5. Click **Save** (💾).

### 3. Create Sheet Headers

1. In Apps Script, select the `setupSheets` function from the dropdown.
2. Click **Run** ▶️.
3. Accept any permissions prompts.
4. Check your spreadsheet — you should now have "Requests" and "Acts" sheets with headers.

### 4. Deploy as Web App

1. Click **Deploy → New Deployment**.
2. Click ⚙️ next to "Select type" → choose **Web app**.
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

> **Every time you edit Code.gs**, you must create a **New Deployment** (not "Manage deployments → edit") for changes to take effect.

---

## Part 2 — Frontend Setup

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/payitforward.git
cd payitforward
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_API_BASE_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

### 3. Run locally

```bash
npm run dev
```

Open `http://localhost:5173/payitforward/`

### 4. Build

```bash
npm run build
```

Output goes to `dist/`.

---

## Part 3 — Deploy to GitHub Pages

### Option A — GitHub Actions (recommended)

1. Push this repo to GitHub.
2. Add a repository secret:
   - **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VITE_API_BASE_URL`
   - Value: your Apps Script URL
3. Enable GitHub Pages:
   - **Settings → Pages → Source → GitHub Actions**
4. Push to `main` — the workflow auto-builds and deploys.

### Option B — Manual

```bash
npm run build
# Then push the dist/ folder to your gh-pages branch
```

---

## Changing the Repo Name

If your GitHub repo is NOT named `payitforward`, update:

- `vite.config.ts` → `base: '/your-repo-name/'`

---

## Data Model

### Requests sheet

| Column              | Type    | Private? |
|---------------------|---------|----------|
| `request_id`        | string  | no       |
| `display_name`      | string  | no       |
| `contact_private`   | string  | **yes**  |
| `category`          | string  | no       |
| `description_public`| string  | no       |
| `amount_requested`  | number  | no       |
| `status`            | string  | no       |
| `created_at`        | ISO     | no       |

### Acts sheet

| Column                   | Type   | Private? |
|--------------------------|--------|----------|
| `act_id`                 | string | no       |
| `helper_name`            | string | no       |
| `helper_contact_private` | string | **yes**  |
| `request_id`             | string | no       |
| `help_type`              | string | no       |
| `amount`                 | number | no       |
| `public_story`           | string | no       |
| `created_at`             | ISO    | no       |

---

## API Endpoints

All endpoints are served from the Apps Script Web App URL.

### `GET ?action=data`
Returns all public requests and acts (private columns stripped).

```json
{
  "requests": [{ "request_id": "req_...", "display_name": "Alex", ... }],
  "acts":     [{ "act_id": "act_...", "helper_name": "Jordan", ... }]
}
```

### `POST ?action=request`
Body (JSON, `Content-Type: text/plain`):
```json
{
  "display_name": "Alex M.",
  "contact_private": "alex@example.com",
  "category": "Financial",
  "description_public": "Need help with rent.",
  "amount_requested": 200,
  "website": ""
}
```
`website` is the honeypot field — must be empty from real users.

### `POST ?action=act`
Body:
```json
{
  "helper_name": "Jordan K.",
  "helper_contact_private": "jordan@example.com",
  "website": "",
  "selections": [
    { "request_id": "req_...", "help_type": "Financial", "amount": 50, "public_story": "Sent $50 via Venmo." },
    { "request_id": "req_...", "help_type": "Time / Labor", "amount": 0, "public_story": "Helped move furniture." },
    { "request_id": "req_...", "help_type": "Emotional Support", "amount": 0, "public_story": "Long chat, felt heard." }
  ]
}
```

---

## Spam Protection

1. **Honeypot field** — a hidden `website` input in each form. Real users never fill it; bots usually do. If non-empty, the backend returns a fake success and discards the data.
2. **Global rate limit** — Apps Script `CacheService` counts writes per 60-second window (default: 30). Exceeding this returns HTTP 429 in the JSON body.

> Note: Google Apps Script Web Apps do not expose the client's IP address, so true per-IP rate limiting is not possible without a reverse proxy.

---

## License

MIT
