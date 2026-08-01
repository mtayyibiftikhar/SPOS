export const BUSINESS_TIMEZONES = [
  { country: "Saudi Arabia", timezone: "Asia/Riyadh" },
  { country: "United Arab Emirates", timezone: "Asia/Dubai" },
  { country: "Bahrain", timezone: "Asia/Bahrain" },
  { country: "Kuwait", timezone: "Asia/Kuwait" },
  { country: "Oman", timezone: "Asia/Muscat" },
  { country: "Qatar", timezone: "Asia/Qatar" },
  { country: "Pakistan", timezone: "Asia/Karachi" },
  { country: "India", timezone: "Asia/Kolkata" },
  { country: "Egypt", timezone: "Africa/Cairo" },
  { country: "United Kingdom", timezone: "Europe/London" }
] as const;

export function isSupportedBusinessTimezone(value: string) {
  return BUSINESS_TIMEZONES.some((entry) => entry.timezone === value);
}
