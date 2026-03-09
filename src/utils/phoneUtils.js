const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const cleanPhoneDigits = (value) => String(value || "").replace(/\D/g, "");

export const normalizeKenyanPhone = (value) => {
  const digits = cleanPhoneDigits(value);

  if (!digits) return "";
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;

  return "";
};

export const normalizeContactPhone = (value) => {
  if (value === undefined || value === null) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  const kenyan = normalizeKenyanPhone(raw);
  if (kenyan) return kenyan;

  const digits = cleanPhoneDigits(raw);
  if (!digits) return "";

  if (raw.startsWith("+")) {
    const normalized = `+${digits}`;
    return E164_REGEX.test(normalized) ? normalized : "";
  }

  if (raw.startsWith("00")) {
    const normalized = `+${digits.slice(2)}`;
    return E164_REGEX.test(normalized) ? normalized : "";
  }

  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return "";
};

export const isValidContactPhone = (value) => E164_REGEX.test(normalizeContactPhone(value));

export const isKenyanContactPhone = (value) => normalizeContactPhone(value).startsWith("+254");

export const formatContactPhoneForDisplay = (value) => {
  const normalized = normalizeContactPhone(value);
  if (!normalized) return value || "";

  if (normalized.startsWith("+254") && normalized.length === 13) {
    return `0${normalized.slice(4)}`;
  }

  return normalized;
};
