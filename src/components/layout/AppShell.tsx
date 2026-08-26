'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Users, 
  Calendar, 
  Wallet, 
  ShieldCheck, 
  FileSpreadsheet, 
  Download, 
  Bell, 
  Lock, 
  Settings, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  LayoutDashboard,
  AlertTriangle,
  Compass,
  Landmark,
  Banknote,
  Sparkles,
  FileText,
  FileCheck,
  FolderArchive,
  Globe
} from 'lucide-react'
import { CassaBot } from '@/components/CassaBot'
import { cn } from '@/lib/utils'
import { createBrowserClient } from '@supabase/ssr'
import ScoutMasterLogo from '@/components/layout/Logo'

interface SaldiState {
  cassa: number
  banca: number
  totale: number
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [annoScout, setAnnoScout] = useState('2025/2026')
  const [saldi, setSaldi] = useState({ cassa: 0, banca: 0 })

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) return

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

    const fetchSaldi = async () => {
      const { data: spese } = await supabase.from('registro_spese').select('importo, tipo_movimento, metodo')
      if (!spese) return

      let cassa = 0
      let banca = 0

      spese.forEach((s) => {
        const isEntrata = s.tipo_movimento === 'ENTRATA'
        const metodo = (s.metodo || '').trim().toUpperCase()
        const isBanca = metodo.includes('BONIF') || metodo.includes('BANC') || metodo.includes('CART') || metodo.includes('POS')
        const val = Number(s.importo) || 0

        if (!isBanca) {
          if (isEntrata) cassa += val
          else cassa -= val
        } else {
          if (isEntrata) banca += val
          else banca -= val
        }
      })

      setSaldi({ cassa, banca })
    }

    fetchSaldi()

    const channel = supabase
      .channel('appshell_cassa_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_spese' }, () => {
        fetchSaldi()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const navGroups = [
    {
      groupLabel: 'VITA DI REPARTO',
      links: [
        { name: 'Anagrafica', href: '/', icon: Users },
        { name: 'Panoramica & Bento', href: '/panoramica', icon: LayoutDashboard },
        { name: 'Presenze & Uscite', href: '/uscite', icon: Calendar },
        { name: 'BuonaCaccia', href: '/buonacaccia', icon: Compass },
      ]
    },
    {
      groupLabel: 'AMMINISTRAZIONE',
      links: [
        { name: 'Cassa & Spese', href: '/cassa', icon: Wallet },
        { name: 'Scansione Scontrini OCR', href: '/cassa/ocr', icon: Sparkles },
        { name: 'Quote Mensili', href: '/quote-mensili', icon: FileSpreadsheet },
        { name: 'Censimento', href: '/censimento', icon: ShieldCheck },
        { name: 'Panoramica Mancanti', href: '/panoramica-mancanti', icon: AlertTriangle },
      ]
    },
    {
      groupLabel: 'DOCUMENTI & MODULI',
      links: [
        { name: 'Documenti & Privacy', href: '/privacy', icon: FileText },
        { name: 'Modelli Vuoti', href: '/modelli-vuoti', icon: FileCheck },
        { name: 'Archivio Documenti', href: '/archivio-documenti', icon: FolderArchive },
      ]
    },
    {
      groupLabel: 'STRUMENTI',
      links: [
        { name: 'Strumenti & Link', href: '/strumenti-link', icon: Globe },
        { name: 'Raccordo Bilancio AGESCI', href: '/report/bilancio-agesci', icon: FileSpreadsheet },
        { name: 'Report Completi', href: '/report', icon: Download },
        { name: 'Reminder', href: '/reminder', icon: Bell },
        { name: 'Impostazioni', href: '/impostazioni', icon: Settings },
      ]
    }
  ]

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-bg text-slate-900 font-sans">
      {/* Desktop Collapsible Sidebar */}
      <aside 
        className={cn(
          "hidden md:flex flex-col bg-agesci-blue border-r border-agesci-blue-light transition-all duration-300 z-30 shrink-0 select-none text-white shadow-lg",
          collapsed ? "w-20" : "w-64"
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-agesci-blue-light/60 bg-agesci-blue">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            {collapsed ? (
              <ScoutMasterLogo className="h-8 w-8" variant="icon" theme="dark" />
            ) : (
              <ScoutMasterLogo className="h-9 w-auto" variant="full" theme="dark" />
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-agesci-blue-light/80 transition-colors"
            title={collapsed ? "Espandi Sidebar" : "Riduci Sidebar"}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold text-slate-300/80 tracking-widest uppercase">
                  {group.groupLabel}
                </div>
              )}
              <div className="space-y-1">
                {group.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href))
                  const Icon = link.icon

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                        isActive 
                          ? "bg-agesci-blue-light text-scout-gold font-semibold shadow-xs border-l-4 border-scout-gold" 
                          : "text-slate-200 hover:bg-agesci-blue-light/70 hover:text-white"
                      )}
                    >
                      <Icon className={cn(
                        "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
                        isActive ? "text-scout-gold" : "text-slate-300"
                      )} />
                      {!collapsed && (
                        <span className="truncate">{link.name}</span>
                      )}
                      {collapsed && (
                        <div className="absolute left-full rounded-md px-2 py-1 ml-2 bg-slate-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-md">
                          {link.name}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Brand Info */}
        {!collapsed && (
          <div className="p-3 border-t border-agesci-blue-light/60 bg-agesci-blue text-xs text-slate-300/70 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-scout-gold" />
              <span>Stile AGESCI</span>
            </span>
            <span className="text-[10px] bg-agesci-blue-light px-2 py-0.5 rounded-full text-slate-200 font-semibold">
              v3.0.4
            </span>
          </div>
        )}
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Superiore Sticky */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur px-4 md:px-6 shadow-2xs">
          {/* Mobile Left Logo & Toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 touch-min flex items-center justify-center"
              aria-label="Apri Menu"
            >
              <Menu className="h-6 w-6 text-agesci-blue" />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <ScoutMasterLogo className="h-8 w-auto" theme="light" />
            </Link>
          </div>

          {/* Center/Right Anno Scout Selector */}
          <div className="flex items-center gap-3 ml-auto md:ml-0">
            <div className="relative inline-flex items-center">
              <select
                value={annoScout}
                onChange={(e) => setAnnoScout(e.target.value)}
                className="appearance-none bg-slate-100 hover:bg-slate-200/80 text-agesci-blue font-semibold text-xs md:text-sm py-1.5 pl-3 pr-8 rounded-full border border-slate-200 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-agesci-blue"
              >
                <option value="2025/2026">Anno Scout 2025/2026</option>
                <option value="2024/2025">Anno Scout 2024/2025</option>
                <option value="2023/2024">Anno Scout 2023/2024</option>
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Indicatori Cassa Live (Mini-Widget con Icone Premium) */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/cassa" className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200/90 px-3 py-1.5 rounded-full transition-all text-xs shadow-2xs group">
              <Banknote className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="font-medium text-slate-600">Cassa:</span>
              <span className="font-bold tabular-nums text-emerald-900">{formatCurrency(saldi.cassa)}</span>
            </Link>
            <Link href="/cassa" className="flex items-center gap-2 bg-sky-50 hover:bg-sky-100/80 text-sky-800 border border-sky-200/90 px-3 py-1.5 rounded-full transition-all text-xs shadow-2xs group">
              <Landmark className="h-4 w-4 text-sky-600 group-hover:scale-110 transition-transform" />
              <span className="font-medium text-slate-600">Banca:</span>
              <span className="font-bold tabular-nums text-sky-900">{formatCurrency(saldi.banca)}</span>
            </Link>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6 p-4 md:p-6 bg-surface-bg">
          {children}
        </main>
      </div>

      {/* Mobile Slide-Over Drawer Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex flex-col w-5/6 max-w-xs bg-agesci-blue text-white h-full shadow-2xl z-10 overflow-y-auto">
            <div className="p-4 border-b border-agesci-blue-light flex items-center justify-between">
              <ScoutMasterLogo className="h-8 w-auto" theme="dark" />
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-agesci-blue-light touch-min flex items-center justify-center"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Mobile Cash Summary inside menu */}
            <div className="p-4 bg-agesci-blue-light/50 border-b border-agesci-blue-light space-y-2">
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Saldi Live</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-2.5 flex flex-col">
                  <span className="text-[10px] text-emerald-300 font-medium">Cassa Contanti</span>
                  <span className="text-sm font-bold text-emerald-200 tabular-nums">{formatCurrency(saldi.cassa)}</span>
                </div>
                <div className="bg-sky-950/60 border border-sky-500/30 rounded-xl p-2.5 flex flex-col">
                  <span className="text-[10px] text-sky-300 font-medium">Banca / POS</span>
                  <span className="text-sm font-bold text-sky-200 tabular-nums">{formatCurrency(saldi.banca)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-6 flex-1">
              {navGroups.map((group, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">
                    {group.groupLabel}
                  </div>
                  <div className="space-y-1">
                    {group.links.map((link) => {
                      const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href))
                      const Icon = link.icon

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors touch-min",
                            isActive 
                              ? "bg-agesci-blue-light text-scout-gold font-semibold border-l-4 border-scout-gold" 
                              : "text-slate-200 hover:bg-agesci-blue-light/60 hover:text-white"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", isActive ? "text-scout-gold" : "text-slate-300")} />
                          <span>{link.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Fixed 4 Quick Buttons) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden shadow-lg">
        <Link
          href="/uscite"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 touch-min transition-colors",
            pathname === '/uscite' ? "text-agesci-blue font-bold" : "text-slate-500 hover:text-agesci-blue"
          )}
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] leading-none">Presenze</span>
        </Link>
        
        <Link
          href="/cassa"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 touch-min transition-colors",
            pathname === '/cassa' ? "text-agesci-blue font-bold" : "text-slate-500 hover:text-agesci-blue"
          )}
        >
          <Wallet className="h-5 w-5" />
          <span className="text-[10px] leading-none">Cassa Rapida</span>
        </Link>

        <Link
          href="/"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 touch-min transition-colors",
            pathname === '/' ? "text-agesci-blue font-bold" : "text-slate-500 hover:text-agesci-blue"
          )}
        >
          <Users className="h-5 w-5" />
          <span className="text-[10px] leading-none">Ragazzi</span>
        </Link>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 touch-min text-slate-500 hover:text-agesci-blue transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] leading-none">Menu</span>
        </button>
      </nav>

      <CassaBot />
    </div>
  )
}
