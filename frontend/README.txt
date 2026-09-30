PRAMAAN Frontend Architecture
==============================
Modular, maintainable ES6 application with zero build step requirement.

Directory Structure:
--------------------
frontend/
├── index.html                           - Default web server entry point
├── PRAMAAN_Field_Test_Companion.html    - Companion web entry point
├── PRAMAAN Logo.png                     - Official emblem branding
├── css/
│   ├── base.css                         - CSS variables, reset, typography & structural layout
│   ├── components.css                   - Reusable cards, buttons, badges, pills, form fields
│   ├── views.css                        - View layouts (login chakra, camera viewfinder, modal sheet)
│   └── styles.css                       - Unified CSS bundle
└── js/
    ├── config.js                        - Constants, API endpoints, DISCLAIMER, TEST_TYPES
    ├── icons.js                         - SVG icon dictionary & ic() renderer
    ├── utils.js                         - Helpers (esc, sha256, formatters, download, sampleImage)
    ├── db.js                            - IndexedDB persistence layer & offline demo seed
    ├── crypto.js                        - WebCrypto ECDSA P-256 signing & SHA-256 tamper verification
    ├── state.js                         - Reactive application state (S) & session management
    ├── api.js                           - REST client for FastAPI backend (auth, analyze, CRUD, verify)
    ├── router.js                        - Client-side hash router with auth guards & deep links
    ├── views/
    │   ├── topbar.js                    - Navigation topbar & live online/API health indicators
    │   ├── login.js                     - Officer & supervisor login view
    │   ├── home.js                      - Home landing & recent test quick links
    │   ├── new-test.js                  - Dual-zone viewfinder camera, color analysis & record saving
    │   ├── dashboard.js                 - Supervisor stats, team performance & chain health
    │   ├── verify.js                    - Multi-mode cryptographic verification (file, QR, JSON)
    │   ├── log.js                       - Searchable test history with multi-faceted filtering
    │   ├── detail-modal.js              - Comprehensive record inspection sheet & verification
    │   └── report.js                    - Formatted printable official field test report
    └── app.js                           - Main entry point, event delegation & boot orchestration

Running:
--------
1. Start backend:
   cd backend
   uvicorn app.main:app --reload --port 8000

2. Start frontend:
   cd frontend
   python -m http.server 5173

3. Open:
   http://localhost:5173/ or http://localhost:8000/

Prototype Logins:
-----------------
Field Officer: NCB/FO/2026/001 / 123456
Supervisor:    NCB/SUP/2026/001 / 654321
Demo Button:   DEMO / 000000
