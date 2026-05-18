import { describe, it, expect } from 'vitest'
import { validateAppData, isValid } from './validateAppData.js'

// ── isValid helper ────────────────────────────────────────────────────────────

describe('isValid', () => {
  it('returns true for empty errors object', () => {
    expect(isValid({})).toBe(true)
  })

  it('returns false when any error is present', () => {
    expect(isValid({ brand_name: 'Brand name is required.' })).toBe(false)
  })
})

// ── Required fields ───────────────────────────────────────────────────────────

describe('validateAppData — required fields', () => {
  it('flags missing brand_name', () => {
    const errors = validateAppData({ brand_name: '' })
    expect(errors.brand_name).toBeTruthy()
  })

  it('flags missing class_type', () => {
    const errors = validateAppData({ brand_name: 'Test', class_type: '' })
    expect(errors.class_type).toBeTruthy()
  })

  it('flags missing bottler_name', () => {
    const errors = validateAppData({ bottler_name: '' })
    expect(errors.bottler_name).toBeTruthy()
  })

  it('flags missing bottler_city', () => {
    const errors = validateAppData({ bottler_city: '' })
    expect(errors.bottler_city).toBeTruthy()
  })

  it('flags missing bottler_state', () => {
    const errors = validateAppData({ bottler_state: '' })
    expect(errors.bottler_state).toBeTruthy()
  })

  it('whitespace-only brand name is treated as missing', () => {
    const errors = validateAppData({ brand_name: '   ' })
    expect(errors.brand_name).toBeTruthy()
  })
})

// ── ABV validation ────────────────────────────────────────────────────────────

describe('validateAppData — ABV', () => {
  it('accepts a valid ABV string produced by the form', () => {
    const errors = validateAppData({ abv: '45% Alc./Vol. (90 Proof)' })
    expect(errors.abv).toBeUndefined()
  })

  it('accepts minimum valid ABV (0.5%)', () => {
    const errors = validateAppData({ abv: '0.5% Alc./Vol. (1 Proof)' })
    expect(errors.abv).toBeUndefined()
  })

  it('accepts maximum valid ABV (95%)', () => {
    const errors = validateAppData({ abv: '95% Alc./Vol. (190 Proof)' })
    expect(errors.abv).toBeUndefined()
  })

  it('flags ABV below 0.5%', () => {
    const errors = validateAppData({ abv: '0.4% Alc./Vol.' })
    expect(errors.abv).toBeTruthy()
  })

  it('flags ABV above 95%', () => {
    const errors = validateAppData({ abv: '96% Alc./Vol.' })
    expect(errors.abv).toBeTruthy()
  })

  it('flags non-numeric ABV', () => {
    const errors = validateAppData({ abv: 'forty-five percent' })
    expect(errors.abv).toBeTruthy()
  })

  it('flags empty ABV', () => {
    const errors = validateAppData({ abv: '' })
    expect(errors.abv).toBeTruthy()
  })
})

// ── Net contents validation ───────────────────────────────────────────────────

describe('validateAppData — net contents', () => {
  it('accepts a standard mL value', () => {
    const errors = validateAppData({ net_contents: '750 mL' })
    expect(errors.net_contents).toBeUndefined()
  })

  it('accepts a litre value and converts for range check', () => {
    // 1.75 L = 1750 mL — within the 1–20000 mL range
    const errors = validateAppData({ net_contents: '1.75 L' })
    expect(errors.net_contents).toBeUndefined()
  })

  it('accepts case-insensitive unit (l lowercase)', () => {
    const errors = validateAppData({ net_contents: '1.75 l' })
    expect(errors.net_contents).toBeUndefined()
  })

  it('flags value with no unit', () => {
    const errors = validateAppData({ net_contents: '750' })
    expect(errors.net_contents).toBeTruthy()
  })

  it('flags 0 mL (below 1 mL minimum)', () => {
    const errors = validateAppData({ net_contents: '0 mL' })
    expect(errors.net_contents).toBeTruthy()
  })

  it('flags value exceeding 20 L', () => {
    // 21 L = 21000 mL > 20000 mL limit
    const errors = validateAppData({ net_contents: '21 L' })
    expect(errors.net_contents).toBeTruthy()
  })

  it('flags empty net contents', () => {
    const errors = validateAppData({ net_contents: '' })
    expect(errors.net_contents).toBeTruthy()
  })
})

// ── ZIP code validation ───────────────────────────────────────────────────────

describe('validateAppData — ZIP code', () => {
  it('accepts a valid 5-digit ZIP', () => {
    const errors = validateAppData({ bottler_zip: '40202' })
    expect(errors.bottler_zip).toBeUndefined()
  })

  it('allows absent ZIP (field is optional)', () => {
    const errors = validateAppData({})
    expect(errors.bottler_zip).toBeUndefined()
  })

  it('allows empty-string ZIP (field is optional)', () => {
    const errors = validateAppData({ bottler_zip: '' })
    expect(errors.bottler_zip).toBeUndefined()
  })

  it('flags 4-digit ZIP', () => {
    const errors = validateAppData({ bottler_zip: '4020' })
    expect(errors.bottler_zip).toBeTruthy()
  })

  it('flags 6-digit ZIP', () => {
    const errors = validateAppData({ bottler_zip: '402020' })
    expect(errors.bottler_zip).toBeTruthy()
  })

  it('flags ZIP with letters', () => {
    const errors = validateAppData({ bottler_zip: '4020X' })
    expect(errors.bottler_zip).toBeTruthy()
  })
})

// ── Full valid payload produces no errors ─────────────────────────────────────

describe('validateAppData — complete valid payload', () => {
  it('returns no errors for a fully populated form', () => {
    const data = {
      brand_name: "Stone's Throw",
      class_type: 'Kentucky Straight Bourbon Whiskey',
      abv: '45% Alc./Vol. (90 Proof)',
      net_contents: '750 mL',
      bottler_name: "Stone's Throw Distillery",
      bottler_city: 'Louisville',
      bottler_state: 'KY',
      bottler_zip: '40202',
    }
    expect(isValid(validateAppData(data))).toBe(true)
  })
})
