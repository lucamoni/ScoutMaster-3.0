'use client'

import { Toaster } from 'sonner'
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

  Settings, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  LayoutDashboard,
  AlertTriangle,
  Compass,
  Landmark,
  Banknote,
  ScanLine,
  FileText,
  FileCheck,
  FolderArchive,
  Globe,
  CheckCircle2,
} from 'lucide-react'
import { CassaBot } from '@/components/CassaBot'
import { cn } from '@/lib/utils'
import { createBrowserClient } from '@supabase/ssr'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { getAccountingPeriod, calculateAccountingBalances } from '@/lib/utils/accounting'
import ScoutMasterLogo from '@/components/layout/Logo'
import { LogoutButton } from '@/components/layout/LogoutButton'
import { CENSUS_INCOME_SETTING } from '@/lib/utils/censusAccounting'
import { WORKING_YEAR_COOKIE, workingYearSettings } from '@/lib/utils/workingYear'

export function AppShell({ children, selectedYear, availableYears, canManageSettings, userName }: { children: React.ReactNode; selectedYear: string; availableYears: string[]; canManageSettings: boolean; userName: string }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const annoScout = selectedYear
  const [saldi, setSaldi] = useState({ cassa: 0, banca: 0 })

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) return

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

    const fetchSaldi = async () => {
      const settingsRes = await supabase.from('impostazioni').select('chiave, valore')
      if (settingsRes.error) return
      const settings = new Map<string, string | null>((settingsRes.data || []).map(item => [item.chiave, item.valore]))
      const period = getAccountingPeriod(workingYearSettings(settings, selectedYear), getCurrentAnnoScout())
      const speseRes = await supabase.from('registro_spese').select('importo, tipo_movimento, metodo, riferimento_censimento_anno, voce_spesa')
        .gte('data', period.startDate).lte('data', period.endDate)
      if (speseRes.error || !speseRes.data) return
      const balances = calculateAccountingBalances(speseRes.data, period.initialCash, period.initialBank, settings.get(CENSUS_INCOME_SETTING) === 'true')
      const cassa = balances.saldoFinaleCassa
      const banca = balances.saldoFinaleBanca
      setSaldi({ cassa, banca })
    }

    fetchSaldi()

    const channel = supabase
      .channel('appshell_cassa_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_spese' }, () => {
        fetchSaldi()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impostazioni' }, fetchSaldi)
      .subscribe()

    window.addEventListener('focus', fetchSaldi)
    window.addEventListener('accounting-settings-changed', fetchSaldi)
    return () => {
      window.removeEventListener('focus', fetchSaldi)
      window.removeEventListener('accounting-settings-changed', fetchSaldi)
      supabase.removeChannel(channel)
    }
  }, [pathname, selectedYear])

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
        { name: 'Salda Ora (Pendenze)', href: '/salda-ora', icon: CheckCircle2 },
        { name: 'Cassa & Spese', href: '/cassa', icon: Wallet },
        { name: 'Archivio Scontrini e File', href: '/cassa/archivio', icon: FolderArchive },
        { name: 'Scansione Scontrini OCR', href: '/cassa/ocr', icon: ScanLine },
        { name: 'Quote Mensili', href: '/quote-mensili', icon: FileSpreadsheet },
        { name: 'Ricevute pagamenti', href: '/ricevute', icon: FileCheck },
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
        ...(canManageSettings ? [{ name: 'Impostazioni', href: '/impostazioni', icon: Settings }] : []),
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
        <div className={cn("flex shrink-0 items-center border-b border-agesci-blue-light/60 bg-agesci-blue", collapsed ? "flex-col gap-1 px-2 py-2" : "h-16 justify-between gap-2 px-4")}>
          <Link href="/" className="flex shrink-0 items-center gap-3">
            {collapsed ? (
              <ScoutMasterLogo className="h-8 w-8" variant="icon" theme="dark" />
            ) : (
              <ScoutMasterLogo className="h-9 w-auto" variant="full" theme="dark" />
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-agesci-blue-light/80 transition-colors"
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
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative",
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
        <div className="shrink-0 border-t border-agesci-blue-light/60">
          {!collapsed && <p className="px-6 pt-3 text-sm font-semibold text-white break-words">Ciao, {userName} 👋</p>}
          <LogoutButton collapsed={collapsed} />
        </div>
        {!collapsed && (
          <div className="p-3 border-t border-agesci-blue-light/60 bg-agesci-blue text-xs text-slate-300/70 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-scout-gold" />
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
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white px-4 md:px-6 shadow-2xs">
          {/* Mobile Left Logo & Toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 touch-min flex items-center justify-center"
              aria-label="Apri Menu"
            >
              <Menu className="h-6 w-6 text-agesci-blue" />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <ScoutMasterLogo className="h-8 w-8" variant="icon" theme="light" />
            </Link>
          </div>

          {/* Center/Right Anno Scout Selector */}
          <div className="flex items-center gap-3 ml-auto md:ml-0">
            <div className="relative inline-flex items-center">
              <select aria-label="Anno scout di lavoro" title="Cambia anno scout" value={annoScout} className="text-agesci-blue font-semibold text-xs md:text-sm bg-slate-100 px-3 py-1.5 rounded-lg" onChange={event => {
                document.cookie = `${WORKING_YEAR_COOKIE}=${encodeURIComponent(event.target.value)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
                window.location.reload()
              }}>
                {availableYears.map(year => <option key={year} value={year}>Anno Scout {year.replace('-', '/')}</option>)}
              </select>
            </div>
          </div>

          {/* Indicatori Cassa Live (Mini-Widget con Icone Premium) */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/cassa" className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200/90 px-3 py-1.5 rounded-lg transition-colors text-xs shadow-2xs group">
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
            <p className="px-6 pt-3 text-sm font-semibold text-white break-words">Ciao, {userName} 👋</p>
            <LogoutButton />
            <div className="p-4 bg-agesci-blue-light/50 border-b border-agesci-blue-light space-y-2">
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Saldi Live</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-lg p-2.5 flex flex-col">
                  <span className="text-[10px] text-emerald-300 font-medium">Cassa Contanti</span>
                  <span className="text-sm font-bold text-emerald-200 tabular-nums">{formatCurrency(saldi.cassa)}</span>
                </div>
                <div className="bg-sky-950/60 border border-sky-500/30 rounded-lg p-2.5 flex flex-col">
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
                            "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors touch-min",
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
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 bg-white md:hidden shadow-lg">
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
          href="/salda-ora"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 touch-min transition-colors",
            pathname === '/salda-ora' ? "text-emerald-600 font-bold" : "text-slate-500 hover:text-emerald-600"
          )}
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span className="text-[10px] leading-none font-bold text-emerald-700">Salda Ora</span>
        </Link>

        <Link
          href="/cassa"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 touch-min transition-colors",
            pathname === '/cassa' ? "text-agesci-blue font-bold" : "text-slate-500 hover:text-agesci-blue"
          )}
        >
          <Wallet className="h-5 w-5" />
          <span className="text-[10px] leading-none">Cassa</span>
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

      <CassaBot key={selectedYear} />
      <Toaster richColors position="top-center" />
    </div>
  )
}
