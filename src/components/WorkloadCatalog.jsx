import React, { useEffect, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { PageHeader, ShareLinkButton } from './ui';

const WorkloadCatalog = ({ onNavigateBack }) => {
    // Compute the initial iframe source on mount only to prevent reloading the iframe on parent re-renders.
    const iframeSrc = useMemo(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const workload = queryParams.get('workload') || '';
        const initialPath = workload ? `/workloads/${workload}` : '';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const useLocalCatalog = isLocal && (
            import.meta.env.VITE_USE_LOCAL_WORKLOAD_CATALOG === 'true' ||
            queryParams.get('local_catalog') === 'true'
        );
        const baseUrl = useLocalCatalog 
            ? 'http://localhost:5174'
            : 'https://workload-catalog-app-369234493812.us-central1.run.app';
        return `${baseUrl}${initialPath}`;
    }, []);

    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.type === 'workload-catalog-navigate') {
                const path = event.data.path;
                const params = new URLSearchParams(window.location.search);
                if (path && path.startsWith('/workloads/')) {
                    const workloadId = path.replace('/workloads/', '').trim().toLowerCase().replace(/\s+/g, '-');
                    params.set('workload', workloadId);
                } else {
                    params.delete('workload');
                }
                window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center">
            <PageHeader
                kicker="Prism toolkit"
                title="Workload catalog"
                subtitle="Explore standardized LLM serving workload profiles, token length distributions, and traffic patterns."
                onNavigateBack={onNavigateBack}
                actions={
                    <>
                        <a
                            href="https://llm-d.ai/community"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-xs font-medium text-zinc-700 transition-colors cursor-pointer"
                        >
                            <MessageCircle className="w-3.5 h-3.5 text-zinc-500" /> Contact us
                        </a>
                        <ShareLinkButton />
                    </>
                }
            />

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 flex flex-col relative h-[calc(100vh-12rem)]">
                <div className="w-full h-full rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
                    <iframe 
                        src={iframeSrc} 
                        className="w-full h-full border-0" 
                        title="Workload catalog"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            </main>
        </div>
    );
};

export default WorkloadCatalog;

