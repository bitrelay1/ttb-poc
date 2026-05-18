import { useState } from 'react';
import { validateAppData } from '../validateAppData.js';

const PRODUCT_TYPE_OPTIONS = [
  { value: 'distilled_spirits', label: 'Distilled Spirits' },
  { value: 'wine', label: 'Wine' },
  { value: 'malt_beverage', label: 'Malt Beverage' },
];

const CLASS_TYPE_OPTIONS = [
  'Kentucky Straight Bourbon Whiskey',
  'Straight Bourbon Whiskey',
  'Blended Bourbon Whiskey',
  'Tennessee Whiskey',
  'Straight Rye Whiskey',
  'Straight Malt Whiskey',
  'Straight Wheat Whiskey',
  'Blended Whiskey',
  'Blended Rye Whiskey',
  'Light Whiskey',
  'Scotch Whisky',
  'Single Malt Scotch Whisky',
  'Blended Scotch Whisky',
  'Irish Whiskey',
  'Canadian Whisky',
  'Vodka',
  'Gin',
  'Distilled Gin',
  'London Dry Gin',
  'Rum',
  'Tequila',
  'Blanco Tequila',
  'Reposado Tequila',
  'Añejo Tequila',
  'Mezcal',
  'Brandy',
  'American Brandy',
  'Cognac',
  'Armagnac',
  'Grappa',
  'Calvados',
  'Fruit Brandy',
  'Pisco',
  'Table Wine',
  'Red Wine',
  'White Wine',
  'Rosé Wine',
  'Sparkling Wine',
  'Champagne',
  'Dessert Wine',
  'Ale',
  'Lager',
  'Stout',
  'Porter',
  'IPA',
  'Wheat Beer',
];

const COUNTRY_OPTIONS = [
  'United States',
  'Canada',
  'Scotland',
  'Ireland',
  'France',
  'Mexico',
  'Japan',
  'Spain',
  'Italy',
  'Germany',
  'Portugal',
  'Peru',
  'Chile',
  'Australia',
];

const US_STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DC', name: 'District of Columbia' },
  { abbr: 'DE', name: 'Delaware' }, { abbr: 'FL', name: 'Florida' },
  { abbr: 'GA', name: 'Georgia' }, { abbr: 'HI', name: 'Hawaii' },
  { abbr: 'ID', name: 'Idaho' }, { abbr: 'IL', name: 'Illinois' },
  { abbr: 'IN', name: 'Indiana' }, { abbr: 'IA', name: 'Iowa' },
  { abbr: 'KS', name: 'Kansas' }, { abbr: 'KY', name: 'Kentucky' },
  { abbr: 'LA', name: 'Louisiana' }, { abbr: 'ME', name: 'Maine' },
  { abbr: 'MD', name: 'Maryland' }, { abbr: 'MA', name: 'Massachusetts' },
  { abbr: 'MI', name: 'Michigan' }, { abbr: 'MN', name: 'Minnesota' },
  { abbr: 'MS', name: 'Mississippi' }, { abbr: 'MO', name: 'Missouri' },
  { abbr: 'MT', name: 'Montana' }, { abbr: 'NE', name: 'Nebraska' },
  { abbr: 'NV', name: 'Nevada' }, { abbr: 'NH', name: 'New Hampshire' },
  { abbr: 'NJ', name: 'New Jersey' }, { abbr: 'NM', name: 'New Mexico' },
  { abbr: 'NY', name: 'New York' }, { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'ND', name: 'North Dakota' }, { abbr: 'OH', name: 'Ohio' },
  { abbr: 'OK', name: 'Oklahoma' }, { abbr: 'OR', name: 'Oregon' },
  { abbr: 'PA', name: 'Pennsylvania' }, { abbr: 'RI', name: 'Rhode Island' },
  { abbr: 'SC', name: 'South Carolina' }, { abbr: 'SD', name: 'South Dakota' },
  { abbr: 'TN', name: 'Tennessee' }, { abbr: 'TX', name: 'Texas' },
  { abbr: 'UT', name: 'Utah' }, { abbr: 'VT', name: 'Vermont' },
  { abbr: 'VA', name: 'Virginia' }, { abbr: 'WA', name: 'Washington' },
  { abbr: 'WV', name: 'West Virginia' }, { abbr: 'WI', name: 'Wisconsin' },
  { abbr: 'WY', name: 'Wyoming' },
];

