import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Menu,
  X,
} from 'lucide-react';
import { TDD_SECTIONS, type SectionId } from './data/tddContent';
import { ActiveTddSection } from './components/TddSections';
import { generateFullTddMarkdown } from './utils/markdownExport';

const TOP_NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Ringkasan' },
  { id: 'e2ee', label: 'Enkripsi E2EE' },
  { id: 'group-multidevice', label: 'Grup & Multi-Device' },
  { id: 'realtime-webrtc', label: 'Real-Time & WebRTC' },
  { id: 'account-business', label: 'Akun & Bisnis' },
  { id: 'database', label: 'Skema Database' },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);
  const [downloadedNotice, setDownloadedNotice] = useState<boolean>(false);

  const currentIndex = useMemo(
    () => TDD_SECTIONS.findIndex((s) => s.id === activeSection),
    [activeSection]
  );
  const currentMeta = TDD_SECTIONS[currentIndex] ?? TDD_SECTIONS[0];
  const prevSection = currentIndex > 0 ? TDD_SECTIONS[currentIndex - 1] : null;
  const nextSection =
    currentIndex < TDD_SECTIONS.length - 1 ? TDD_SECTIONS[currentIndex + 1] : null;

  const handleSelectSection = (id: SectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadMarkdown = () => {
    const content = generateFullTddMarkdown();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'handrawina-technical-design-document.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadedNotice(true);
    window.setTimeout(() => setDownloadedNotice(false), 2400);
  };

  const handleCopyFullMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(generateFullTddMarkdown());
      setCopiedMarkdown(true);
      window.setTimeout(() => setCopiedMarkdown(false), 2000);
    } catch {
      setCopiedMarkdown(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 (Brand wordmark | single-line nav links | 1 primary CTA) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark + mobile nav button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Tutup daftar bab' : 'Buka daftar bab'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => handleSelectSection('overview')}
              className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Handrawina
            </button>
          </div>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Navigasi utama dokumen"
            className="hidden xl:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            {TOP_NAV_ITEMS.slice(0, 5).map((item) => {
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-teal-800 border-teal-700'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {downloadedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  TDD Diunduh
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Unduh Markdown
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-20 bg-white border-b border-slate-200 overflow-y-auto p-4">
          <div className="text-xs font-semibold text-slate-500 px-3 pb-2">
            Daftar Bab Rancangan Teknis
          </div>
          <nav aria-label="Navigasi bab seluler" className="space-y-1">
            {TDD_SECTIONS.map((sec) => {
              const isActive = sec.id === activeSection;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSelectSection(sec.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-baseline gap-3 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 text-teal-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {sec.number}
                  </span>
                  <span>{sec.shortTitle}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main Workspace: 260px Sidebar + Main Content Viewport */}
      <div className="max-w-[1440px] w-full mx-auto flex-1 flex">
        <aside
          aria-label="Daftar isi dokumen teknis"
          className="hidden lg:flex flex-col w-[268px] shrink-0 border-r border-slate-200 bg-white px-4 py-6"
        >
          <div className="sticky top-24 space-y-6">
            <div>
              <div className="px-3 text-xs font-semibold text-slate-500 mb-2">
                Dokumen Rancangan Teknis
              </div>
              <nav className="space-y-1">
                {TDD_SECTIONS.map((sec) => {
                  const isActive = sec.id === activeSection;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => handleSelectSection(sec.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-baseline gap-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-teal-50 text-teal-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span
                        className={`font-mono text-xs tabular-nums shrink-0 ${
                          isActive ? 'text-teal-700' : 'text-slate-400'
                        }`}
                      >
                        {sec.number}.
                      </span>
                      <span className="truncate">{sec.shortTitle}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-5 border-t border-slate-200 px-3 space-y-3">
              <div className="text-xs font-semibold text-slate-500">Metadata Spesifikasi</div>
              <dl className="space-y-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-400">Peran Penyusun</dt>
                  <dd className="text-slate-800 font-medium">
                    Principal System Architect &amp; Security Engineer
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Standar Kriptografi</dt>
                  <dd className="font-mono text-slate-800">Signal X3DH · Double Ratchet · SFrame · OPAQUE</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Artefak Termasuk</dt>
                  <dd className="text-slate-800">6 Diagram Mermaid · 4 Engine DDL · 3 Simulator</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={handleCopyFullMarkdown}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                {copiedMarkdown ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    Markdown Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Salin Seluruh Dokumen
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Document Canvas */}
        <main className="flex-1 min-w-0 px-5 sm:px-8 lg:px-12 py-8 lg:py-10">
          <article className="max-w-[1040px] mx-auto">
            {/* Document chapter header with clean unboxed metadata */}
            <header className="pb-6 mb-8 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums mb-2">
                <span>Bab {currentMeta.number} dari 0{TDD_SECTIONS.length}</span>
                <span aria-hidden="true">·</span>
                <span>Technical Design Document</span>
                <span aria-hidden="true">·</span>
                <span>E2EE Messaging &amp; Calling Architecture</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900">
                {currentMeta.number}. {currentMeta.title}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-2.5 max-w-3xl leading-relaxed">
                {currentMeta.subtitle}
              </p>
            </header>

            <ActiveTddSection sectionId={activeSection} />

            {/* Chapter footer pagination */}
            <nav
              aria-label="Navigasi antar bab"
              className="mt-12 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4"
            >
              {prevSection ? (
                <button
                  type="button"
                  onClick={() => handleSelectSection(prevSection.id)}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-left bg-white border border-slate-200 rounded-md hover:border-teal-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="text-[11px] text-slate-500">Bab Sebelumnya</div>
                    <div className="text-sm font-medium text-slate-900">
                      {prevSection.number}. {prevSection.shortTitle}
                    </div>
                  </div>
                </button>
              ) : (
                <div />
              )}

              {nextSection ? (
                <button
                  type="button"
                  onClick={() => handleSelectSection(nextSection.id)}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-right bg-white border border-slate-200 rounded-md hover:border-teal-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="text-[11px] text-slate-500">Bab Berikutnya</div>
                    <div className="text-sm font-medium text-slate-900">
                      {nextSection.number}. {nextSection.shortTitle}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Unduh Dokumen Lengkap (.md)
                </button>
              )}
            </nav>
          </article>
        </main>
      </div>
    </div>
  );
}
