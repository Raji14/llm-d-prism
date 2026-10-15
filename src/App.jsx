// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { Loader, ArrowRight } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import PrismHome from './components/PrismHome';
import { LoadingState } from './components/ui/Spinner';

import SiteHeader from './components/layout/SiteHeader';
import SiteFooter from './components/layout/SiteFooter';
import { useTheme } from './theme/useTheme';
import { useDashboardState } from './hooks/useDashboardState';
import { useDashboardData } from './hooks/useDashboardData';

// Home renders eagerly because it is the landing page. Every other view loads
// on first visit, so the landing bundle doesn't carry the dashboards' code.
const Dashboard = lazy(() => import('./components/Dashboard'));
const ResultsStore = lazy(() => import('./components/ResultsStore'));
const Milestone1Dashboard = lazy(() => import('./components/Milestone1Dashboard'));
const SchemaExplorer = lazy(() => import('./components/SchemaExplorer'));
const WorkloadCatalog = lazy(() => import('./components/WorkloadCatalog'));
const RegressionsAnalysisDashboard = lazy(() => import('./components/RegressionsAnalysisDashboard'));
const AgenticWorkloadsDashboard = lazy(() => import('./components/AgenticWorkloadsDashboard'));
const PrefixCacheOffloadingDashboard = lazy(() => import('./components/PrefixCacheOffloadingDashboard'));
const PdDisaggregationDashboard = lazy(() => import('./components/PdDisaggregationDashboard'));
const SubmitValidationPage = lazy(() => import('./components/DataConnections/SubmitValidationPage'));
const LeaderboardDashboard = lazy(() => import('./components/Leaderboard/LeaderboardDashboard'));
const RecipeComparisonPage = lazy(() => import('./components/Leaderboard/RecipeComparisonPage'));
const MethodologyPage = lazy(() => import('./components/MethodologyPage'));

// Leaderboard filters live in the URL so a filtered ranking can be shared and
// linked from Home. Only the leaderboard reads them; WorkloadCatalog reads its
// own `workload` id, which shares the name, so they never carry across views.
const LEADERBOARD_PARAMS = [
  'workload',
  'hardware',
  'engine',
  'sort',
  'q',
  'ttft_sla',
  'tpot_sla',
  'sla_pct',
  'layout',
  'curves',
  'x',
  'y',
  'scale',
];

