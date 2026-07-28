# ReviewForge Frontend Dashboard

Internal React single-page application (SPA) for ReviewForge administrators to review pending AI-generated app review replies, edit/approve replies, reject drafts, and toggle customer Auto-Post settings.

---

## 🚀 Running Locally

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Vite Development Server
```bash
npm run dev
```
The dashboard will open at **`http://localhost:5173`**.

---

## 🔌 Backend Connectivity & CORS

The dashboard connects to the ReviewForge backend REST API at:
```
http://localhost:3001/api
```

> **Note**: Make sure the ReviewForge backend server is running (`npm start` in the project root directory) on port `3001` before using the dashboard. CORS is pre-configured on the backend to allow requests from any local origin during development.

---

## 🛠 Features

- **Pending Review Approvals**:
  - Displays pending review cards with author, visual star rating (`★★★★☆`), review text, and AI draft reply in an editable box.
  - **Approve & Post**: Posts draft reply as-is to Google Play Store.
  - **Save Edit & Post**: Updates reply text and posts immediately to Google Play Store.
  - **Reject**: Rejects draft and removes it from the pending approval queue.
- **Customer Auto-Post Configuration**:
  - Displays active customers and an interactive toggle switch for enabling/disabling Auto-Post mode (`POST /api/customers/:id/autopost`).
