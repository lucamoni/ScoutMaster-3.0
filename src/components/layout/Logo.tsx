import Image from 'next/image'

interface LogoProps {
  className?: string
  variant?: 'full' | 'icon' | 'badge'
  theme?: 'light' | 'dark'
}

export default function ScoutMasterLogo({ className = 'h-9 w-auto', variant = 'full', theme = 'light' }: LogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${className}`} aria-label="ScoutMaster">
      <Image src="/brand/scoutmaster-mark-v2.png" alt={variant === 'icon' ? 'ScoutMaster' : ''} width={256} height={256} className={`h-full w-auto shrink-0 object-contain ${theme === 'dark' ? 'rounded-md bg-white p-0.5' : ''}`} />
      {variant !== 'icon' && <span className={`text-base font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-agesci-blue'}`}>Scout<span className="font-medium">Master</span></span>}
    </span>
  )
}