function App() {
  const mainRef = useRef(null);
  const dashboardState = useDashboardState();
  const dashboardData = useDashboardData(dashboardState.initialState, dashboardState);

  const [stagedBundles, setStagedBundles] = useState(() => {
    try {
      const active = localStorage.getItem('prism_active_staged_bundles');
      return active ? JSON.parse(active) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const checkStaged = () => {
      try {
        const active = localStorage.getItem('prism_active_staged_bundles');
        const parsed = active ? JSON.parse(active) : [];
        if (JSON.stringify(parsed) !== JSON.stringify(stagedBundles)) {
          setStagedBundles(parsed);
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(checkStaged, 1000);
    return () => clearInterval(interval);
  }, [stagedBundles]);

  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // Legacy 'benchmark-comparison' deep links land on the Benchmark Browser,
    // where the comparison renders inline once brv02 runs are submitted.
    const view = params.get('view') || 'home';
    if (view === 'benchmark-comparison') return 'benchmark-browser';
    if (view === 'manage-benchmarks') return 'results-store';
    return view;
  });

  const [navigationParams, setNavigationParams] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      intent: params.get('intent') || null,
      recipes: params.get('recipes') || null,
      baseline: params.get('baseline') || null,
      recipe: params.get('recipe') || null,
      model: params.get('model') || null
    };
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const { fetchConfig, loadAllData, enableLLMDResults, loading, isRestoringConnections, gcsProfiles, loadingTasks } = dashboardData;
  const hasFetchedConfig = useRef(false);

  useEffect(() => {
    const initialize = async () => {
      if (!hasFetchedConfig.current) {
        hasFetchedConfig.current = true;
        const config = await fetchConfig();
        loadAllData(config);
      } else {
        loadAllData();
      }
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableLLMDResults]);

  // Prism 2.0 theme (light default). Subscribing here re-renders every view on
  // toggle so charts re-read their theme-resolved chrome colors.
  useTheme();

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view') || 'home';
      if (view === 'benchmark-comparison') {
        setCurrentView('benchmark-browser');
      } else if (view === 'manage-benchmarks') {
        setCurrentView('results-store');
      } else {
        setCurrentView(view);
      }
      setNavigationParams({
        intent: params.get('intent') || null,
        recipes: params.get('recipes') || null,
        baseline: params.get('baseline') || null,
        recipe: params.get('recipe') || null,
        model: params.get('model') || null
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  const handleNavigate = (view, extraParams = {}) => {
    if (currentView !== 'submit-benchmarks' && currentView !== 'recipe-comparison') {
      localStorage.setItem('prism_previous_view', currentView);
    }
    setCurrentView(view);
    setIsMobileNavOpen(false); // Close mobile nav on navigation
    
    // Update URL to reflect the current view
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    if (view !== 'home') {
      ['goal', 'm', 'hw', 'wl'].forEach((k) => params.delete(k));
    }
    // A different view starts clean: leaderboard filters never leak into it.
    // Comparing recipes and coming back keeps them, as the two views are one flow.
    const leaderboardFlow = ['model-leaderboard', 'recipe-comparison'];
    if (view !== currentView && !(leaderboardFlow.includes(view) && leaderboardFlow.includes(currentView))) {
      LEADERBOARD_PARAMS.forEach((k) => params.delete(k));
    }
    
    const resolvedParams = {};
    if (view === 'submit-benchmarks') {
      if (extraParams && typeof extraParams === 'object' && extraParams.intent) {
        params.set('intent', extraParams.intent);
        resolvedParams.intent = extraParams.intent;
      } else if (typeof extraParams === 'string') {
        params.set('intent', extraParams);
        resolvedParams.intent = extraParams;
      } else {
        params.delete('intent');
        resolvedParams.intent = null;
      }
    } else if (view === 'recipe-comparison') {
      if (extraParams && typeof extraParams === 'object') {
        if (extraParams.recipes) {
          const recStr = Array.isArray(extraParams.recipes) ? extraParams.recipes.join(',') : extraParams.recipes;
          params.set('recipes', recStr);
          resolvedParams.recipes = recStr;
        }
        if (extraParams.baseline) {
          params.set('baseline', extraParams.baseline);
          resolvedParams.baseline = extraParams.baseline;
        }
      }
      params.delete('intent');
      resolvedParams.intent = null;
    } else if (view === 'model-leaderboard') {
      if (extraParams && typeof extraParams === 'object') {
        if (extraParams.recipe) {
          params.set('recipe', extraParams.recipe);
          resolvedParams.recipe = extraParams.recipe;
        }
        if (extraParams.model) {
          params.set('model', extraParams.model);
          resolvedParams.model = extraParams.model;
        }
        // Pre-filtered entry points (Home's workload and accelerator chips).
        LEADERBOARD_PARAMS.forEach((k) => {
          if (extraParams[k] != null && extraParams[k] !== '') params.set(k, String(extraParams[k]));
        });
      }
      params.delete('intent');
      params.delete('recipes');
      params.delete('baseline');
    } else {
      params.delete('intent');
      params.delete('recipes');
      params.delete('baseline');
      params.delete('recipe');
      params.delete('model');
      resolvedParams.intent = null;
    }
    setNavigationParams(resolvedParams);

    // Optional in-page anchor; the target view scrolls to it once mounted.
    const hash = extraParams && typeof extraParams === 'object' && extraParams.hash ? `#${extraParams.hash}` : '';
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}${hash}`);
    
    // Reset scroll position on navigation
    window.scrollTo(0, 0);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  };

  const activeLoading = loading || isRestoringConnections || (gcsProfiles && gcsProfiles.some(p => p.loading));

  const { overallProgress, itemsFetched, totalItems, activeSourcesList } = useMemo(() => {
    const tasks = Object.values(loadingTasks || {});
    if (tasks.length === 0) return { overallProgress: 0, itemsFetched: 0, totalItems: 0, activeSourcesList: [] };

    let loaded = 0;
    let total = 0;
    const activeSources = [];

    tasks.forEach(t => {
      if (t.status === 'loading' || t.status === 'pending') {
        loaded += (t.loaded || 0);
        total += (t.total || 0);
        activeSources.push(t.name);
      }
    });

    const progress = total > 0 ? (loaded / total) * 100 : 0;
    return {
      overallProgress: Math.min(Math.max(progress, 0), 100),
      itemsFetched: loaded,
      totalItems: total,
      activeSourcesList: activeSources
    };
  }, [loadingTasks]);

  const showOverlays = activeLoading && !bypassLoading && (currentView === 'benchmark-browser' || currentView === 'results-store');

  return (
    <ErrorBoundary>
      <div className="h-screen bg-slate-950 w-full overflow-hidden font-sans relative flex flex-col">
        <SiteHeader
          currentView={currentView}
          onNavigate={handleNavigate}
          mobileOpen={isMobileNavOpen}
          onMobileOpenChange={setIsMobileNavOpen}
        />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col relative w-full">
          {/* Top Spark Progress Bar */}
          {showOverlays && (
            <div className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-[9999] pointer-events-none">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-accent-700 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          )}

          <Suspense fallback={<LoadingState size="md" />}>
            {/* Global staged benchmarks banner removed in favor of localized Results Store dashboard alert banner */}
            {currentView === 'home' && <PrismHome onNavigate={handleNavigate} submittedRuns={dashboardData.brv02Runs} />}
            {currentView === 'methodology' && <MethodologyPage onNavigate={handleNavigate} onNavigateBack={() => handleNavigate('home')} />}
            {currentView === 'model-leaderboard' && (
              <LeaderboardDashboard 
                onNavigateBack={() => handleNavigate('home')} 
                onNavigate={handleNavigate} 
                onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
                dashboardState={dashboardState} 
                dashboardData={dashboardData} 
                navigationParams={navigationParams}
              />
            )}
            {currentView === 'recipe-comparison' && (
              <RecipeComparisonPage
                onNavigateBack={() => handleNavigate('model-leaderboard')}
                onNavigate={handleNavigate}
                onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
                dashboardState={dashboardState}
                dashboardData={dashboardData}
                navigationParams={navigationParams}
              />
            )}
            {currentView === 'inference-scheduling' && <Milestone1Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} dashboardData={dashboardData} />}
            {currentView === 'agentic-serving' && <AgenticWorkloadsDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} dashboardData={dashboardData} />}
            {currentView === 'benchmark-browser' && <Dashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} dashboardState={dashboardState} dashboardData={dashboardData} />}
            {currentView === 'results-store' && (
              <ResultsStore 
                onNavigateBack={() => {
                  const prevView = localStorage.getItem('prism_previous_view') || 'benchmark-browser';
                  handleNavigate(prevView);
                }} 
                onNavigate={handleNavigate} 
                dashboardState={dashboardState} 
                dashboardData={dashboardData} 
              />
            )}
            {currentView === 'submit-benchmarks' && (
              <SubmitValidationPage 
                onNavigateBack={() => {
                  const prevView = localStorage.getItem('prism_previous_view') || 'results-store';
                  handleNavigate(prevView);
                }}
                onNavigate={handleNavigate} 
                dashboardState={dashboardState} 
                dashboardData={dashboardData} 
                initialIntent={navigationParams.intent}
              />
            )}
            {currentView === 'schema-explorer' && <SchemaExplorer onNavigateBack={() => handleNavigate('home')} />}
            {currentView === 'workload-catalog' && <WorkloadCatalog onNavigateBack={() => handleNavigate('home')} />}
            {currentView === 'prefix-cache-offloading' && <PrefixCacheOffloadingDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'pd-disaggregation' && <PdDisaggregationDashboard onNavigateBack={() => handleNavigate('home')} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'regressions-analysis' && <RegressionsAnalysisDashboard onNavigateBack={() => handleNavigate('home')} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'guided-analysis' && <div className="p-8 text-center text-slate-400 mt-20">Guided Analysis Coming Soon... <button onClick={() => handleNavigate('home')} className="underline ml-2 text-indigo-400">Back</button></div>}
          </Suspense>

          <SiteFooter onNavigate={handleNavigate} />

          {/* Bottom-Right Persistent Status Toast */}
          {showOverlays && (
            <div className="fixed bottom-6 right-6 z-[100] w-96 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex flex-col space-y-3 text-sm select-none border-slate-700/50 animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="font-semibold text-slate-200">Fetching {activeSourcesList.length} source{activeSourcesList.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => setBypassLoading(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Skip Waiting
                </button>
              </div>
              
              <div className="flex flex-col space-y-1">
                <span className="text-xs text-slate-400 font-medium">Active Sources:</span>
                <div className="text-xs font-mono text-blue-400 bg-slate-950/60 p-2 rounded-lg border border-slate-850 max-h-20 overflow-y-auto break-all flex flex-col gap-1">
                  {activeSourcesList.length > 0 ? (
                    activeSourcesList.map((src, i) => (
                      <div key={i} className="truncate">• {src}</div>
                    ))
                  ) : (
                    <div>Initializing...</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>{totalItems > 0 ? `${totalItems - itemsFetched} out of ${totalItems} items left` : 'Discovering items...'}</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>

              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-950">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full" 
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;

