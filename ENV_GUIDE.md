# Variables de Entorno - Guía Rápida

## 📋 Archivos Creados

### `.env.development` (Desarrollo Local)
```env
VITE_API_URL=http://localhost:8000
VITE_DEBUG=true
```
- Se usa automáticamente con `npm run dev`
- Apunta al backend local en tu máquina

### `.env.production` (Producción Azure)
```env
VITE_API_URL=https://ca-entangle-uclm-api.graybay-aaa4f150.spaincentral.azurecontainerapps.io
VITE_DEBUG=false
```
- Se usa automáticamente con `npm run build`
- Apunta al backend desplegado en Azure

### `.env` (Opcional - Overrides Locales)
- Ahora está comentado, úsalo solo si necesitas un override manual
- **NO se sube a Git** (está en `.gitignore`)

---

## 🚀 Cómo Funciona

### Desarrollo Local
```bash
npm run dev
# → Lee .env.development
# → Conecta a http://localhost:8000
```

### Build Producción
```bash
npm run build
# → Lee .env.production
# → Conecta a Azure
```

---

## ⚠️ Por qué las variables deben empezar con `VITE_`

**Vite** solo expone al código del navegador las variables que empiezan con `VITE_` por **seguridad**:

### ✅ **Seguridad por Diseño**
- Variables como `DATABASE_PASSWORD` o `API_SECRET_KEY` NO deben estar en el frontend
- Solo variables públicas (URLs, flags de debug) deben ser accesibles
- El prefijo `VITE_` es una "whitelist" explícita de lo que es seguro exponer

### 📦 **Bundling Inteligente**
```javascript
// Esto SÍ funciona:
const url = import.meta.env.VITE_API_URL;
// → Vite reemplaza esto en build time por el valor real

// Esto NO funciona (undefined):
const secret = import.meta.env.DATABASE_PASSWORD;
// → Vite lo ignora aunque esté en el .env
```

### 🔐 **Ejemplo Real**
```env
# ❌ NO EXPONGAS ESTO (no tiene prefijo VITE_)
DATABASE_PASSWORD=supersecret123
API_SECRET_KEY=abc123xyz

# ✅ ESTO ES SEGURO (tiene prefijo VITE_)
VITE_API_URL=https://mi-api.com
VITE_APP_NAME=Entangle
```

En el código solo puedes acceder a `VITE_*`:
```javascript
console.log(import.meta.env.VITE_API_URL);      // ✅ Funciona
console.log(import.meta.env.DATABASE_PASSWORD); // ❌ undefined
```

---

## 🔍 Verificación

Abre la consola del navegador cuando ejecutes `npm run dev`:

```
🔗 API Client configurado para: http://localhost:8000
```

Si cambias a producción:
```
🔗 API Client configurado para: https://ca-entangle-uclm-api...
```

---

## 📝 Orden de Prioridad de Vite

1. `.env.production.local` (producción + local, **no se sube a Git**)
2. `.env.production` (producción)
3. `.env.development.local` (desarrollo + local, **no se sube a Git**)
4. `.env.development` (desarrollo)
5. `.env.local` (**no se sube a Git**)
6. `.env` (base, **no se sube a Git** en este proyecto)

---

## 🎯 Resumen

| Comando         | Archivo Usado        | URL Backend              |
|-----------------|----------------------|--------------------------|
| `npm run dev`   | `.env.development`   | http://localhost:8000    |
| `npm run build` | `.env.production`    | Azure Container App      |

**Importante**: Nunca subas archivos `.env` con secretos reales a Git. Los archivos `.env.development` y `.env.production` están OK porque solo contienen URLs públicas.
