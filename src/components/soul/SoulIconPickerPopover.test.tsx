import '@/i18n'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SoulIconPickerPopover } from '@/components/soul/SoulIconPickerPopover'

describe('SoulIconPickerPopover', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the icon panel hidden until the trigger is clicked', () => {
    const onChange = vi.fn()

    render(<SoulIconPickerPopover value="palette" onChange={onChange} />)

    expect(screen.queryByRole('group', { name: /template icon/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /template icon/i }))

    expect(screen.getByRole('group', { name: /template icon/i })).toBeInTheDocument()
  })

  it('closes the panel after selecting an icon', () => {
    const onChange = vi.fn()

    render(<SoulIconPickerPopover value="palette" onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: /template icon/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /creative/i }))

    expect(onChange).toHaveBeenCalledWith('palette')
    expect(screen.queryByRole('group', { name: /template icon/i })).not.toBeInTheDocument()
  })
})
