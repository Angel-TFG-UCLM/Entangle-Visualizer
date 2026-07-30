# Entangle offline preservation

The preservation build is a separate runtime mode. It does not remove or replace the Azure deployment.

## What is preserved

- July 2026 public dashboard snapshot: 1,565 repositories, 27,061 contributors, and 439 organizations.
- A compact real collaboration subgraph with 300 nodes, 1,708 links, and matching network metrics.
- A lazy filter/search index covering 1,131 repositories, 25,485 users, 678 organizations, 40 languages, and six disciplines.
- Dashboard filters, entity search, favorites, custom views, import/export, collaboration analysis, temporal controls, analytical lenses, and quantum tunneling.
- Deterministic streamed AI responses for dashboard, data, Universe, knowledge, and preserved-research scenarios.
- A local administration replay with progress, logs, history, and database statistics.
- The historical deployed-system video in `public/media/entangle-demo-web.mp4`.
- The signed 214-page Bachelor's Thesis in `public/media/entangle-tfg-memoria.pdf`, linked from the historical-video panel and the shared application footer.

The full source snapshots are intentionally outside Git:

```text
<preservation-workspace>\artifacts\private-backups\entangle
```

## Run locally

```powershell
npm ci
npm run build:offline
npm run preview
```

For development:

```powershell
npm run dev -- --mode offline
```

## Refresh the public snapshot

Capture the three public API responses and rebuild the compact artifact:

```powershell
node scripts\build-offline-snapshot.mjs `
  --dashboard <dashboard-stats.json> `
  --collaboration <collaboration-discover.json> `
  --network <network-metrics.json> `
  --out src\offline\generatedSnapshot.json
```

The builder removes private credential-like fields and organization email addresses. Review the generated diff before publishing.

## Modes

| Mode | Selection |
|---|---|
| Azure/local backend | `VITE_API_URL` is set and `VITE_OFFLINE_MODE` is not `true` |
| Explicit preservation | `VITE_OFFLINE_MODE=true` |
| Automatic preservation | The configured backend fails its startup health checks |

GitHub Pages uses explicit preservation mode. The existing Azure Static Web Apps workflow remains unchanged.
