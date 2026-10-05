import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settings as settingsApi } from '@/lib/api'
import type { UserSettings } from '@/types'

export function useCurrencyOrder(knownCurrencies: string[]) {
  const queryClient = useQueryClient()

  const { data: userSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getFullList<UserSettings>({}),
    select: (rows) => rows[0],
  })

  const savedOrder: string[] = userSettings?.currency_order ?? []

  const orderedCurrencies = [
    ...savedOrder.filter((c) => knownCurrencies.includes(c)),
    ...knownCurrencies.filter((c) => !savedOrder.includes(c)),
  ]

  const mutation = useMutation({
    mutationFn: (newOrder: string[]) => {
      if (userSettings?.id) {
        return settingsApi.update(userSettings.id, { currency_order: newOrder })
      }
      return settingsApi.create({ currency_order: newOrder })
    },
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const prev = queryClient.getQueryData<UserSettings[]>(['settings'])
      queryClient.setQueryData<UserSettings[]>(['settings'], (old) =>
        old?.map((s, i) => i === 0 ? { ...s, currency_order: newOrder } : s) ?? old
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['settings'], ctx.prev)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const reorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const next = [...orderedCurrencies]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    mutation.mutate(next)
  }

  return { orderedCurrencies, reorder }
}
