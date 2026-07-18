// US-only timezone choices for signup/onboarding forms. Keeping this to a
// short curated list (rather than Intl.supportedValuesOf("timeZone"), which
// lists every IANA zone worldwide) matches this app's US-only user base and
// keeps the <select> scannable.
export const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Mountain Time - no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
] as const;

export const DEFAULT_US_TIMEZONE = "America/Denver";
