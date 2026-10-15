import React from 'react';
import { MessageCircle } from 'lucide-react';
import { PageHeader, ShareLinkButton } from './ui';

const SchemaExplorer = ({ onNavigateBack }) => {
    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center">
            <PageHeader
                kicker="Prism toolkit"
                title="Schema explorer"
                subtitle="Inspect the canonical Benchmark Report v0.2 JSON schema, stage definitions, and validation rules."
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
                        src="https://benchmark-schema-explorer-369234493812.us-central1.run.app" 
                        className="w-full h-full border-0" 
                        title="Schema Explorer"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            </main>
        </div>
    );
};

export default SchemaExplorer;
