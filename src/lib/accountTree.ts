import type { Account } from '@/types/erp'

export interface AccountSelectOption {
  id: string
  label: string
  /** Parent accounts (and inactive accounts) are non-selectable — rendered bold. */
  disabled?: boolean
  /** Tree depth used to indent the option. */
  indent?: number
}

/**
 * Flattens the chart-of-accounts tree for searchable account selects.
 * Parent accounts and inactive accounts are marked `disabled` (bold +
 * non-selectable); leaf accounts are selectable. Inactive accounts are
 * suffixed "(inactive)" so an existing profile/tax still shows its value.
 * Pass `labelBuilder` to customise the label (e.g. append the account type).
 */
export function buildAccountHierarchyOptions(
  accounts: Account[],
  labelBuilder?: (a: Account) => string,
): AccountSelectOption[] {
  const childrenOf = new Map<number | null, Account[]>()
  for (const a of accounts) {
    const key = a.parentId
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(a)
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.code.localeCompare(b.code))
  const hasChildren = (id: number) => (childrenOf.get(id)?.length || 0) > 0
  const out: AccountSelectOption[] = []
  const walk = (parentId: number | null, depth: number) => {
    for (const a of childrenOf.get(parentId) || []) {
      const isParent = hasChildren(a.id)
      out.push({
        id: a.code,
        label: labelBuilder ? labelBuilder(a) : `${a.code} — ${a.name}${!a.isActive ? ' (inactive)' : ''}`,
        disabled: isParent || !a.isActive,
        indent: depth,
      })
      if (isParent) walk(a.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
