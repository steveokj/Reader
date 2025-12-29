# AGENT_TASKS.md -- Reader v0 (Next.js + FastAPI + SQLite) with Selections, Additions, Audio, Markers, Links

## 0) Objective

Build a web-based reader (starting with sample text) that supports:
- Text selection (drag + touch long-press; and two-point double-click selection)
- A floating action menu shown after selection
- Persisted selections anchored robustly (offsets + quote selector)
- Persisted "Additions" attached to selections (note, audio, grammar, explore)
- Persisted Markers (like/highlight/todo) attachable to selection or addition
- Persisted Links (graph edges) between nodes (selection/addition; topics later)
- Audio recorded in the browser, stored as files on disk, referenced from SQLite

Deliver phase-by-phase, with acceptance tests at each phase.

---

## 1) Repo structure (single repo, quick iteration)

Create this layout:

reader-app/
apps/
web/ # Next.js (App Router)
api/ # FastAPI
packages/
shared/ # shared types (optional, can start empty)
AGENT_TASKS.md
README.md
package.json # root dev scripts for running both
.gitignore

markdown
Copy code

### Root scripts
- `pnpm dev` (or `npm run dev`) runs both web and api concurrently
- `pnpm dev:web` runs Next.js only
- `pnpm dev:api` runs FastAPI only

---

## 2) Tech decisions (locked)

- Frontend: Next.js (App Router), TypeScript
- Backend: FastAPI (Python), Pydantic
- DB: SQLite (file-backed, stored under `apps/api/data/app.db` or similar)
- Audio: stored as files on disk under `apps/api/media/audio/`, referenced by URL in DB
- Selection anchoring: store both:
  - Position selector `{start, end}` in canonical text
  - Quote selector `{exact, prefix, suffix}`

---

## 3) Database schema (SQLite)

Implement migrations (choose one approach):
- Option A: Alembic (recommended if comfortable)
- Option B: Simple `schema.sql` + manual versioning in `/apps/api/migrations/`

### Tables

#### documents
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `title` TEXT NOT NULL
- `source_type` TEXT NOT NULL  -- "sample_text" | "epub" | "article"
- `source_ref` TEXT NULL       -- filepath or url (optional)
- `created_at` TEXT NOT NULL   -- ISO string

#### document_sections
For future EPUB/articles. For sample text, create exactly 1 section.
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `document_id` INTEGER NOT NULL REFERENCES documents(id)
- `section_key` TEXT NOT NULL      -- e.g., "0" for sample, spine index for EPUB
- `title` TEXT NULL
- `content_text` TEXT NOT NULL     -- canonical text used for anchoring
- `created_at` TEXT NOT NULL
UNIQUE(document_id, section_key)

#### selections
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `document_id` INTEGER NOT NULL REFERENCES documents(id)
- `section_id` INTEGER NOT NULL REFERENCES document_sections(id)
- `selector_json` TEXT NOT NULL     -- JSON string: { position:{start,end}, quote:{exact,prefix,suffix} }
- `created_at` TEXT NOT NULL

Add indexes:
- INDEX selections_document_id (document_id)
- INDEX selections_section_id (section_id)

#### additions  (single table with type + payload_json)
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `selection_id` INTEGER NOT NULL REFERENCES selections(id)
- `type` TEXT NOT NULL               -- "note" | "audio" | "grammar" | "explore"
- `title` TEXT NULL                  -- optional, useful for explore threads
- `text_content` TEXT NULL           -- optional, for note text or a quote/bars excerpt
- `payload_json` TEXT NOT NULL        -- JSON string
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Indexes:
- INDEX additions_selection_id (selection_id)
- INDEX additions_type (type)

#### markers
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `target_type` TEXT NOT NULL     -- "document" | "selection" | "addition"
- `target_id` INTEGER NOT NULL
- `kind` TEXT NOT NULL            -- "like" | "highlight" | "todo" | "custom"
- `value` TEXT NULL               -- optional JSON string
- `created_at` TEXT NOT NULL

Indexes:
- INDEX markers_target (target_type, target_id)
- INDEX markers_kind (kind)

#### links
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `from_type` TEXT NOT NULL       -- "selection" | "addition" | "topic"
- `from_id` INTEGER NOT NULL
- `to_type` TEXT NOT NULL
- `to_id` INTEGER NOT NULL
- `relation_type` TEXT NOT NULL   -- "related" | "followup" | "supports" | "contradicts" | etc.
- `label` TEXT NULL
- `created_at` TEXT NOT NULL

