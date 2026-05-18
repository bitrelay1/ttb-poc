import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SinglePage from './SinglePage.jsx'

// Mock the API module so tests never make real network calls.
vi.mock('../api.js', () => ({
  verifyLabel: vi.fn(),
  finalizeLabel: vi.fn(),
}))

// Mock validateAppData so we can focus on result/disposition logic without
// having to fill out the entire form in every test.
vi.mock('../validateAppData.js', () => ({
  validateAppData: vi.fn(() => ({})),
  isValid: vi.fn(() => true),
}))

import { verifyLabel, finalizeLabel } from '../api.js'

const REVIEW_RESULT = {
  filename: 'label.jpg',
  overall: 'review',
  fields: [
    { field: 'abv', extracted: null, submitted: '45%', result: 'review', note: null },
  ],
}

const PASS_RESULT = {
  filename: 'label.jpg',
  overall: 'pass',
  fields: [
    { field: 'brand_name', extracted: "Stone's Throw", submitted: "Stone's Throw", result: 'pass', note: null },
  ],
}

function uploadFile() {
  // The file input is hidden — fireEvent.change bypasses the visibility check.
  const fileInput = document.querySelector('input[type="file"]')
  const file = new File(['x'], 'label.jpg', { type: 'image/jpeg' })
  fireEvent.change(fileInput, { target: { files: [file] } })
}

async function submitAndWait() {
  uploadFile()
  fireEvent.click(screen.getByRole('button', { name: /Verify Label/i }))
  await waitFor(() => screen.getByText(/Verification Results/i))
}

beforeEach(() => {
  vi.clearAllMocks()
  global.URL.createObjectURL = vi.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = vi.fn()
})

// ── Verify button state ───────────────────────────────────────────────────────

describe('SinglePage — Verify Label button', () => {
  it('is disabled before a file is selected', () => {
    render(<SinglePage />)
    expect(screen.getByRole('button', { name: /Verify Label/i })).toBeDisabled()
  })

  it('becomes enabled after a file is selected', () => {
    render(<SinglePage />)
    uploadFile()
    expect(screen.getByRole('button', { name: /Verify Label/i })).toBeEnabled()
  })
})

// ── Submit Record gating — the core workflow invariant ────────────────────────
//
// When the AI returns REVIEW for a field, the agent must choose a disposition
// (Accept / Fail / Need New Image) before the Submit Record button activates.
// This prevents accidental submission of unresolved labels to the audit log.

describe('SinglePage — Submit Record gating', () => {
  it('Submit Record is disabled while a REVIEW field has no disposition', async () => {
    verifyLabel.mockResolvedValueOnce(REVIEW_RESULT)
    render(<SinglePage />)
    await submitAndWait()

    const submitBtn = screen.getByRole('button', { name: /Submit Record/i })
    expect(submitBtn).toBeDisabled()
  })

  it('Submit Record becomes enabled after all REVIEW fields receive a disposition', async () => {
    verifyLabel.mockResolvedValueOnce(REVIEW_RESULT)
    render(<SinglePage />)
    await submitAndWait()

    // Accept disposition resolves the only REVIEW field
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Record/i })).toBeEnabled()
    })
  })

  it('Submit Record stays disabled if only some REVIEW fields are resolved', async () => {
    const multiReviewResult = {
      filename: 'label.jpg',
      overall: 'review',
      fields: [
        { field: 'abv', extracted: null, submitted: '45%', result: 'review', note: null },
        { field: 'net_contents', extracted: null, submitted: '750 mL', result: 'review', note: null },
      ],
    }
    verifyLabel.mockResolvedValueOnce(multiReviewResult)
    render(<SinglePage />)
    await submitAndWait()

    // Resolve only the first field's disposition buttons
    const acceptBtns = screen.getAllByRole('button', { name: /Accept/i })
    fireEvent.click(acceptBtns[0])

    // Still one unresolved field — button stays disabled
    expect(screen.getByRole('button', { name: /Submit Record/i })).toBeDisabled()
  })

  it('Submit Record is immediately enabled when all fields pass (no REVIEW)', async () => {
    verifyLabel.mockResolvedValueOnce(PASS_RESULT)
    render(<SinglePage />)
    await submitAndWait()

    expect(screen.getByRole('button', { name: /Submit Record/i })).toBeEnabled()
  })
})

// ── Verify error state ────────────────────────────────────────────────────────

describe('SinglePage — error handling', () => {
  it('shows an error message when the API call fails', async () => {
    verifyLabel.mockRejectedValueOnce(new Error('Network error'))
    render(<SinglePage />)
    uploadFile()
    fireEvent.click(screen.getByRole('button', { name: /Verify Label/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    })
  })
})
