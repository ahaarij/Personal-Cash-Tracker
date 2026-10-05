import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { useToast } from './ui/Toast'
import { categories as catCollection } from '@/lib/api'
import type { Category } from '@/types'

interface AddCategoryProps {
  open: boolean
  onClose: () => void
  editing?: Category | null
}

const COLOUR_OPTIONS = [
  { value: '--cat-food',       label: 'Orange',  hex: '#E86A2E' },
  { value: '--cat-transport',  label: 'Blue',    hex: '#1B4F8A' },
  { value: '--cat-shopping',   label: 'Purple',  hex: '#7C3AED' },
  { value: '--cat-health',     label: 'Green',   hex: '#156336' },
  { value: '--cat-home',       label: 'Teal',    hex: '#0E7490' },
  { value: '--cat-entertain',  label: 'Pink',    hex: '#BE185D' },
  { value: '--cat-travel',     label: 'Amber',   hex: '#B45309' },
  { value: '--cat-other',      label: 'Gray',    hex: '#6B6258' },
]

export function AddCategory({ open, onClose, editing }: AddCategoryProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [colour, setColour] = useState(COLOUR_OPTIONS[0].value)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setColour(editing?.colour ?? COLOUR_OPTIONS[0].value)
      setNameError('')
    }
  }, [open, editing])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) { setNameError('Enter a category name.'); throw new Error('Validation failed') }
      const data = { name: name.trim(), colour, archived: false }
      if (editing) return catCollection.update(editing.id, data)
      return catCollection.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.show({ type: 'success', message: editing ? 'Category updated.' : 'Category added.' })
      onClose()
    },
    onError: (e: Error) => {
      if (e.message !== 'Validation failed')
        toast.show({ type: 'error', message: 'Could not save category.' })
    },
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label="Name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError('') }}
          error={nameError}
          placeholder="e.g. Food & Dining"
          autoFocus
        />
        <div>
          <div className="field__label" style={{ marginBottom: '8px' }}>Colour</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {COLOUR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                onClick={() => setColour(opt.value)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: opt.hex, border: colour === opt.value ? '3px solid var(--color-text)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'border 120ms',
                }}
                aria-pressed={colour === opt.value}
                aria-label={opt.label}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
