# 🚀 Guía de Despliegue - Frontend

## Arquitectura

El frontend se despliega en **Azure Static Web Apps**, un servicio optimizado para aplicaciones SPA (React, Vue, Angular).

```
┌──────────────────────────────────────────────────────────────┐
│                    Azure Static Web Apps                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │   entangle-frontend.azurestaticapps.net                  │ │
│  │                                                           │ │
│  │   ├── index.html                                         │ │
│  │   ├── assets/                                            │ │
│  │   │   ├── index-[hash].js                               │ │
│  │   │   └── index-[hash].css                              │ │
│  │   └── (SPA routing via staticwebapp.config.json)        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                                 │
│                              │ API Calls (CORS)               │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │   Backend (Azure Container Apps)                         │ │
│  │   ca-xxx-api.azurecontainerapps.io/api/v1               │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Despliegue Automático

### 1. Crear Static Web App

1. Ve a [Azure Portal](https://portal.azure.com)
2. **Create a Resource** → **Static Web App**
3. Configura:
   - **Name**: `entangle-frontend`
   - **Region**: `West Europe` o similar
   - **Source**: GitHub
   - **Organization**: Tu organización
   - **Repository**: `Frontend`
   - **Branch**: `main`
   
4. Build Details:
   - **Build Preset**: `Vite`
   - **App location**: `/`
   - **Output location**: `dist`

5. Click **Review + Create**

### 2. Configurar Variables en GitHub

Ve a tu repositorio > **Settings** > **Secrets and variables** > **Actions**

#### Variables (vars):
| Nombre | Valor | Descripción |
|--------|-------|-------------|
| `VITE_API_URL` | `https://ca-xxx.azurecontainerapps.io/api/v1` | URL del backend |

#### Secrets:
| Nombre | Descripción |
|--------|-------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Token generado automáticamente por Azure |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_STAGING` | Token para entorno staging (opcional) |

### 3. Flujo de Trabajo

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Push to    │────▶│   Build &   │────▶│  Deploy to  │
│  develop    │     │   Test      │     │  Staging    │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Push to    │────▶│   Build &   │────▶│  Deploy to  │
│  main       │     │   Test      │     │  Production │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Open PR    │────▶│   Build &   │────▶│  Deploy     │
│  to main    │     │   Test      │     │  Preview    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Desarrollo con hot-reload
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview
```

## Variables de Entorno

| Archivo | Uso |
|---------|-----|
| `.env.development` | `npm run dev` - desarrollo local |
| `.env.production` | `npm run build` - build de producción |
| `.env.local` | Sobreescribe cualquier variable (no se commitea) |

### Configurar Backend Local

```bash
# .env.local (crear este archivo)
VITE_API_URL=http://localhost:8000/api/v1
VITE_DEBUG=true
```

### Configurar Backend en Azure

La URL se pasa desde GitHub Actions durante el build:

```yaml
- name: Build
  run: npm run build
  env:
    VITE_API_URL: ${{ vars.VITE_API_URL }}
```

## Configuración del SPA

El archivo `staticwebapp.config.json` configura:

- **Routing SPA**: Todas las rutas redirigen a `index.html`
- **Headers de seguridad**: CSP, X-Frame-Options, etc.
- **CORS para API**: Permite llamadas al backend

## Comandos Útiles

```bash
# Lint del código
npm run lint

# Build local para probar
npm run build && npm run preview

# Verificar que el build funciona
npx serve dist
```

## Solución de Problemas

### "VITE_API_URL no está definida"
1. Verificar que la variable está en GitHub Actions
2. Revisar que el workflow pasa la variable en el build step

### Error 404 en rutas
1. Verificar `staticwebapp.config.json` tiene `navigationFallback`
2. Comprobar que está en la raíz del proyecto

### CORS bloqueado
1. Verificar que el backend tiene `FRONTEND_URL` configurado
2. Comprobar que la URL del frontend coincide exactamente

### Build falla
1. Revisar logs de GitHub Actions
2. Probar build local: `npm run build`
3. Verificar versión de Node.js (debe ser 18+)
