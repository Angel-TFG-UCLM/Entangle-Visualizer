import snapshot from './generatedSnapshot.json'

function sessionId(existing) {
  return existing || `offline-session-${Date.now()}`
}

function isSpanish(message) {
  return /\b(qué|cuál|cuáles|muestra|abre|universo|repositorios|organizaciones|resume|resumen|investiga|crea)\b/i.test(
    message,
  )
}

function formatNumber(value, spanish) {
  const digits = Math.trunc(Number(value) || 0).toString()
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, spanish ? '.' : ',')
}

function topRepositories() {
  return (
    snapshot.dashboard.charts?.repositories?.byStars ||
    snapshot.dashboard.tables?.repositories ||
    []
  ).slice(0, 5)
}

function topOrganizations() {
  return (
    snapshot.dashboard.charts?.organizations?.byQuantumFocus ||
    snapshot.dashboard.charts?.organizations?.byRepos ||
    []
  ).slice(0, 5)
}

function repositoryLine(repo, index) {
  const stars = repo.stargazer_count ?? repo.stars ?? 0
  const language = repo.primary_language?.name || repo.primary_language || repo.language || '—'
  return `${index + 1}. **${repo.full_name || repo.name}** — ${stars.toLocaleString()} stars · ${language}`
}

function organizationLine(org, index) {
  const repos = org.quantum_repositories_count ?? org.quantum_repos_count ?? 0
  const score = org.quantum_focus_score ?? 0
  return `${index + 1}. **${org.name || org.login}** — ${repos} repos cuánticos · foco ${Number(score).toFixed(1)}`
}

