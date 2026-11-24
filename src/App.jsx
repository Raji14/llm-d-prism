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
import { Button } from './components/ui/Button.jsx';

import SiteHeader from './components/layout/SiteHeader';
import SiteFooter from './components/layout/SiteFooter';
import { isKnownView, planNavigation, readNavigationParams, resolveView, sameNavigationParams } from './components/layout/navigation';
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

// Views that read the shared benchmark catalog (useDashboardData's
// loadAllData). Home, the Leaderboard, Methodology, Regressions and the
// well-lit paths don't, so the full load (dozens of bucket and API requests)
// starts the first time one of these opens instead of on every landing.
const DATA_VIEWS = new Set(['results-store', 'benchmark-browser', 'submit-benchmarks']);

// The view the address bar asks for. Old ids resolve to the view they became;
// which URL params carry across views lives in src/components/layout/navigation.js.
const viewFromLocation = () => {
  if (/^\/artifacts\/[^/]+\/[^/]+$/.test(window.location.pathname)) return 'results-store';
  return resolveView(new URLSearchParams(window.location.search).get('view'));
};

// A link that uses an old view id (say ?view=intelligent-routing) opens the
// view it became, and the address bar is corrected so the next share is canonical.
function canonicalizeViewParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('view');
  if (!raw || resolveView(raw) === raw) return;
  params.set('view', resolveView(raw));
  window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

// An unknown ?view= (a typo, a retired page) gets a way back instead of a blank page.
function NotFoundView({ view, onNavigate }) {
  const go = (e, target) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onNavigate(target);
  };
  const links = [
    { view: 'home', label: 'Home' },
    { view: 'model-leaderboard', label: 'Leaderboard' },
    { view: 'results-store', label: 'Results store' },
  ];
  return (
    <div className="surface-light flex min-h-full flex-col items-center justify-center bg-theme-bg px-4 py-24 text-center font-sans text-zinc-900">
      <p className="kicker text-accent-600">Page not found</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-display sm:text-4xl">There&apos;s no page here</h1>
      <p className="mt-3 max-w-md break-words text-base text-zinc-600">
        Prism has no page called <code className="font-mono text-zinc-800">{String(view).slice(0, 80)}</code>. The link may be
        mistyped, or the page may have moved.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {links.map((l, i) => (
          <Button key={l.view} href={`?view=${l.view}`} onClick={(e) => go(e, l.view)} variant={i === 0 ? 'primary' : 'secondary'} size="md">
            {l.label}
            {i === 0 && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const mainRef = useRef(null);
  // Legacy ids resolve to their view (see VIEW_ALIASES in navigation.js).
  const [currentView, setCurrentView] = useState(viewFromLocation);
  // Latches on the first visit to a view that reads the catalog (DATA_VIEWS);
  // until then the data hook holds back its loads too.
  const [dataWanted, setDataWanted] = useState(() => DATA_VIEWS.has(viewFromLocation()));
  const dashboardState = useDashboardState();
  const dashboardData = useDashboardData(dashboardState.initialState, dashboardState, { active: dataWanted });

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

  const [navigationParams, setNavigationParams] = useState(() => readNavigationParams(window.location.search));

  // Bumped when a link targets the Results store while it's open, so it
  // remounts and reads its screen from the new address (it reads it on mount).
  const [storeVisit, setStoreVisit] = useState(0);

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const { fetchConfig, loadAllData, enableLLMDResults, loading, isRestoringConnections, gcsProfiles, loadingTasks } = dashboardData;
  const configRequest = useRef(null);
  const hasLoadedData = useRef(false);

  useEffect(() => {
    canonicalizeViewParam();
  }, []);

  // The site config (tab title, analytics, default buckets) loads on every page.
  useEffect(() => {
    if (!configRequest.current) configRequest.current = fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (DATA_VIEWS.has(currentView)) setDataWanted(true);
  }, [currentView]);

  useEffect(() => {
    if (!dataWanted) return;
    const initialize = async () => {
      if (!hasLoadedData.current) {
        hasLoadedData.current = true;
        const config = await (configRequest.current || (configRequest.current = fetchConfig()));
        loadAllData(config);
      } else {
        loadAllData();
      }
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableLLMDResults, dataWanted]);

  // Prism 2.0 theme (light default). Subscribing here re-renders every view on
  // toggle so charts re-read their theme-resolved chrome colors.
  useTheme();

  useEffect(() => {
    const onPopState = () => {
      canonicalizeViewParam();
      // Back/Forward within one view (a drawer or detail screen the view
      // pushed) keeps it mounted: the view restores its own state from the
      // URL. A different view swaps in. Unchanged params keep their identity,
      // so views that sync from navigationParams don't re-apply them.
      setCurrentView(viewFromLocation());
      const next = readNavigationParams(window.location.search);
      setNavigationParams((prev) => (sameNavigationParams(prev, next) ? prev : next));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);


  const handleNavigate = (target, extraParams = {}) => {
    const view = resolveView(target);
    if (isKnownView(currentView) && currentView !== 'submit-benchmarks' && currentView !== 'recipe-comparison') {
      localStorage.setItem('prism_previous_view', currentView);
    }
    if (view === 'results-store' && currentView === 'results-store') setStoreVisit((n) => n + 1);
    setCurrentView(view);
    setIsMobileNavOpen(false); // Close mobile nav on navigation

    // Which URL params carry over (leaderboard filters, the store's screen and
    // Browse filters, intents) is decided in navigation.js, where it's tested.
    const { search, hash, navigationParams: nextParams } = planNavigation(window.location.search, currentView, view, extraParams);
    setNavigationParams(nextParams);
    window.history.pushState({}, '', `${window.location.pathname}${search}${hash}`);

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
        {/* First stop for keyboard users: past the header, straight to the page. */}
        <a
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            mainRef.current?.focus();
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          Skip to content
        </a>
        <SiteHeader
          currentView={currentView}
          onNavigate={handleNavigate}
          mobileOpen={isMobileNavOpen}
          onMobileOpenChange={setIsMobileNavOpen}
        />
        {/* Children never shrink (*:shrink-0): main scrolls, and the footer
            keeps its full height below the view instead of collapsing to 1px. */}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col relative w-full *:shrink-0 focus:outline-none"
        >
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
            {currentView === 'home' && <PrismHome onNavigate={handleNavigate} />}
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
                key={storeVisit}
                // The store's back button says Home, so it goes Home (it used to
                // fall back to the benchmark browser, which is no longer linked).
                onNavigateBack={() => handleNavigate('home')}
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
            {currentView === 'pd-disaggregation' && <PdDisaggregationDashboard onNavigateBack={() => handleNavigate('home')} onNavigate={handleNavigate} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'regressions-analysis' && <RegressionsAnalysisDashboard onNavigateBack={() => handleNavigate('home')} onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} />}
            {currentView === 'guided-analysis' && <div className="p-8 text-center text-slate-400 mt-20">Guided Analysis Coming Soon... <button onClick={() => handleNavigate('home')} className="underline ml-2 text-indigo-400">Back</button></div>}
            {!isKnownView(currentView) && <NotFoundView view={currentView} onNavigate={handleNavigate} />}
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

