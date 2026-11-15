# Livinkey Admin Console

Static, framework-free admin web app (HTML + Bootstrap + vanilla JS) for managing PGs, rooms, tenants, billing and payments, documents, maintenance, notices, meter readings and audit logs. It talks to the [Livinkey backend](../backend/README.md).

## Running locally

Any static file server works:

```bash
cd frontend
npx serve .          # or: python3 -m http.server 8080
```

Set the API address in `assets/js/api.js` (`API_CONFIG.baseURL`). The default points to the production API. The `CNAME` file is used for static hosting on a custom domain.

## Structure

```
frontend/
├── *.html                 # one page per module (dashboard, tenants, bills, …)
└── assets/
    ├── css/style.css      # design system
    └── js/
        ├── api.js         # API client + shared date/currency formatting
        ├── auth.js        # session handling and permissions
        ├── layout.js      # sidebar/topbar, page loaders
        ├── ui.js          # shared UI kit (LKUI: tables, dialogs, toasts)
        └── pages/         # page logic, one file per module
```

## Conventions

- **Dates** are displayed as `dd/mm/yyyy` everywhere (`formatDate`, `formatDateTime`). Date pickers follow the browser's locale; stored values are always ISO (`yyyy-mm-dd`). Use `lkLocalISO(date)` instead of `toISOString()` when you need a local date string.
- **Number inputs** never change on mouse-wheel/trackpad scroll (global guard in `ui.js`).
- **Tables** are enhanced with `LKUI.table()` (search, sort, paging, CSV export).
- **Permissions** are enforced by the API; the UI only hides what a role cannot use.
