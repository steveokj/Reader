# Reader

## Setup

### Backend (FastAPI)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r apps/api/requirements.txt
```

### Frontend (Next.js)

```powershell
npm --prefix apps/web install
```

### Run both

```powershell
npm install
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:8000/health
