'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionContextValue {
  openItems: string[]
  toggleItem: (value: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue>({
  openItems: [],
  toggleItem: () => {},
})

export function Accordion({
  children,
  type = 'multiple',
  className,
  defaultValue = [],
}: {
  children: React.ReactNode
  type?: 'single' | 'multiple'
  className?: string
  defaultValue?: string | string[]
}) {
  const [openItems, setOpenItems] = React.useState<string[]>(
    Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []
  )

  const toggleItem = (val: string) => {
    if (type === 'single') {
      setOpenItems(prev => (prev.includes(val) ? [] : [val]))
    } else {
      setOpenItems(prev => (prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]))
    }
  }

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem }}>
      <div className={cn('space-y-2', className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

const ItemContext = React.createContext<{ value: string }>({ value: '' })

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <ItemContext.Provider value={{ value }}>
      <div className={cn('border rounded-xl bg-white overflow-hidden', className)}>{children}</div>
    </ItemContext.Provider>
  )
}

export function AccordionTrigger({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { openItems, toggleItem } = React.useContext(AccordionContext)
  const { value } = React.useContext(ItemContext)
  const isOpen = openItems.includes(value)

  return (
    <button
      type="button"
      onClick={() => toggleItem(value)}
      className={cn(
        'flex w-full items-center justify-between py-3 px-4 text-left font-medium transition-all hover:bg-slate-50/80',
        className
      )}
    >
      <div className="flex-1">{children}</div>
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200', isOpen && 'rotate-180')}
      />
    </button>
  )
}

export function AccordionContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { openItems } = React.useContext(AccordionContext)
  const { value } = React.useContext(ItemContext)
  const isOpen = openItems.includes(value)

  if (!isOpen) return null

  return <div className={cn('px-4 py-3 text-sm border-t border-slate-100', className)}>{children}</div>
}
