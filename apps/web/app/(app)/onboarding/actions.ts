'use server'

import { redirect } from 'next/navigation'
import { requireActor } from '@/lib/actor'
import { getEngine } from '@/lib/engine'

/**
 * 建档表单的提交动作。
 *
 * 整个函数只做「取表单值 → 调 PoolEngine.registerPerson → 跳转」，
 * 不做任何画像相关的判断——那正是 registerPerson 的签名本身在强制的事：
 * 它只接受 handle / displayName / campusId 三个字段，多一个字段都编译不过。
 */
export async function registerPerson(formData: FormData) {
  const actor = await requireActor()

  const handle = String(formData.get('handle') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const campusId = String(formData.get('campusId') ?? '').trim()

  if (!handle || !displayName || !campusId) {
    redirect('/onboarding?error=' + encodeURIComponent('三项都要填'))
  }

  try {
    await getEngine().registerPerson(actor, { handle, displayName, campusId })
  } catch (err) {
    // handle 唯一约束冲突是这里唯一常见的失败原因，翻译成人话；其余原样透出。
    const raw = err instanceof Error ? err.message : String(err)
    const message = raw.includes('person_handle_key') ? '这个 handle 已经被占用了，换一个' : raw
    redirect('/onboarding?error=' + encodeURIComponent(message))
  }

  redirect('/home')
}