Indexes:
- INDEX links_from (from_type, from_id)
- INDEX links_to (to_type, to_id)

---

## 4) Backend (FastAPI) -- files + responsibilities

### Folder layout
apps/api/
main.py
db/
init.py
conn.py # open sqlite connection, row factory, etc.
migrations/ # schema + migration scripts
models/
schemas.py # Pydantic request/response models
services/
documents.py
selections.py
additions.py
markers.py
links.py
media.py # audio save/serve helpers
routes/
documents.py
selections.py
additions.py
markers.py
links.py
media.py
media/
audio/ # stored audio files
data/
app.db

markdown
Copy code

### Static media serving
Mount `/media` to `apps/api/media/` so the frontend can fetch audio by URL.

---

## 5) API contract (v0)

All endpoints return JSON. Use ISO timestamps.

### Health
- `GET /health` -> `{ "ok": true }`

### Documents
- `POST /documents`
  - body: `{ title, source_type, source_ref?, sections: [{section_key, title?, content_text}] }`
  - response: `{ document, sections[] }`

- `GET /documents`
  - response: `{ documents[] }`

- `GET /documents/{id}`
  - response: `{ document, sections[] }`

### Selections
- `POST /selections`
  - body: `{ document_id, section_id, selector: { position:{start,end}, quote:{exact,prefix,suffix} } }`
  - response: `{ selection }`

- `GET /selections?document_id=&section_id=`
  - response: `{ selections[] }`

### Additions
- `POST /additions`
  - body: `{ selection_id, type, title?, text_content?, payload }`
  - response: `{ addition }`

- `PATCH /additions/{id}`
  - body: `{ title?, text_content?, payload? }`
  - response: `{ addition }`

- `GET /additions?selection_id=`
  - response: `{ additions[] }`

### Markers
- `POST /markers`
  - body: `{ target_type, target_id, kind, value? }`
  - response: `{ marker }`

- `GET /markers?target_type=&target_id=`
  - response: `{ markers[] }`

- `DELETE /markers/{id}`
  - response: `{ ok: true }`

### Links
- `POST /links`
  - body: `{ from_type, from_id, to_type, to_id, relation_type, label? }`
  - response: `{ link }`

- `GET /links?node_type=&node_id=`
  - response: `{ links_in[], links_out[] }`

- `DELETE /links/{id}`
  - response: `{ ok: true }`

### Media (Audio)
- `POST /media/audio`
  - multipart: `file` (blob), optional `mime`
  - response: `{ url, mime, size_bytes }`

Optional later:
- `GET /media/audio/{filename}` served by static mount, not a controller.

---

## 6) Frontend (Next.js) -- files + responsibilities

### Folder layout (App Router)
apps/web/
app/
layout.tsx
page.tsx # route to /reader for now or redirect
reader/
page.tsx # main reader page
components/
ReaderDocument.tsx
ActionMenu.tsx
SelectionOverlay.tsx
SidePanel.tsx
modals/
NoteModal.tsx
AudioRecorderModal.tsx
GrammarModalOrMenu.tsx
ExploreModalOrMenu.tsx
lib/
api.ts # typed fetch wrappers
selection/
getSelectionOffsets.ts
buildQuoteSelector.ts
snapSelection.ts # optional: sentence/paragraph snapping rules
rangeFromOffsets.ts # recreate Range for highlighting
types.ts # shared frontend types (mirrors API)

markdown
Copy code

---

## 7) Selection anchoring rules (implementation detail)

### Canonical text
- Always anchor against `document_sections.content_text`.
- For sample text, render `content_text` as plain text with paragraph breaks preserved.

### Offset computation
When the user selects a DOM Range inside the reader container:
- Convert DOM Range -> `{start,end}` offsets in canonical text by walking text nodes in-order.
- Extract:
  - `exact`: selected text
  - `prefix`: up to N chars before selection (e.g., 32-64)
  - `suffix`: up to N chars after selection

### Two selection modes
1) Drag / native selection:
- On pointer/mouse release, if `Selection.toString().trim().length > 0`, finalize selection.

2) Two-point double-click:
- Double-click sets anchor A; second double-click sets anchor B; then build Range between them.
- Optional snapping setting (default: exact offsets).

