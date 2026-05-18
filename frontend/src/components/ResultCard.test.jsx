import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ResultCard from './ResultCard.jsx'

const PASS_RESULT = {
  overall: 'pass',
  fields: [
    { field: 'brand_name', extracted: "Stone's Throw", submitted: "Stone's Throw", result: 'pass', note: null },
    { field: 'government_warning', extracted: 'GOVERNMENT WARNING: ...', submitted: 'GOVERNMENT WARNING: ...', result: 'pass', note: null },
  ],
}

const REVIEW_RESULT = {
  overall: 'review',
  fields: [
    { field: 'brand_name', extracted: "Stone's Throw", submitted: "Stone's Throw", result: 'pass', note: null },
    { field: 'abv', extracted: null, submitted: '45% Alc./Vol. (90 Proof)', result: 'review', note: null },
  ],
}

const FAIL_RESULT = {
  overall: 'fail',
  fields: [
    { field: 'government_warning', extracted: 'Government Warning:', submitted: 'GOVERNMENT WARNING:', result: 'fail', note: null },
  ],
}

// ── Overall banner ────────────────────────────────────────────────────────────

describe('ResultCard — overall banner', () => {
  it('shows PASS banner for a passing result', () => {
    render(<ResultCard result={PASS_RESULT} />)
    expect(screen.getByRole('status')).toHaveTextContent('PASS')
  })

  it('shows FAIL banner for a failing result', () => {
    render(<ResultCard result={FAIL_RESULT} />)
    expect(screen.getByRole('status')).toHaveTextContent('FAIL')
  })

  it('shows REVIEW banner when any field needs review', () => {
    render(<ResultCard result={REVIEW_RESULT} />)
    expect(screen.getByRole('status')).toHaveTextContent('REVIEW')
  })
})

// ── REVIEW field disposition controls ────────────────────────────────────────
//
// When overrides prop is provided, REVIEW fields show Accept / Fail / Need New Image
// buttons. Agents must select one before the Submit Record button becomes active.

describe('ResultCard — REVIEW disposition controls', () => {
  it('shows disposition buttons for a REVIEW field when overrides prop is provided', () => {
    render(
      <ResultCard
        result={REVIEW_RESULT}
        overrides={{}}
        onOverrideChange={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Accept/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fail/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Need New Image/i })).toBeInTheDocument()
  })

  it('does NOT show disposition buttons when overrides prop is omitted (read-only view)', () => {
    render(<ResultCard result={REVIEW_RESULT} />)
    expect(screen.queryByRole('button', { name: /Accept/i })).not.toBeInTheDocument()
  })

  it('does NOT show disposition buttons for PASS fields', () => {
    render(
      <ResultCard
        result={PASS_RESULT}
        overrides={{}}
        onOverrideChange={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: /Accept/i })).not.toBeInTheDocument()
  })

  it('calls onOverrideChange with correct field and disposition when Accept is clicked', () => {
    const onOverrideChange = vi.fn()
    render(
      <ResultCard
        result={REVIEW_RESULT}
        overrides={{}}
        onOverrideChange={onOverrideChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }))
    expect(onOverrideChange).toHaveBeenCalledWith('abv', expect.objectContaining({ disposition: 'accept' }))
  })

  it('calls onOverrideChange with fail disposition when Fail is clicked', () => {
    const onOverrideChange = vi.fn()
    render(
      <ResultCard
        result={REVIEW_RESULT}
        overrides={{}}
        onOverrideChange={onOverrideChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Fail/i }))
    expect(onOverrideChange).toHaveBeenCalledWith('abv', expect.objectContaining({ disposition: 'fail' }))
  })

  it('marks the selected disposition button as pressed via aria-pressed', () => {
    render(
      <ResultCard
        result={REVIEW_RESULT}
        overrides={{ abv: { disposition: 'accept', note: '' } }}
        onOverrideChange={() => {}}
      />
    )
    const acceptBtn = screen.getByRole('button', { name: /Accept/i })
    const failBtn = screen.getByRole('button', { name: /Fail/i })
    expect(acceptBtn).toHaveAttribute('aria-pressed', 'true')
    expect(failBtn).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── Field-by-field table ──────────────────────────────────────────────────────

describe('ResultCard — field table', () => {
  it('renders one row per field', () => {
    render(<ResultCard result={PASS_RESULT} />)
    // Two fields → two rows (thead adds 1, tbody should have 2)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBe(3) // 1 header + 2 data
  })

  it('shows extracted value in the table', () => {
    render(<ResultCard result={PASS_RESULT} />)
    expect(screen.getAllByText("Stone's Throw").length).toBeGreaterThan(0)
  })

  it('shows dash for null extracted value', () => {
    render(<ResultCard result={REVIEW_RESULT} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
