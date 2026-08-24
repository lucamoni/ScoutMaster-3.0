# Implementation Plan: Global Graphic & UX Refactoring for ScoutMaster 3.0

Complete UI/UX redesign and refactoring of ScoutMaster 3.0 to align with modern software management standards (Linear / Apple Dashboard aesthetics) and official AGESCI visual identity (agesci.it). The goal is an elegant, ultra-scannable, high-performance interface optimized for both desktop management and outdoor field use on mobile.

---

## User Review Required

> [!IMPORTANT]
> **Design Tokens & Theme Customization**
> - The new color palette uses official AGESCI Navy (`#002B49`), Navy Light (`#0B3B60`), Scout Gold (`#FFB81C`), E/G Branch Green (`#2E7D32`), high-contrast Surface Slate (`#F8FAFC`), and clean card backgrounds with subtle borders and shadows.
> - Typography is updated to use **Inter** (and/or **Outfit**) with `tabular-nums` for all monetary amounts and table matrices.

> [!NOTE]
> **Navigation & Mobile Layout Overhaul**
> - **Desktop AppShell**: Collapsible dark navy sidebar with 3 logical sections (**VITA DI REPARTO**, **AMMINISTRAZIONE**, **STRUMENTI**), sticky header featuring logo with Lily ⚜️ emblem, rapid Anno Scout selector pill (`⚜️ 2025/2026 ▼`), and live cash/bank balance widgets (`💵 Cassa` / `🏦 Banca`).
> - **Mobile Bottom Nav (< 768px)**: 4 fixed key buttons (**Presenze**, **Cassa Rapida**, **Ragazzi**, **Menu Drawer**), 44px+ touch targets, sticky first column ("Nome Ragazzo") for horizontal table scrolling.

---

## Proposed Changes

### 1. Design System & Theme Configuration

#### [MODIFY] [globals.css](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/globals.css)
- Add AGESCI color tokens (`agesci-blue`, `agesci-blue-light`, `scout-gold`, `branch-eg`, `surface-bg`, `surface-card`).
- Import Google Fonts (Inter & Outfit).
- Define utility classes for `tabular-nums`, glassmorphism, sticky table headers, badge pills, and smooth transitions.

#### [NEW] [tailwind.config.ts](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/tailwind.config.ts)
- Configure Tailwind CSS theme extensions matching the AGESCI design system tokens.

---

### 2. App Layout & Shell Component

#### [MODIFY] [AppShell.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/components/layout/AppShell.tsx)
- Re-architect header and sidebar into a modern Linear/Apple Dashboard shell:
  - **Header**: Sticky/Floating topbar with Lily logo ⚜️, central Anno Scout selector (`⚜️ 2025/2026 ▼`), and live balance badges (`💵 Cassa: € X.XXX,XX`, `🏦 Banca: € X.XXX,XX`).
  - **Sidebar**: Dark navy theme (`bg-[#002B49]`), collapsible state, organized in 3 uppercase section headers:
    1. **VITA DI REPARTO**: Anagrafica, Uscite & Eventi, Sentiero/Specialità, BuonaCaccia
    2. **AMMINISTRAZIONE**: Cassa & Spese, Quote Mensili, Censimento, Panoramica Mancanti
    3. **STRUMENTI**: Bilancio AGESCI, Link Utili & Privacy, Impostazioni
  - **Mobile (< 768px)**: Bottom navigation bar with 4 key actions (`Presenze`, `Cassa Rapida`, `Ragazzi`, `Menu Drawer`) + full slide-over menu sheet.

---

### 3. Bento Grid Dashboard & Overview Pages

#### [NEW] [page.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/panoramica/page.tsx)
- Create `/panoramica` route handler feeding initial data to `PanoramicaClient.tsx`.

#### [MODIFY] [PanoramicaClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/panoramica/components/PanoramicaClient.tsx)
- Refactor dashboard into a Bento Grid layout:
  - **Widget Prossima Uscita / Evento**: Countdown, date, venue, attendee counter badge.
  - **Widget Stato Quote & Debiti**: Progress bar percentage, outstanding balances, quick-action WhatsApp reminder button (`[ 💬 Contatta Genitore ]`).
  - **Widget Cassa & Banca**: Financial summary with live breakdown.
  - **Data-Table**: Modern data table styling with sticky headers (`bg-slate-50 text-xs font-semibold uppercase tracking-wider`), zebra hover rows (`hover:bg-blue-50/40`), and attendance pills (🟢 Presente, 🟡 Pendolare, 🔴 Assente).

---

### 4. Technical Explorer Notebook Card ("Taccuino Tecnico")

#### [MODIFY] [AnagraficaClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/components/AnagraficaClient.tsx)
- Update explorer detail view into an AGESCI "Taccuino Tecnico":
  - Profile header card featuring embroidered Squadriglia badge with custom colors and insignia.
  - Tabbed interface:
    1. **Dati Anagrafici & Sanitari**
    2. **Progressione Personale & Specialità** (Sentiero / Tappe)
    3. **Storico Pagamenti & Eventi**
  - Prominent parent contact quick-action button: `[ 💬 Contatta Genitore su WhatsApp ]` with pre-populated message template.

---

### 5. Table & Form Components (Uscite, Quote, Cassa, Censimento, BuonaCaccia)

#### [MODIFY] [UsciteClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/uscite/components/UsciteClient.tsx)
- Modern Data-Table styling with rounded pill badges for attendance (🟢 Presente, 🟡 Pendolare, 🔴 Assente).
- Payment method badges (🏦 Bonifico in blue, 💵 Contanti in green).
- Mobile sticky first column ("Nome Ragazzo") and touch-friendly controls (min 44px height).

#### [MODIFY] [QuoteClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/quote-mensili/components/QuoteClient.tsx)
- Apply tabular-nums, sticky headers, and AGESCI design system tokens.

#### [MODIFY] [CassaClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/cassa/components/CassaClient.tsx)
- Refactor transactions list and financial summaries with AGESCI Navy, Gold, and E/G Green accents.

#### [NEW] [page.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/buonacaccia/page.tsx)
- Ensure `/buonacaccia` route server page is properly configured.

#### [MODIFY] [BuonacacciaClient.tsx](file:///Users/lmoni/Library/Mobile%20Documents/com~apple~CloudDocs/Documents/Documenti%20-%20MacBook%20Pro%20di%20Luca/SCOUT/ScoutMaster%203.0/src/app/(dashboard)/buonacaccia/components/BuonacacciaClient.tsx)
- Align click-day cards and alerts with `scout-gold` accent badges and AGESCI design tokens.

---

## Verification Plan

### Automated Tests
- Run Next.js TypeScript check and build check:
  `npm run build` or `npx tsc --noEmit` to ensure zero compilation or type errors.

### Manual Verification
- **Visual & Theme Audit**: Verify AGESCI colors (`#002B49`, `#0B3B60`, `#FFB81C`, `#2E7D32`), card contrast, typography, and `tabular-nums` formatting across all pages.
- **Desktop Sidebar & Topbar**: Verify collapsible navigation, grouped sections, live cash/bank balance widgets, and Anno Scout selector.
- **Bento Grid Dashboard**: Check widgets for next event, fee progress bar, and quick WhatsApp action buttons.
- **Taccuino Tecnico Explorer Cards**: Verify squadriglia badges, tabbed navigation, and WhatsApp pre-filled link.
- **Mobile View (< 768px)**: Verify bottom 4-tab bar, slide-over menu drawer, sticky first table column, and touch-target sizing.