---

## 8) Action Menu UX contract

### Trigger
Menu appears only when:
- A non-empty selection is finalized AND
- The selection is inside the reader container

### Positioning
- Use `range.getBoundingClientRect()` to position menu near selection.
- If selection spans multiple lines, anchor to the first rect.

### Buttons (right -> left)
- Note
- Audio record
- Grammar (submenu)
- Explore (submenu)
- More (hamburger submenu)

### After action
- Persist selection if it is not persisted yet.
- Persist the created addition.
- Update overlay highlighting and side panel.

---

## 9) Phased execution plan (tasks + acceptance tests)

## Phase 0 -- Scaffold repo and dev workflow
### Tasks
- [ ] Create repo structure under `reader-app/`
- [ ] Initialize Next.js app under `apps/web` (TypeScript)
- [ ] Initialize FastAPI app under `apps/api`
- [ ] Create root `package.json` scripts to run both (concurrently)
- [ ] Configure CORS in FastAPI for `http://localhost:3000`
- [ ] Add `.gitignore` for `node_modules/`, `apps/api/data/`, `apps/api/media/`, `.next/`, etc.
- [ ] Add `GET /health`

### Acceptance tests
- [ ] `pnpm dev` runs Next at `:3000` and API at `:8000`
- [ ] Visiting `/health` returns `{ ok: true }`

---

## Phase 1 -- Documents + Sample Text Reader
### Tasks (Backend)
- [ ] Implement SQLite schema + migration runner
- [ ] Implement `/documents` POST/GET/GET{id}
- [ ] Seed a sample document + section (or create via UI)

### Tasks (Frontend)
- [ ] Create `/reader` page
- [ ] Fetch sample document section content from API
- [ ] Render in `<ReaderDocument />` preserving paragraphs

### Acceptance tests
- [ ] Sample text loads from API and renders in reader page
- [ ] Refresh persists document (not in-memory only)

---

## Phase 2 -- Selection capture + Floating Action Menu
### Tasks (Frontend)
- [ ] Implement selection detection (mouseup/touchend/selectionchange debounce)
- [ ] Implement `getSelectionOffsets()` to compute `{start,end}` for canonical text
- [ ] Implement quote selector builder `{exact,prefix,suffix}`
- [ ] Implement `<ActionMenu />` anchored to selection rect
- [ ] Implement "two-point double-click selection" mode:
  - first double-click stores anchor A
  - second double-click finalizes selection B and builds Range

### Tasks (Backend)
- [ ] Implement `/selections` POST + GET query
- [ ] Store `selector_json`

### Acceptance tests
- [ ] Drag selection triggers menu
- [ ] Two-point double-click triggers menu
- [ ] Persisted selection appears in DB with selector JSON

---

## Phase 3 -- Highlight overlay for persisted selections
### Tasks (Frontend)
- [ ] Fetch selections for section
- [ ] Implement `<SelectionOverlay />` that renders highlights for each selection:
  - Reconstruct Range from offsets (walk text nodes to offsets)
  - Apply highlight spans (or overlay approach)
- [ ] Clicking an existing highlight sets "active selection" in SidePanel

### Acceptance tests
- [ ] Refresh page: persisted selections highlight correctly
- [ ] Click highlight shows it as active (visual + side panel state)

---

## Phase 4 -- Notes (Additions type: note)
### Tasks (Backend)
- [ ] Implement `/additions` POST/GET/PATCH
- [ ] For type `note`, store:
  - `text_content = note text`
  - `payload_json = { text: "..." }`

### Tasks (Frontend)
- [ ] Implement Note modal/editor
- [ ] Save note -> POST /additions
- [ ] Side panel lists additions for active selection

### Acceptance tests
- [ ] Create a note for a selection, refresh, note remains and is listed
- [ ] Edit note, refresh, edited content remains

---

## Phase 5 -- Audio record (Additions type: audio) + Media storage on disk
### Tasks (Backend)
- [ ] Implement `POST /media/audio`:
  - Save file to `apps/api/media/audio/<uuid>.<ext>`
  - Return URL `/media/audio/<filename>`
- [ ] Ensure static mount serves media

### Tasks (Frontend)
- [ ] Implement `AudioRecorderModal`:
  - Use `MediaRecorder` to record
  - On stop, upload blob to `/media/audio`
  - Create addition type `audio` with payload `{ audio: { url, mime, size_bytes } }`
