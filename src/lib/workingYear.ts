import { cookies } from 'next/headers'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { WORKING_YEAR_COOKIE, validWorkingYear } from '@/lib/utils/workingYear'

export async function getWorkingYear(configured?: string | null) {
  return validWorkingYear((await cookies()).get(WORKING_YEAR_COOKIE)?.value) || validWorkingYear(configured) || getCurrentAnnoScout()
}
