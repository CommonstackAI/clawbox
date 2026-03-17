import '@/i18n'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SoulIconPicker } from '@/components/soul/SoulIconPicker'

describe('SoulIconPicker', () => {
  it('renders the selected icon and emits stable icon keys', () => {
    const onChange = vi.fn()

    render(<SoulIconPicker value="palette" onChange={onChange} />)

    expect(screen.getByRole('button', { name: /creative/i })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /creative/i }))
    expect(onChange).toHaveBeenCalledWith('palette')
  })
})
