# New ERP System

A full-featured Enterprise Resource Planning (ERP) system for business management, built with modern web technologies.

## Features

- **Accounting** — Manage chart of accounts, journal entries, and financial transactions
- **Invoicing** — Create, send, and track customer invoices
- **Inventory** — Track stock levels, product catalogs, and warehouse movements
- **Purchasing** — Manage purchase orders, suppliers, and procurement workflows
- **Reporting** — Generate financial and operational reports
- **Users** — Role-based access control and user management

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS v4 |
| Validation | Zod |
| Database | SQLite via sql.js (in-browser WASM) |
| Icons | Lucide React |
| Testing | Vitest, Testing Library |

## Getting Started

### Prerequisites

- Node.js 20+ and npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd "NEW ERP"

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Architecture

The application follows a layered architecture:

```
Pages (Next.js Routes)
    ↓
API Layer (Route Handlers)
    ↓
Services (Business Logic)
    ↓
Repositories (Data Access)
    ↓
Database (SQLite via sql.js)
```

Each layer depends only on the layer below it, keeping concerns separated and testable.

## Modules

| Module | Description |
|--------|-------------|
| Accounting | Chart of accounts, journal entries, and financial period management |
| Invoicing | Customer invoices, payment tracking, and receivables |
| Inventory | Products, stock levels, and inventory adjustments |
| Purchasing | Purchase orders, supplier management, and goods receipt |
| Reporting | Financial statements, sales reports, and custom report generation |
| Users | Authentication, authorization, and role-based permissions |

## API Conventions

All API responses follow a consistent format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

## Default Login

After initial setup, use the following credentials to sign in:

| Field | Value |
|-------|-------|
| Email | admin@erp.local |
| Password | admin123 |

> **Important:** Change the default password immediately after first login.

## Database

This project uses SQLite via [sql.js](https://github.com/sql-js/sql.js), which runs entirely in the browser using WebAssembly (WASM). No separate database server is required — all data is persisted client-side.

## Contributing

1. Fork the repository and create a feature branch from `main`
2. Follow existing code conventions and style
3. Write tests for new functionality using Vitest
4. Ensure `npm run lint` passes before submitting
5. Submit a pull request with a clear description of changes

## License

Private — All rights reserved.
