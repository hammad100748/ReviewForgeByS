# ReviewForge Backend

ReviewForge backend service for securely storing customer credentials, managing Google Play Developer API access, detecting app reviews, generating AI response drafts via DeepSeek, approving/posting replies to Google Play, providing a REST API interface, and managing customer onboarding via the Admin Dashboard and Customer Portal.

---

## 🔒 Security Notice

> [!CAUTION]
> **NEVER COMMIT SENSITIVE CREDENTIALS OR ENVIRONMENT FILES TO GIT.**
>
> The following files contain sensitive secrets and are listed in `.gitignore`:
> - `firebase-service-account.json` (Firebase Admin SDK credentials)
> - `service-account.json` (Google Play Developer API test credentials)
> - `.env` (Environment variables containing `ENCRYPTION_KEY`, `DEEPSEEK_API_KEY`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`)

> [!IMPORTANT]
> **Admin Dashboard Password Protection (HTTP Basic Auth)**:
> The Admin Dashboard endpoints (`/api/admin/*`, `/api/customers/*`, `/api/reviews/*`) are protected by HTTP Basic Auth.
> - Credentials are set via `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.
> - **Deployment Security Note**: This is a temporary, lightweight protection measure designed for a single founder/admin. In production (e.g. Render / Cloud Run), `ADMIN_USERNAME` and `ADMIN_PASSWORD` must be set as real secrets in your deployment dashboard and **NEVER** committed to Git.

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
- `ADMIN_USERNAME`: Admin login username (default: `admin`).
- `ADMIN_PASSWORD`: Admin login password.

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

| Method | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Lightweight health check endpoint (`{ status: "ok" }`) |
| `GET` | `/api/health` | Public | Alias public health check endpoint |
| `GET` | `/api/customers/by-email` | Public | Check if customer email is pre-provisioned in Firestore (`?email=...`) |
| `GET` | `/api/admin/analytics` | HTTP Basic Auth | Founder Analytics (total customers, adoption rates, stale onboarding) |
| `GET` | `/api/customers` | HTTP Basic Auth | Admin: List all active customers *(credentials stripped)* |
| `POST` | `/api/customers/create` | HTTP Basic Auth | Admin: Pre-provision a new customer record |
| `POST` | `/api/customers/:customerId/autopost` | HTTP Basic Auth | Admin: Toggle Auto-Post mode for a customer |
| `GET` | `/api/reviews/pending` | HTTP Basic Auth | Admin: Fetch all pending reviews |
| `POST` | `/api/reviews/:docId/approve` | HTTP Basic Auth | Admin: Approve & post draft reply |
| `POST` | `/api/reviews/:docId/edit-approve` | HTTP Basic Auth | Admin: Edit & post draft reply |
| `POST` | `/api/reviews/:docId/reject` | HTTP Basic Auth | Admin: Reject draft reply |
| `GET` | `/api/customer/me` | Bearer Token | Fetch authenticated customer profile & service account email |
| `POST` | `/api/customer/verify-connection` | Bearer Token | Perform live `reviews.list` check & update status to `"ACTIVE"` |
| `POST` | `/api/customer/autopost` | Bearer Token | Self-serve toggle Auto-Post mode for logged-in customer |
| `GET` | `/api/customer/reviews/pending` | Bearer Token | Fetch pending reviews strictly scoped to logged-in customer |
| `POST` | `/api/customer/reviews/:docId/approve` | Bearer Token | Approve and post reply (with ownership verification) |
| `POST` | `/api/customer/reviews/:docId/edit-approve` | Bearer Token | Edit and post reply (with ownership verification) |
| `POST` | `/api/customer/reviews/:docId/reject` | Bearer Token | Reject review draft (with ownership verification) |

---

## ⚡ Auto-Post Mode Configuration

> [!WARNING]
> **Auto-Post Mode Risk Trade-Off**:
> When **Auto-Post mode** is enabled for a customer (`enabled: true`), AI-generated review replies are posted **immediately directly to Google Play Store** during the detection cycle, bypassing human approval.
>
> **Default Setting**: By default, `autoPostEnabled` is `false` for all customers.

---

## 👥 Customer Management CLI & Admin Dashboard

- **Via Admin Dashboard UI**:
  Launch the frontend dashboard (`cd frontend && npm run dev`) and click the **"+ Add Customer"** button on the Customers tab.
- **Via CLI (Fallback Option)**:
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
