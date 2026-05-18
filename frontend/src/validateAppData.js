// Returns an object of { fieldKey: errorMessage }. Empty object = valid.
export function validateAppData(data) {
  const errors = {};

  if (!data.brand_name?.trim()) {
    errors.brand_name = 'Brand name is required.';
  }

  if (!data.class_type?.trim()) {
    errors.class_type = 'Class / type designation is required.';
  }

  // abv is stored as "45% Alc./Vol. (90 Proof)" — parse the leading number
  const abvPct = data.abv?.match(/^([\d.]+)/)?.[1];
  if (!data.abv?.trim()) {
    errors.abv = 'Alcohol content is required.';
  } else if (!abvPct || isNaN(parseFloat(abvPct))) {
    errors.abv = 'Enter a number for ABV (e.g. 45).';
  } else {
    const pct = parseFloat(abvPct);
    if (pct < 0.5 || pct > 95) {
      errors.abv = 'ABV must be between 0.5% and 95%.';
    }
  }

  // net_contents is stored as "750 mL" or "1.75 L"
  const ncMatch = data.net_contents?.match(/^([\d.]+)\s*(mL|L)$/i);
  if (!data.net_contents?.trim()) {
    errors.net_contents = 'Net contents is required.';
  } else if (!ncMatch) {
    errors.net_contents = 'Enter a number for net contents (e.g. 750).';
  } else {
    const num = parseFloat(ncMatch[1]);
    const unit = ncMatch[2];
    const numMl = unit === 'L' || unit === 'l' ? num * 1000 : num;
    if (isNaN(numMl) || numMl < 1 || numMl > 20000) {
      errors.net_contents = 'Net contents must be between 1 mL and 20 L.';
    }
  }

  if (!data.bottler_name?.trim()) {
    errors.bottler_name = 'Bottler / producer name is required.';
  }

  if (!data.bottler_city?.trim()) {
    errors.bottler_city = 'City is required.';
  }

  if (!data.bottler_state?.trim()) {
    errors.bottler_state = 'State is required.';
  }

  if (data.bottler_zip?.trim() && !/^\d{5}$/.test(data.bottler_zip.trim())) {
    errors.bottler_zip = 'Zip code must be 5 digits.';
  }

  // country_of_origin always has a value (select defaults to United States)

  return errors;
}

export const isValid = (errors) => Object.keys(errors).length === 0;
