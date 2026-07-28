# ReviewForge Backend

ReviewForge backend service for securely storing customer credentials, managing Google Play Developer API access, detecting app reviews, generating AI response drafts via DeepSeek, approving/posting replies to Google Play, and providing a REST API interface.

---

## 🔒 Security Notice

> [!CAUTION]
> **NEVER COMMIT SENSITIVE CREDENTIALS OR ENVIRONMENT FILES TO GIT.**
>
> The following files contain sensitive secrets and are listed in `.gitignore`:
> - `firebase-service-account.json` (Firebase Admin SDK credentials)
> - `service-account.json` (Google Play Developer API test credentials)
> - `.env` (Environment variables containing `ENCRYPTION_KEY` and `DEEPSEEK_API_KEY`)

---

## 🚀 Setup & Environment Configuration

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set the required environment variables in `.env`:
- `PORT`: Server port (default: `3001`).
- `ENCRYPTION_KEY`: A 32-byte hex-encoded key. Generate using:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `DEEPSEEK_API_KEY`: Your DeepSeek AI API key.

### 3. Firebase Admin SDK Setup
Place your Firebase Admin SDK credential file in the project root named:
```
firebase-service-account.json
```

---

## 🌐 REST API Endpoints & Server

Start the combined Express REST API server and `node-cron` background scheduler:

```bash
npm start
# or
node src/index.js
```

The server runs on `http://localhost:3001` (or your configured `PORT`) with CORS enabled.

### API Endpoint Summary

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reviews/pending` | Fetch all reviews pending human approval | *None* |
| `POST` | `/api/reviews/:docId/approve` | Approve and post current AI draft reply to Google Play as-is | *None* |
| `POST` | `/api/reviews/:docId/edit-approve` | Overwrite draft reply text and post immediately to Google Play | `{ "newText": "..." }` |
| `POST` | `/api/reviews/:docId/reject` | Mark review draft status as `"rejected"` | *None* |
| `GET` | `/api/customers` | List all active customers *(credentials stripped for security)* | *None* |
| `POST` | `/api/customers/:customerId/autopost` | Toggle Auto-Post mode for a customer | `{ "enabled": true/false }` |

### JSON Response Format

- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```

- **Error Response (`400 Bad Request` / `404 Not Found` / `500 Internal Server Error`)**:
  ```json
  {
    "success": false,
    "error": "Error description message"
  }
  ```

---

## ⚡ Auto-Post Mode Configuration

> [!WARNING]
> **Auto-Post Mode Risk Trade-Off**:
> When **Auto-Post mode** is enabled for a customer (`enabled: true`), AI-generated review replies are posted **immediately directly to Google Play Store** during the detection cycle, bypassing human approval.
>
> **Default Setting**: By default, `autoPostEnabled` is `false` for all customers.

### Toggling Auto-Post Mode via CLI or API
- **Via CLI**:
  ```bash
  npm run toggle-autopost
  ```
- **Via REST API**:
  ```bash
  curl -X POST http://localhost:3001/api/customers/CUSTOMER_ID/autopost \
    -H "Content-Type: application/json" \
    -d '{"enabled": true}'
  ```

---

## 👥 Customer Management CLI

```bash
npm run add-customer
# or
node scripts/add-customer.js
```

---

## 🤖 Manual Review Detection Trigger

```bash
npm run run-detection
# or
node scripts/run-detection.js
```

---

## 💬 Human Approval CLI

```bash
npm run approve-review
# or
node scripts/approve-review.js
```

---

## 🧪 Proof-of-Concept Test Scripts

### Test Google Play Developer API Connection (`reviews.list`)
```bash
node test-connection.js
```

### Test Google Play Developer API Reply (`reviews.reply`)
```bash
node test-reply.js
```
