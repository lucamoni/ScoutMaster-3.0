import { redirect } from 'next/navigation'

export default function OCRScannerPage() {
  redirect('/cassa?scan=true')
}
