import type { FacetView } from '@pool/engine'
import type { Domain, Visibility } from '@pool/shared'
import { FacetCard } from './facet-card'

/** 我的切面列表——逐条可溯源、可改可见度、可删。 */
export function FacetList({
  facets,
  setVisibilityAction,
  deleteAction,
}: {
  facets: FacetView[]
  setVisibilityAction: (domain: Domain, visibility: Visibility) => Promise<void>
  deleteAction: (domain: Domain) => Promise<void>
}) {
  return (
    <ul className="flex flex-col gap-4">
      {facets.map((facet) => (
        <li key={facet.domain}>
          <FacetCard facet={facet} setVisibilityAction={setVisibilityAction} deleteAction={deleteAction} />
        </li>
      ))}
    </ul>
  )
}
