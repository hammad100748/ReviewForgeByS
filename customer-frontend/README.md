# ReviewForge Customer Portal Frontend

Customer-facing authentication and onboarding web application for ReviewForge, matching the visual identity of `reviewforge-landing.html`.

---

## 🚀 Running Locally

### 1. Install Dependencies
```bash
cd customer-frontend
npm install
```

### 2. Configure Firebase Environment Variables (Optional)
Copy `.env.example` to `.env` or set in your environment:
```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
```

### 3. Start Vite Development Server
```bash
npm run dev
```
The customer portal will open at **`http://localhost:5174`**.

---

## 🎨 Design System Tokens

Extracted directly from `reviewforge-landing.html`:
- **Background**: `#1c1a17` (`--bg`)
- **Panel / Card**: `#262319` (`--bg-panel`)
- **Input / Secondary Panel**: `#2d2a1f` (`--bg-panel-2`)
- **Borders / Lines**: `#423d2f` (`--line`)
- **Primary Text**: `#f2ece0` (`--text`)
- **Muted Text**: `#ab9f88` (`--text-muted`)
- **Gold Accent / CTA**: `#e8a93b` (`--gold`)
- **Mint Green Accent**: `#5fcb9b` (`--mint`)
- **Rust Red Error Accent**: `#a8442b` (`--rust`)
- **Typography**: `Fraunces` (serif headings), `Inter` (sans-serif body), `IBM Plex Mono` (monospace micro labels)
