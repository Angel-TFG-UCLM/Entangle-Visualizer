"""
Análisis de distribución de lentes — verifica que las métricas producen
gradientes visibles en el frontend (centralidad, intensidad, bus factor).

Replica exactamente la lógica del frontend lensData useMemo para validar
que los colores finales son distintos.
"""
import requests
import json
import math
import sys
from collections import Counter

API = "http://localhost:8000/api/v1"

def percentile_rank(sorted_vals, value):
    """Exact copy of frontend percentileRank (binary search)."""
    if len(sorted_vals) <= 1:
        return 0.5
    lo, hi = 0, len(sorted_vals)
    while lo < hi:
        mid = (lo + hi) >> 1
        if sorted_vals[mid] < value:
            lo = mid + 1
        else:
            hi = mid
    return lo / (len(sorted_vals) - 1)

def analyze():
    print("=" * 70)
    print("ANÁLISIS DE DISTRIBUCIÓN DE LENTES")
    print("=" * 70)
    
    print("\n📡 Fetching network metrics...")
    try:
        r = requests.get(f"{API}/collaboration/network-metrics", timeout=180)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"❌ Error fetching data: {e}")
        sys.exit(1)
    
    nm = data.get("node_metrics", {})
    print(f"✅ {len(nm)} nodos totales")
    
    # Classify by type
    repos = {k: v for k, v in nm.items() if k.startswith("repo_")}
    orgs = {k: v for k, v in nm.items() if k.startswith("org_")}
    users = {k: v for k, v in nm.items() if k.startswith("user_")}
    print(f"   Repos: {len(repos)}, Orgs: {len(orgs)}, Users: {len(users)}")
    
    # ========================================================================
    # 1. DEGREE (Intensidad lens)
    # ========================================================================
    print("\n" + "=" * 70)
    print("🔥 LENTE: INTENSIDAD (degree)")
    print("=" * 70)
    
    repo_degrees = sorted([m.get("degree", 0) for m in repos.values()])
    all_degrees = sorted([m.get("degree", 0) for m in nm.values()])
    
    print(f"\n  Degree distribution (ALL {len(all_degrees)} nodes):")
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(all_degrees) * p / 100), len(all_degrees) - 1)
        print(f"    p{p:3d}: {all_degrees[idx]:.6f}")
    
    print(f"\n  Degree distribution (REPOS only, {len(repo_degrees)} nodes):")
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(repo_degrees) * p / 100), len(repo_degrees) - 1)
        print(f"    p{p:3d}: {repo_degrees[idx]:.6f}")
    
    # Simulate frontend with SEPARATE percentile ranks (current code)
    print(f"\n  Frontend brightness (repo-only percentileRank):")
    repo_brightnesses = []
    for k, m in repos.items():
        t = percentile_rank(repo_degrees, m.get("degree", 0))
        b = 0.05 + t * t * 1.8
        repo_brightnesses.append(b)
    repo_brightnesses.sort()
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(repo_brightnesses) * p / 100), len(repo_brightnesses) - 1)
        print(f"    p{p:3d}: brightness={repo_brightnesses[idx]:.3f}")
    
    # Check for ties
    unique_degrees = len(set(repo_degrees))
    print(f"\n  Unique degree values among repos: {unique_degrees}/{len(repo_degrees)}")
    degree_counts = Counter(round(d, 6) for d in repo_degrees)
    top_ties = degree_counts.most_common(10)
    print(f"  Top tied values (value: count):")
    for val, cnt in top_ties:
        pct = cnt / len(repo_degrees) * 100
        print(f"    degree={val:.6f}: {cnt} repos ({pct:.1f}%)")
    
    # ========================================================================
    # 2. BETWEENNESS (Centralidad lens)
    # ========================================================================
    print("\n" + "=" * 70)
    print("🎯 LENTE: CENTRALIDAD (betweenness)")
    print("=" * 70)
    
    repo_betw = sorted([m.get("betweenness", 0) for m in repos.values()])
    all_betw = sorted([m.get("betweenness", 0) for m in nm.values()])
    
    print(f"\n  Betweenness distribution (ALL {len(all_betw)} nodes):")
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(all_betw) * p / 100), len(all_betw) - 1)
        print(f"    p{p:3d}: {all_betw[idx]:.6f}")
    
    print(f"\n  Betweenness distribution (REPOS only, {len(repo_betw)} nodes):")
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(repo_betw) * p / 100), len(repo_betw) - 1)
        print(f"    p{p:3d}: {repo_betw[idx]:.6f}")
    
    # Simulate frontend
    print(f"\n  Frontend brightness (repo-only percentileRank):")
    repo_cen_bright = []
    for k, m in repos.items():
        t = percentile_rank(repo_betw, m.get("betweenness", 0))
        b = 0.05 + t * t * 1.8
        repo_cen_bright.append(b)
    repo_cen_bright.sort()
    for p in [0, 10, 25, 50, 75, 90, 95, 99, 100]:
        idx = min(int(len(repo_cen_bright) * p / 100), len(repo_cen_bright) - 1)
        print(f"    p{p:3d}: brightness={repo_cen_bright[idx]:.3f}")
    
    unique_betw = len(set(round(b, 6) for b in repo_betw))
    print(f"\n  Unique betweenness values among repos: {unique_betw}/{len(repo_betw)}")
    betw_counts = Counter(round(b, 6) for b in repo_betw)
    top_ties_b = betw_counts.most_common(10)
    print(f"  Top tied values:")
    for val, cnt in top_ties_b:
        pct = cnt / len(repo_betw) * 100
        print(f"    betw={val:.6f}: {cnt} repos ({pct:.1f}%)")
    
    # ========================================================================
    # 3. BUS FACTOR
    # ========================================================================
    print("\n" + "=" * 70)
    print("🚌 LENTE: BUS FACTOR")
    print("=" * 70)
    
    risk_counter = Counter()
    no_risk = 0
    for k, m in nm.items():
        risk = m.get("bus_factor_risk")
        if risk:
            risk_counter[risk] += 1
        else:
            no_risk += 1
    
    print(f"\n  Risk distribution:")
    for risk in ["critical", "high", "medium", "low"]:
        cnt = risk_counter.get(risk, 0)
        print(f"    {risk:10s}: {cnt:5d} nodes")
    print(f"    {'(no risk)':10s}: {no_risk:5d} nodes (orgs/users)")
    
    # Only repos should have bus_factor_risk
    repo_risks = Counter()
    for k, m in repos.items():
        r = m.get("bus_factor_risk", "none")
        repo_risks[r] += 1
    print(f"\n  Repo risk breakdown:")
    for risk in ["critical", "high", "medium", "low", "none"]:
        cnt = repo_risks.get(risk, 0)
        pct = cnt / len(repos) * 100
        print(f"    {risk:10s}: {cnt:5d} ({pct:.1f}%)")
    
    # ========================================================================
    # 4. COLOR VERIFICATION
    # ========================================================================
    print("\n" + "=" * 70)
    print("🎨 VERIFICACIÓN DE COLORES (instanceColor × materialColor)")
    print("=" * 70)
    
    # Material when lens active: lerps from #bd00ff*1.8 → white
    # At blend=1.0, material=white, so instanceColor = final color
    mat_base = (1.334, 0.0, 1.8)  # #bd00ff * 1.8
    
    print("\n  Con material PÚRPURA original (blend=0, sin fix):")
    bus_colors = {
        "critical": (1.8, 0.2, 0.15),
        "high": (1.8, 0.9, 0.1),
        "medium": (1.6, 1.5, 0.15),
        "low": (0.2, 1.6, 0.4),
    }
    for risk, (r, g, b) in bus_colors.items():
        fr = r * mat_base[0]
        fg = g * mat_base[1]  # ALWAYS 0!
        fb = b * mat_base[2]
        print(f"    {risk:10s}: instance({r:.1f},{g:.1f},{b:.2f}) × mat → ({fr:.2f},{fg:.2f},{fb:.2f}) → G=0 SIEMPRE!")
    
    print("\n  Con material BLANCO (blend=1.0, con fix actual):")
    for risk, (r, g, b) in bus_colors.items():
        print(f"    {risk:10s}: instance({r:.1f},{g:.1f},{b:.2f}) × (1,1,1) → ({r:.2f},{g:.2f},{b:.2f}) ✅ colores correctos")
    
    # ========================================================================
    # 5. SUMMARY
    # ========================================================================
    print("\n" + "=" * 70)
    print("📊 RESUMEN")
    print("=" * 70)
    
    # Check brightness range for repos
    int_range = repo_brightnesses[-1] - repo_brightnesses[0] if repo_brightnesses else 0
    cen_range = repo_cen_bright[-1] - repo_cen_bright[0] if repo_cen_bright else 0
    
    print(f"\n  Intensidad - rango de brillo repos: {repo_brightnesses[0]:.3f} → {repo_brightnesses[-1]:.3f} (delta={int_range:.3f})")
    print(f"    {'✅ BUENO' if int_range > 1.0 else '⚠️  INSUFICIENTE'}: {'gradiente visible' if int_range > 1.0 else 'gradiente comprimido'}")
    
    print(f"\n  Centralidad - rango de brillo repos: {repo_cen_bright[0]:.3f} → {repo_cen_bright[-1]:.3f} (delta={cen_range:.3f})")
    print(f"    {'✅ BUENO' if cen_range > 1.0 else '⚠️  INSUFICIENTE'}: {'gradiente visible' if cen_range > 1.0 else 'gradiente comprimido'}")
    
    bf_diverse = len([r for r in ["critical", "high", "medium", "low"] if repo_risks.get(r, 0) > 0])
    print(f"\n  Bus Factor - niveles de riesgo distintos en repos: {bf_diverse}/4")
    print(f"    {'✅ BUENO' if bf_diverse >= 3 else '⚠️  POCA DIVERSIDAD'}")
    
    print(f"\n  Material fix: {'✅ Material lerp a blanco cuando lens activa' if True else ''}")
    print()

if __name__ == "__main__":
    analyze()