export function buildOfflineReply(message, research = false, existingSessionId = null) {
  const text = String(message || '').trim()
  const lower = text.toLowerCase()
  const spanish = isSpanish(text)
  const sid = sessionId(existingSessionId)
  const kpis = snapshot.dashboard.kpis
  const universeMetrics = snapshot.collaboration.metrics
  let intent = 'KNOWLEDGE'
  let tools = ['offline_snapshot']
  let action = null
  let content

  if (research) {
    intent = 'RESEARCH'
    tools = ['preserved_knowledge', 'source_catalog']
    content = spanish
      ? `### Investigación preservada\n\nEl modo offline no consulta la web. Reproduce una síntesis determinista basada en el snapshot de Entangle y en fuentes públicas guardadas.\n\n- **Tema:** ${text}\n- **Ecosistema analizado:** ${formatNumber(kpis.totalRepos, true)} repositorios y ${formatNumber(kpis.totalUsers, true)} colaboradores.\n- **Referencias de partida:** [Qiskit](https://qiskit.org), [PennyLane](https://pennylane.ai), [Cirq](https://quantumai.google/cirq) y [QuTiP](https://qutip.org).\n\nPara investigación actualizada se necesita el backend real con un proveedor de búsqueda configurado.`
      : `### Preserved research\n\nOffline mode does not query the web. It replays a deterministic synthesis based on the Entangle snapshot and saved public sources.\n\n- **Topic:** ${text}\n- **Mapped ecosystem:** ${formatNumber(kpis.totalRepos, false)} repositories and ${formatNumber(kpis.totalUsers, false)} contributors.\n- **Starting references:** [Qiskit](https://qiskit.org), [PennyLane](https://pennylane.ai), [Cirq](https://quantumai.google/cirq), and [QuTiP](https://qutip.org).\n\nCurrent research requires the real backend and a configured search provider.`
  } else if (/univers|grafo|graph|tunnel|entrelaz/i.test(lower)) {
    intent = 'UNIVERSE'
    tools = ['collaboration_graph', 'network_metrics']
    if (/\b(abre|open|launch|entra)\b/i.test(lower)) {
      action = { type: 'action', action: 'OPEN_UNIVERSE', data: { autoTour: true } }
    }
    content = spanish
      ? `El Universo preservado mantiene un subgrafo navegable de **${formatNumber(snapshot.collaboration.snapshot.nodes, true)} nodos** y **${formatNumber(snapshot.collaboration.snapshot.links, true)} enlaces**, extraído del grafo real de ${formatNumber(universeMetrics.graph_nodes, true)} nodos.\n\nLa instantánea conserva comunidades, centralidad, resiliencia, intensidad, disciplinas, búsqueda, tour temporal y tunneling.`
      : `The preserved Universe contains a navigable **${formatNumber(snapshot.collaboration.snapshot.nodes, false)}-node** and **${formatNumber(snapshot.collaboration.snapshot.links, false)}-link** subgraph derived from the real ${formatNumber(universeMetrics.graph_nodes, false)}-node network.\n\nIt retains communities, centrality, resilience, intensity, disciplines, search, temporal tour, and tunneling.`
  } else if (/top.*repo|repos.*top|repositorio/i.test(lower)) {
    intent = 'DATA'
    tools = ['dashboard_snapshot', 'rank_repositories']
    content = `${spanish ? '### Repositorios destacados' : '### Top repositories'}\n\n${topRepositories()
      .map(repositoryLine)
      .join('\n')}`
  } else if (/top.*org|organizaci|organisation|organization/i.test(lower)) {
    intent = 'DATA'
    tools = ['dashboard_snapshot', 'rank_organizations']
    content = `${spanish ? '### Organizaciones destacadas' : '### Top organizations'}\n\n${topOrganizations()
      .map(organizationLine)
      .join('\n')}`
  } else if (/vista|view/i.test(lower) && /\b(crea|create|genera|save)\b/i.test(lower)) {
    intent = 'DASHBOARD'
    tools = ['dashboard_snapshot', 'create_view']
    const orgs = topOrganizations().slice(0, 3).map(org => org.login)
    action = {
      type: 'action',
      action: 'CREATE_VIEW',
      data: { orgs, color: '#00D4E4' },
    }
    content = spanish
      ? `He preparado una vista local con **${orgs.join(', ')}**. Se guarda únicamente en este navegador y puede exportarse desde Favoritos.`
      : `I prepared a local view with **${orgs.join(', ')}**. It is stored only in this browser and can be exported from Favorites.`
  } else if (/resumen|summary|ecosistema|ecosystem|estad/i.test(lower)) {
    intent = 'DASHBOARD'
    tools = ['dashboard_snapshot']
    content = spanish
      ? `### Snapshot de Entangle\n\n- **${formatNumber(kpis.totalRepos, true)}** repositorios cuánticos\n- **${formatNumber(kpis.totalUsers, true)}** colaboradores\n- **${formatNumber(kpis.totalOrgs, true)}** organizaciones\n- Lenguaje dominante: **${kpis.topLanguage}**\n- **${formatNumber(universeMetrics.bridge_users_count, true)}** usuarios puente\n- Modularidad preservada: **${snapshot.network.global_metrics.modularity}**`
      : `### Entangle snapshot\n\n- **${formatNumber(kpis.totalRepos, false)}** quantum repositories\n- **${formatNumber(kpis.totalUsers, false)}** contributors\n- **${formatNumber(kpis.totalOrgs, false)}** organizations\n- Leading language: **${kpis.topLanguage}**\n- **${formatNumber(universeMetrics.bridge_users_count, false)}** bridge users\n- Preserved modularity: **${snapshot.network.global_metrics.modularity}**`
  } else {
    content = spanish
      ? `Estoy funcionando sobre la instantánea preservada de Entangle. Puedo explicar el ecosistema, listar repositorios u organizaciones destacadas, abrir el Universo 3D, crear una vista local o reproducir una investigación guardada.\n\nPrueba: **“resume el ecosistema”**, **“abre el universo”** o **“top repositorios”**.`
      : `I am running on Entangle's preserved snapshot. I can explain the ecosystem, list leading repositories or organizations, open the 3D Universe, create a local view, or replay saved research.\n\nTry **“summarize the ecosystem”**, **“open the universe”**, or **“top repositories”**.`
  }

  return {
    reply: content,
    content,
    history: [
      { role: 'user', content: text },
      { role: 'assistant', content },
    ],
    tools_used: tools,
    session_id: sid,
    intent,
    action,
    offline: true,
  }
}

function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError')
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

export async function streamOfflineReply(
  message,
  callbacks = {},
  signal = null,
  existingSessionId = null,
) {
  const result = buildOfflineReply(message, false, existingSessionId)
  callbacks.onSession?.({ type: 'session', session_id: result.session_id })
  callbacks.onStatus?.({
    type: 'status',
    status_key: 'classifying',
    message: 'Clasificando la consulta preservada',
  })
  await wait(120, signal)
  callbacks.onRouting?.({ type: 'routing', intent: result.intent })
  callbacks.onThinking?.({
    type: 'thinking',
    tool: result.tools_used[0],
    tool_key: result.tools_used[0],
    description: 'Consultando la instantánea local verificada',
    round: 1,
  })
  await wait(180, signal)
  callbacks.onToolResult?.({
    type: 'tool_result',
    tool: result.tools_used[0],
    summary: `${snapshot.manifest.sourceSnapshotDate} snapshot`,
  })
  await wait(100, signal)

  for (let offset = 0; offset < result.content.length; offset += 28) {
    if (signal?.aborted) throw abortError()
    callbacks.onToken?.({
      type: 'token',
      content: result.content.slice(offset, offset + 28),
    })
    await wait(18, signal)
  }

  if (result.action) callbacks.onAction?.(result.action)
  callbacks.onReply?.({
    type: 'reply',
    content: result.content,
    history: result.history,
    tools_used: result.tools_used,
    session_id: result.session_id,
    offline: true,
  })
}
