export interface StyleChoice { id: string; variant: string }
export interface StyleSummary {
  id: string
  name: string
  uses: string[]
  direction: string | null
  family: string
  summary: string
  variants: { id: string; name: string }[]
  imagery: { id: string; name: string }[]
}
