/** Presentation validation. Invalid drafts never replace the last valid model value. */
import { toNumber, toRateNumber, MAX_AMOUNT } from './numbers.js';

const CURRENCY = '(?:€|\\$|£|¥|EUR|USD|GBP|JPY|CHF|CAD|AUD)';
const prefix = new RegExp(`^${CURRENCY}\\s*`, 'i');
const suffix = new RegExp(`\\s*${CURRENCY}$`, 'i');

export function readNumericInput(value, { rate = false, signed = false, max = rate ? 1000 : MAX_AMOUNT, min = signed ? -max : 0, integer = false, allowEmpty = true } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return allowEmpty ? { valid: true, text: '', number: 0 } : { valid: false, reason: 'number' };
  const bare = rate ? text.replace(/\s*%$/, '') : prefix.test(text) ? text.replace(prefix, '') : text.replace(suffix, '');
  const number = rate ? toRateNumber(bare) : toNumber(bare);
  if (!Number.isFinite(number)) return { valid: false, reason: 'number' };
  if (integer && !Number.isInteger(number)) return { valid: false, reason: 'integer' };
  if (number < min || number > max) return { valid: false, reason: 'bounds', min, max };
  return { valid: true, text: bare, number };
}

/** A field keeps its invalid text visible until corrected, including after blur. */
export function bindNumericInput(input, { options = () => ({}), errorNode, message, onInput, onSettle, onValidity = () => {} }) {
  let invalid = false;
  let reason = null;
  const key = input.id;
  if (errorNode) {
    errorNode.hidden = true;
    errorNode.classList.add('input-error');
    errorNode.id = `${key}-error`;
    const described = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', [described, errorNode.id].filter(Boolean).join(' '));
  }
  function validate() {
    const result = readNumericInput(input.value, options());
    invalid = !result.valid;
    reason = result;
    input.setAttribute('aria-invalid', String(invalid));
    const text = invalid ? message(result) : '';
    input.setCustomValidity(text);
    if (errorNode) { errorNode.hidden = !invalid; errorNode.textContent = text; }
    onValidity(key, invalid);
    return result;
  }
  input.addEventListener('input', () => {
    const result = validate();
    if (result.valid) onInput(result.text);
  });
  input.addEventListener('blur', () => {
    const result = validate();
    if (result.valid) onSettle(result.text);
  });
  return {
    sync(value) {
      if (!invalid && input.ownerDocument.activeElement !== input && input.value !== String(value ?? '')) input.value = String(value ?? '');
      if (invalid && errorNode) errorNode.textContent = message(reason);
    },
    clear() { invalid = false; input.setCustomValidity(''); input.removeAttribute('aria-invalid'); if (errorNode) errorNode.hidden = true; onValidity(key, false); },
    get invalid() { return invalid; },
  };
}
