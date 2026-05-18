import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AppForm, { EMPTY_APP_DATA } from './AppForm.jsx'

function renderForm(productType = 'distilled_spirits') {
  const value = { ...EMPTY_APP_DATA, product_type: productType }
  const onChange = () => {}
  return render(<AppForm value={value} onChange={onChange} />)
}

// ── Progressive disclosure — Age & Maturation section ─────────────────────────
//
// Per 27 CFR 5.74 and 5.66(f): Statement of Age and State of Distillation are
// Distilled Spirits-only fields. Showing them for Wine or Malt Beverage would
// confuse agents and produce spurious verification attempts.

describe('AppForm — Age & Maturation section visibility', () => {
  it('shows the Age & Maturation section for Distilled Spirits', () => {
    renderForm('distilled_spirits')
    expect(screen.getByText('Age & Maturation')).toBeInTheDocument()
    expect(screen.getByLabelText(/Statement of Age/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/State of Distillation/i)).toBeInTheDocument()
  })

  it('hides the Age & Maturation section for Wine', () => {
    renderForm('wine')
    expect(screen.queryByText('Age & Maturation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Statement of Age/i)).not.toBeInTheDocument()
  })

  it('hides the Age & Maturation section for Malt Beverage', () => {
    renderForm('malt_beverage')
    expect(screen.queryByText('Age & Maturation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/State of Distillation/i)).not.toBeInTheDocument()
  })

  it('shows Age & Maturation after switching from Wine to Distilled Spirits', () => {
    const value = { ...EMPTY_APP_DATA, product_type: 'wine' }
    let currentValue = value
    const { rerender } = render(
      <AppForm value={currentValue} onChange={(v) => { currentValue = v }} />
    )
    expect(screen.queryByText('Age & Maturation')).not.toBeInTheDocument()

    // Simulate parent updating product_type
    rerender(
      <AppForm
        value={{ ...currentValue, product_type: 'distilled_spirits' }}
        onChange={() => {}}
      />
    )
    expect(screen.getByText('Age & Maturation')).toBeInTheDocument()
  })
})

// ── Core fields always present ────────────────────────────────────────────────

describe('AppForm — core fields present for all product types', () => {
  const types = ['distilled_spirits', 'wine', 'malt_beverage']

  types.forEach((type) => {
    it(`shows all required fields for ${type}`, () => {
      renderForm(type)
      expect(screen.getByLabelText(/Brand Name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Class \/ Type/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Alcohol Content/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Net Contents/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Bottler \/ Producer Name/i)).toBeInTheDocument()
    })
  })
})