- [ ] Add playback controls in side panel

### Acceptance tests
- [ ] Record audio, save, refresh: playback still works
- [ ] Audio files exist under `apps/api/media/audio/` and are reachable via URL

---

## Phase 6 -- Grammar submenu (Additions type: grammar)
### Tasks (Backend)
- [ ] Accept `type="grammar"` with payload:
  - `{ kind: "word"|"bars"|"structure"|"lookup", text?: "...", lookup_url?: "..." }`
- [ ] Store `text_content` for quick listing when applicable (bars/word)

### Tasks (Frontend)
- [ ] Implement Grammar submenu UI:
  - Word to learn
  - Bars (quote)
  - Sentence structure
  - Lookup meaning (store lookup_url, optionally open a new tab client-side)

### Acceptance tests
- [ ] Each grammar action creates a persisted addition with correct payload
- [ ] Side panel displays grammar items with their kind

---

## Phase 7 -- Explore submenu (Additions type: explore)
### Tasks (Backend)
- [ ] Explore payload format:
  - `{ kind: "thread"|"chatgpt", title?: "...", status?: "open"|"closed", prompt?: "...", response?: "..." }`

### Tasks (Frontend)
- [ ] Implement Explore submenu:
  - "Thread" creates explore addition with status=open
  - "Send to ChatGPT" placeholder:
    - store prompt now (and empty response), or implement later

### Acceptance tests
- [ ] Explore thread persists and can be toggled open/closed via PATCH

---

## Phase 8 -- Markers (reactions)
### Tasks (Backend)
- [ ] Implement `/markers` POST/GET/DELETE
- [ ] Allow target_type = selection/addition/document

### Tasks (Frontend)
- [ ] Add quick marker toggles in side panel:
  - Like, Highlight, Todo
- [ ] Show marker badges on highlights and/or additions list

### Acceptance tests
- [ ] Marker persists across refresh
- [ ] Markers can be removed

---

## Phase 9 -- Linking (graph edges)
### Tasks (Backend)
- [ ] Implement `/links` POST/GET/DELETE

### Tasks (Frontend)
- [ ] Provide "Link to..." action from an addition:
  - Shows a searchable list of:
    - additions in same document
    - selections in same section
  - Creates a link edge
- [ ] Render inbound/outbound links in side panel

### Acceptance tests
- [ ] Create link between two additions, refresh: link remains
- [ ] Create link between selection and addition, refresh: link remains

---

## Phase 10 -- "More" actions placeholders
Implement as stubs that create additions of type `explore` or `grammar` (or open external tools) without blocking core functionality.

### Tasks (Frontend)
- [ ] "Open Google Maps for location":
  - For v0: open a new tab with a query using selected text
- [ ] "Search image related":
  - For v0: open a new tab search query using selected text
- [ ] "Visualize description":
  - For v0: create an explore addition with kind=thread and title "Visualize: ..."

### Acceptance tests
- [ ] Each action is reachable and does not crash selection flow

---

## 10) Definitions of Done (global)

- [ ] Can create and persist selections reliably in a sample document section
- [ ] Floating action menu appears for both selection modes
- [ ] Can attach at least:
  - [ ] note
  - [ ] audio
  - [ ] grammar item
  - [ ] explore thread
- [ ] Can add markers to selections and additions
- [ ] Can link additions to additions (and selection to addition)
- [ ] Page refresh restores:
  - highlights
  - side panel data
  - audio playback

---

## 11) Manual QA script (repeatable)

1. Create sample doc if not present.
2. Drag-select a sentence -> create Note -> save.
3. Refresh -> confirm highlight + note exist.
4. Double-click two-point selection -> create Grammar "bars".
5. Refresh -> confirm grammar item exists.
6. Drag-select -> record 3-5 seconds -> save.
7. Refresh -> play audio.
8. Add marker "like" to audio addition.
9. Create link between note and audio addition.
10. Refresh -> confirm markers and links remain.

---

## 12) Optional future tasks (not required for v0)

- Topics table + linking topics to additions
- Full-text search across `documents_sections.content_text` + `additions.text_content`
- EPUB import pipeline:
  - upload epub -> parse -> store sections
- Article ingestion:
  - import html -> extract readable content -> store section
- Selection resilience:
  - re-anchor by quote selector if offsets drift
- Multi-user auth (out of scope for v0)
