export const DEFAULT_PHONE_COUNTRY_CODE = "+966";

export const phoneCountryOptions = [
  { code: "+966", label: "+966 KSA" },
  { code: "+971", label: "+971 UAE" },
  { code: "+965", label: "+965 KWT" },
  { code: "+974", label: "+974 QAT" },
  { code: "+968", label: "+968 OMN" },
  { code: "+973", label: "+973 BHR" },
  { code: "+20", label: "+20 EGY" },
  { code: "+91", label: "+91 IND" },
  { code: "+92", label: "+92 PAK" },
  { code: "+880", label: "+880 BGD" }
] as const;

const phoneOptionsByLength = [...phoneCountryOptions].sort((left, right) => right.code.length - left.code.length);

export function sanitizePhoneDigits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function combinePhoneNumber(countryCode: string, localNumber: string) {
  const normalizedNumber = sanitizePhoneDigits(localNumber);

  return normalizedNumber ? `${countryCode}${normalizedNumber}` : "";
}

export function splitPhoneNumber(value?: string, fallbackCountryCode = DEFAULT_PHONE_COUNTRY_CODE) {
  const rawValue = value?.trim() ?? "";

  if (!rawValue) {
    return {
      countryCode: fallbackCountryCode,
      localNumber: ""
    };
  }

  const normalizedValue = rawValue.startsWith("+")
    ? `+${sanitizePhoneDigits(rawValue)}`
    : sanitizePhoneDigits(rawValue);

  const matchedOption = normalizedValue.startsWith("+")
    ? phoneOptionsByLength.find((option) => normalizedValue.startsWith(option.code))
    : undefined;

  if (matchedOption) {
    return {
      countryCode: matchedOption.code,
      localNumber: normalizedValue.slice(matchedOption.code.length)
    };
  }

  return {
    countryCode: fallbackCountryCode,
    localNumber: sanitizePhoneDigits(normalizedValue)
  };
}
