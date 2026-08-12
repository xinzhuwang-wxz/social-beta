'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Domain, Visibility } from '@pool/shared'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

function failWith(err: unknown): never {
  const message = err instanceof Error ? err.message : '操作失败，再试一次'
  redirect(`/me?error=${encodeURIComponent(message)}`)
}

/** 改一条切面的可见度。逐切面自控——运动切面可以公开，情感切面可以只给自己。 */
export async function setFacetVisibilityAction(domain: Domain, visibility: Visibility): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().setFacetVisibility(actor, domain, visibility)
  } catch (err) {
    failWith(err)
  }
  revalidatePath('/me')
}

/**
 * 删掉一条切面。
 *
 * 语义是「现在别显示」，不是「假装这些事没发生过」——删了之后如果那些
 * 池塘还在，下次蒸馏可能会基于同样的事实重新长出同一条画像。真正要
 * 「别再这么说我」，得去改可见度或者退出那些池塘。这句话由 UI 明说，
 * 不是靠用户自己猜。
 */
export async function deleteFacetAction(domain: Domain): Promise<void> {
  const actor = await requireActor()
  try {
    await getEngine().deleteFacet(actor, domain)
  } catch (err) {
    failWith(err)
  }
  revalidatePath('/me')
}