// ── ABV split input ──────────────────────────────────────────────────────────
function AbvInput({ id, value, onChange, onBlur, hasError, inputRef }) {
  const pct = value?.match(/^([\d.]+)/)?.[1] ?? '';
  const proofNum = pct !== '' ? Math.round(parseFloat(pct) * 2) : null;
  const proofDisplay = proofNum !== null && !isNaN(proofNum) ? `(${proofNum} Proof)` : null;

  const handleChange = (e) => {
    const p = e.target.value;
    if (!p) { onChange(''); return; }
    const proof = Math.round(parseFloat(p) * 2);
    onChange(isNaN(proof) ? `${p}% Alc./Vol.` : `${p}% Alc./Vol. (${proof} Proof)`);
  };

  return (
    <div className="split-input">
      <input
        ref={inputRef}
        type="number"
        id={id}
        value={pct}
        onChange={handleChange}
        onBlur={onBlur}
        min="0.5"
        max="95"
        step="0.1"
        placeholder="45"
        className={`input abv-pct${hasError ? ' input-error' : ''}`}
        aria-describedby={hasError ? `${id}-error` : undefined}
      />
      <span className="unit-label">% Alc./Vol.</span>
      {proofDisplay && <span className="proof-hint">{proofDisplay}</span>}
    </div>
  );
}

