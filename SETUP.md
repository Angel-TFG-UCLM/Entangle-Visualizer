# ENTANGLE - Frontend

> **Dashboard profesional para análisis del ecosistema de software cuántico**  
> Desarrollado como parte del TFG en la Universidad de Castilla-La Mancha

## 🏗️ Arquitectura del Proyecto

```
Frontend/
├── src/
│   ├── services/        # 📡 Service Layer (Axios HTTP client)
│   │   └── api.js       # Cliente API con interceptores
│   ├── components/      # 🧩 Componentes React reutilizables (futuro)
│   ├── pages/           # 📄 Vistas principales (futuro)
│   ├── App.jsx          # 🏠 Dashboard principal
│   ├── App.module.css   # 🎨 Estilos del dashboard (CSS Module)
│   ├── index.css        # 🌍 Variables CSS globales + Reset
│   └── main.jsx         # ⚡ Punto de entrada de Vite
├── .env.example         # 🔐 Plantilla de variables de entorno
├── package.json
└── vite.config.js
```

---

## 🚀 Setup e Instalación

### **Prerrequisitos**
- Node.js >= 18.x
- npm >= 9.x
- Backend corriendo en `http://localhost:8000` (o configurar URL de Azure)

### **1. Instalar dependencias**
```bash
npm install
```

### **2. Configurar variables de entorno**
```bash
# Copiar plantilla
cp .env.example .env

# Editar .env con tu URL de backend
# VITE_API_URL=http://localhost:8000  # Desarrollo
# VITE_API_URL=https://tu-backend.azurewebsites.net  # Producción
```

### **3. Ejecutar en modo desarrollo**
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### **4. Build para producción**
```bash
npm run build
```

Los archivos optimizados se generarán en `dist/`

---

## 🎨 Sistema de Diseño

### **Paleta de Colores** (Dark Tech/Scientific)
| Variable CSS           | Color     | Uso                          |
|------------------------|-----------|------------------------------|
| `--color-bg`           | `#333366` | Fondo principal              |
| `--color-card`         | `#2A2A55` | Fondo de tarjetas            |
| `--color-accent`       | `#6699FF` | Azul científico (CTA)        |
| `--color-neon`         | `#CCFF00` | Verde neón (éxito/resaltado) |
| `--color-text`         | `#F0F0F0` | Texto principal              |
| `--color-text-muted`   | `#A0A0C0` | Texto secundario             |

### **Espaciado** (Sistema 8px)
```css
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px
--spacing-2xl: 48px
```

### **Por qué NO Tailwind?**
- ✅ Control total del CSS con variables nativas
- ✅ CSS Modules evita colisiones de nombres
- ✅ Sistema de diseño semántico (`--color-accent` vs `blue-500`)
- ✅ Menos dependencias y mejor para debugging en TFG

---

## 📡 Service Layer

### **Arquitectura de Comunicación HTTP**
Los componentes **NUNCA** hacen `fetch()` directamente. Toda la lógica HTTP está centralizada en `src/services/api.js`:

```javascript
// ❌ MAL - Fetch directo en componente
const data = await fetch('/api/v1/repos').then(r => r.json());

// ✅ BIEN - Usar Service Layer
import { getRepositories } from './services/api';
const data = await getRepositories();
```

### **Funciones disponibles**
```javascript
checkHealth()              // Verificar estado del backend
getDashboardStats()        // Estadísticas del dashboard
getRepositories(params)    // Lista de repositorios
getUsers(params)           // Lista de usuarios
getOrganizations(params)   // Lista de organizaciones
```

### **Interceptores configurados**
- ✅ Logging automático de requests/responses
- ✅ Manejo centralizado de errores
- ✅ Preparado para agregar tokens de autenticación

---

## 🧪 Testing (Futuro)

```bash
# Ejecutar tests (cuando se implementen)
npm test

# Coverage
npm run test:coverage
```

---

## 📦 Build y Deploy

### **Build local**
```bash
npm run build
npm run preview  # Preview del build
```

### **Deploy a Azure Static Web Apps** (Recomendado)
```bash
# Instalar Azure Static Web Apps CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./dist --env production
```

---

## 🛠️ Decisiones Arquitectónicas (Nivel TFG)

### **1. CSS Modules en lugar de Tailwind**
**Justificación**: Mayor control para un TFG de calidad. Variables CSS nativas son estándar web y permiten temas dinámicos sin recompilar.

### **2. Service Layer (api.js)**
**Justificación**: Separación de responsabilidades (SoC). Los componentes UI no deben saber cómo funciona Axios o la URL del backend.

### **3. Estado local con useState** (ahora) → **Zustand/Redux** (futuro)
**Justificación**: Para un dashboard simple, `useState` es suficiente. Si crece, migrar a Zustand para gestión global.

### **4. Vite en lugar de Create React App**
**Justificación**: Vite es 10-20x más rápido en HMR (Hot Module Replacement). Estándar moderno en 2025.

---

## 🔗 Endpoints Backend Esperados

| Método | Endpoint               | Descripción                  |
|--------|------------------------|------------------------------|
| GET    | `/`                    | Health check                 |
| GET    | `/api/v1/stats`        | Estadísticas del dashboard   |
| GET    | `/api/v1/repositories` | Lista de repositorios        |
| GET    | `/api/v1/users`        | Lista de usuarios            |
| GET    | `/api/v1/organizations`| Lista de organizaciones      |

---

## 📚 Próximos Pasos (Roadmap)

- [ ] Implementar React Router para navegación multi-página
- [ ] Crear componentes reutilizables (Card, Button, Table)
- [ ] Integrar gráficas con Recharts para visualización de datos
- [ ] Agregar autenticación con JWT
- [ ] Implementar filtros y búsqueda en tablas
- [ ] Tests unitarios con Vitest
- [ ] Deploy CI/CD con GitHub Actions

---

## 📄 Licencia

TFG UCLM 2025 - Uso académico

---

## 👤 Autor

**Ángel García**  
TFG: Análisis del Ecosistema de Software Cuántico  
Universidad de Castilla-La Mancha
