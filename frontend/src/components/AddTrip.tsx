import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { useToast } from './ui/Toast'
import { trips as tripsCollection } from '@/lib/api'
import { todayISO } from '@/lib/money'
import type { Trip } from '@/types'

interface AddTripProps {
  open: boolean
  onClose: () => void
  editing?: Trip | null
}

export function AddTrip({ open, onClose, editing }: AddTripProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setStartDate(editing?.start_date ?? todayISO())
      setEndDate(editing?.end_date ?? todayISO())
      setErrors({})
    }
  }, [open, editing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {}
      if (!name.trim()) next.name = 'Enter a trip name.'
      if (!startDate) next.startDate = 'Select a start date.'
      if (!endDate) next.endDate = 'Select an end date.'
      if (startDate && endDate && endDate < startDate) next.endDate = 'End date must be after start date.'
      if (Object.keys(next).length) { setErrors(next); throw new Error('Validation failed') }

      const data = { name: name.trim(), start_date: startDate, end_date: endDate }
      if (editing) return tripsCollection.update(editing.id, data)
      return tripsCollection.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      toast.show({ type: 'success', message: editing ? 'Trip updated.' : 'Trip added.' })
      onClose()
    },
    onError: (e: Error) => {
      if (e.message !== 'Validation failed')
        toast.show({ type: 'error', message: 'Could not save trip.' })
    },
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit trip' : 'Add trip'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label="Trip name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }}
          error={errors.name}
          placeholder="e.g. Dubai Holiday"
          autoFocus
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setErrors((p) => ({ ...p, startDate: '' })) }}
            error={errors.startDate}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setErrors((p) => ({ ...p, endDate: '' })) }}
            error={errors.endDate}
          />
        </div>
      </div>
    </Dialog>
  )
}