// ── Net contents split input ─────────────────────────────────────────────────
function NetContentsInput({ id, value, onChange, onBlur, hasError, inputRef }) {
  const m = value?.match(/^([\d.]+)\s*(mL|L)$/i);
  const numVal = m ? m[1] : (value?.match(/^([\d.]+)/)?.[1] ?? '');
  const unit   = m ? (m[2] === 'L' ? 'L' : 'mL') : 'mL';

  const emit = (num, u) => onChange(num ? `${num} ${u}` : '');

  return (
    <div className="split-input">
      <input
        ref={inputRef}
        type="number"
        id={id}
        value={numVal}
        onChange={(e) => emit(e.target.value, unit)}
        onBlur={onBlur}
        min="0"
        step="0.01"
        placeholder="750"
        className={`input${hasError ? ' input-error' : ''}`}
        aria-describedby={hasError ? `${id}-error` : undefined}
      />
      <select
        value={unit}
        onChange={(e) => emit(numVal, e.target.value)}
        onBlur={onBlur}
        aria-label="Volume unit"
        className={`select${hasError ? ' select-error' : ''}`}
      >
        <option value="mL">mL</option>
        <option value="L">L</option>
      </select>
    </div>
  );
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const EMPTY_APP_DATA = {
  product_type: 'distilled_spirits',
  brand_name: '',
  class_type: '',
  abv: '',
  net_contents: '',
  bottler_name: '',
  bottler_city: '',
  bottler_state: '',
  bottler_zip: '',
  country_of_origin: '',
  // Conditional fields — blank = not applicable, skip verification
  age_statement: '',
  state_of_distillation: '',
};

export default function AppForm({ value, onChange, idPrefix = '', forceShowErrors = false, fieldRefs }) {
  const [touched, setTouched] = useState({});

  const touch = (key) => setTouched((prev) => ({ ...prev, [key]: true }));
  const handle = (key, val) => onChange({ ...value, [key]: val });
  const id = (key) => `${idPrefix}${key}`;

  const errors = validateAppData(value);
  const err = (key) => (touched[key] || forceShowErrors) ? errors[key] : undefined;

  const showAgeMat = value.product_type === 'distilled_spirits';

  return (
    <div className="form-grid">
      {/* Product type */}
      <div className="form-group span-2">
        <label htmlFor={id('product_type')}>Type of Product</label>
        <select
          id={id('product_type')}
          value={value.product_type ?? 'distilled_spirits'}
          onChange={(e) => handle('product_type', e.target.value)}
          className="select w-full"
        >
          {PRODUCT_TYPE_OPTIONS.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      {/* Brand name */}
      <div className="form-group">
        <label htmlFor={id('brand_name')}>Brand Name</label>
        <input
          ref={(el) => { if (fieldRefs) fieldRefs.brand_name = el; }}
          type="text"
          id={id('brand_name')}
          value={value.brand_name ?? ''}
          onChange={(e) => handle('brand_name', e.target.value)}
          onBlur={() => touch('brand_name')}
          placeholder="e.g. Stone's Throw"
          className={`input w-full${err('brand_name') ? ' input-error' : ''}`}
          aria-describedby={err('brand_name') ? `${id('brand_name')}-error` : undefined}
        />
        {err('brand_name') && <span id={`${id('brand_name')}-error`} className="field-error" role="alert">{err('brand_name')}</span>}
      </div>

      {/* Class / type — datalist */}
      <div className="form-group">
        <label htmlFor={id('class_type')}>Class / Type Designation</label>
        <input
          type="text"
          id={id('class_type')}
          list={id('class_type_list')}
          value={value.class_type ?? ''}
          onChange={(e) => handle('class_type', e.target.value)}
          onBlur={() => touch('class_type')}
          placeholder="e.g. Kentucky Straight Bourbon Whiskey"
          className={`input w-full${err('class_type') ? ' input-error' : ''}`}
          aria-describedby={err('class_type') ? `${id('class_type')}-error` : undefined}
        />
        <datalist id={id('class_type_list')}>
          {CLASS_TYPE_OPTIONS.map((o) => <option key={o} value={o} />)}
        </datalist>
        {err('class_type') && <span id={`${id('class_type')}-error`} className="field-error" role="alert">{err('class_type')}</span>}
      </div>

      {/* ABV — split number + calculated proof */}
      <div className="form-group">
        <label htmlFor={id('abv')}>Alcohol Content (ABV)</label>
        <AbvInput
          id={id('abv')}
          value={value.abv ?? ''}
          onChange={(v) => handle('abv', v)}
          onBlur={() => touch('abv')}
          hasError={!!err('abv')}
        />
        {err('abv') && <span id={`${id('abv')}-error`} className="field-error" role="alert">{err('abv')}</span>}
      </div>

      {/* Net contents — split number + mL/L */}
      <div className="form-group">
        <label htmlFor={id('net_contents')}>Net Contents</label>
        <NetContentsInput
          id={id('net_contents')}
          value={value.net_contents ?? ''}
          onChange={(v) => handle('net_contents', v)}
          onBlur={() => touch('net_contents')}
          hasError={!!err('net_contents')}
        />
        {err('net_contents') && <span id={`${id('net_contents')}-error`} className="field-error" role="alert">{err('net_contents')}</span>}
      </div>

      {/* Country of origin */}
      <div className="form-group">
        <label htmlFor={id('country_of_origin')}>Country of Origin</label>
        <select
          id={id('country_of_origin')}
          value={value.country_of_origin ?? ''}
          onChange={(e) => handle('country_of_origin', e.target.value)}
          className="select w-full"
        >
          <option value="">United States (Domestic)</option>
          {COUNTRY_OPTIONS.filter((c) => c !== 'United States').map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Bottler name */}
      <div className="form-group">
        <label htmlFor={id('bottler_name')}>Bottler / Producer Name</label>
        <input
          type="text"
          id={id('bottler_name')}
          value={value.bottler_name ?? ''}
          onChange={(e) => handle('bottler_name', e.target.value)}
          onBlur={() => touch('bottler_name')}
          placeholder="e.g. Heaven Hill Brands"
          className={`input w-full${err('bottler_name') ? ' input-error' : ''}`}
          aria-describedby={err('bottler_name') ? `${id('bottler_name')}-error` : undefined}
        />
        {err('bottler_name') && <span id={`${id('bottler_name')}-error`} className="field-error" role="alert">{err('bottler_name')}</span>}
      </div>

      {/* Bottler city */}
      <div className="form-group span-2">
        <label htmlFor={id('bottler_city')}>Bottler / Producer City</label>
        <input
          ref={(el) => { if (fieldRefs) { fieldRefs.bottler_city = el; fieldRefs.bottler_address = el; } }}
          type="text"
          id={id('bottler_city')}
          value={value.bottler_city ?? ''}
          onChange={(e) => handle('bottler_city', e.target.value)}
          onBlur={() => touch('bottler_city')}
          placeholder="e.g. Bardstown"
          className={`input w-full${err('bottler_city') ? ' input-error' : ''}`}
          aria-describedby={err('bottler_city') ? `${id('bottler_city')}-error` : undefined}
        />
        {err('bottler_city') && <span id={`${id('bottler_city')}-error`} className="field-error" role="alert">{err('bottler_city')}</span>}
      </div>

      {/* Bottler state */}
      <div className="form-group">
        <label htmlFor={id('bottler_state')}>State</label>
        <select
          ref={(el) => { if (fieldRefs) fieldRefs.bottler_state = el; }}
          id={id('bottler_state')}
          value={value.bottler_state ?? ''}
          onChange={(e) => handle('bottler_state', e.target.value)}
          onBlur={() => touch('bottler_state')}
          className={`select w-full${err('bottler_state') ? ' select-error' : ''}`}
          aria-describedby={err('bottler_state') ? `${id('bottler_state')}-error` : undefined}
        >
          <option value="">Select state…</option>
          {US_STATES.map(({ abbr, name }) => (
            <option key={abbr} value={abbr}>{name} ({abbr})</option>
          ))}
        </select>
        {err('bottler_state') && <span id={`${id('bottler_state')}-error`} className="field-error" role="alert">{err('bottler_state')}</span>}
      </div>

      {/* Bottler zip — optional */}
      <div className="form-group">
        <label htmlFor={id('bottler_zip')}>
          Zip Code <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '.8rem' }}>(optional)</span>
        </label>
        <input
          ref={(el) => { if (fieldRefs) fieldRefs.bottler_zip = el; }}
          type="text"
          id={id('bottler_zip')}
          value={value.bottler_zip ?? ''}
          onChange={(e) => handle('bottler_zip', e.target.value)}
          onBlur={() => touch('bottler_zip')}
          placeholder="e.g. 40004"
          maxLength={5}
          inputMode="numeric"
          className={`input w-full${err('bottler_zip') ? ' input-error' : ''}`}
          aria-describedby={err('bottler_zip') ? `${id('bottler_zip')}-error` : undefined}
        />
        {err('bottler_zip') && <span id={`${id('bottler_zip')}-error`} className="field-error" role="alert">{err('bottler_zip')}</span>}
      </div>

      {/* ── Conditional: Age & Maturation (distilled spirits only) ──────────── */}
      {showAgeMat && (
        <div className="conditional-section">
          <div className="conditional-section-title">Age &amp; Maturation</div>
          <div className="conditional-grid">
            <div className="form-group">
              <label htmlFor={id('age_statement')}>Statement of Age</label>
              <input
                ref={(el) => { if (fieldRefs) fieldRefs.age_statement = el; }}
                type="text"
                id={id('age_statement')}
                value={value.age_statement ?? ''}
                onChange={(e) => handle('age_statement', e.target.value)}
                placeholder="e.g. 3 Years Old"
                className="input w-full"
              />
              <span className="field-hint">Required if an age claim appears on the label or the spirit is aged less than the minimum required period (27 CFR 5.74). Leave blank if not applicable.</span>
            </div>

            <div className="form-group">
              <label htmlFor={id('state_of_distillation')}>State of Distillation</label>
              <input
                ref={(el) => { if (fieldRefs) fieldRefs.state_of_distillation = el; }}
                type="text"
                id={id('state_of_distillation')}
                value={value.state_of_distillation ?? ''}
                onChange={(e) => handle('state_of_distillation', e.target.value)}
                placeholder="e.g. Distilled in Idaho"
                className="input w-full"
              />
              <span className="field-hint">Required if the distillation state differs from the bottler address state (27 CFR 5.66(f)). Leave blank if not applicable.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
