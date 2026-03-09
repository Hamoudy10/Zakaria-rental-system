const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const KENYAN_DIGITS_REGEX = /^254[17]\d{8}$/;

const cleanDigits = (value) => String(value || "").replace(/\D/g, "");

const normalizeKenyanPhone = (value) => {
  const digits = cleanDigits(value);

  if (!digits) return null;
  if (KENYAN_DIGITS_REGEX.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;

  return null;
};

const normalizeContactPhone = (value) => {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const kenyanPhone = normalizeKenyanPhone(raw);
  if (kenyanPhone) return `+${kenyanPhone}`;

  const digits = cleanDigits(raw);
  if (!digits) return null;

  if (raw.startsWith("+")) {
    const normalized = `+${digits}`;
    return E164_REGEX.test(normalized) ? normalized : null;
  }

  if (raw.startsWith("00")) {
    const normalized = `+${digits.slice(2)}`;
    return E164_REGEX.test(normalized) ? normalized : null;
  }

  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
};

const isValidContactPhone = (value) => E164_REGEX.test(String(value || ""));

const isKenyanContactPhone = (value) => {
  const normalized = normalizeContactPhone(value);
  return !!normalized && normalized.startsWith("+254");
};

const formatContactPhoneForDisplay = (value) => {
  const normalized = normalizeContactPhone(value);
  if (!normalized) return value || "";

  if (normalized.startsWith("+254") && normalized.length === 13) {
    return `0${normalized.slice(4)}`;
  }

  return normalized;
};

const toDigitsOnlyPhone = (value) => {
  const normalized = normalizeContactPhone(value);
  return normalized ? normalized.slice(1) : null;
};

module.exports = {
  cleanDigits,
  formatContactPhoneForDisplay,
  isKenyanContactPhone,
  isValidContactPhone,
  normalizeContactPhone,
  normalizeKenyanPhone,
  toDigitsOnlyPhone,
};
