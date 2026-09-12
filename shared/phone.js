import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export function westernDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

export function normalizePhone(value = "") {
  let text = westernDigits(value).trim();
  if (!text) return "";
  if (!/^[+\d\s().-]+$/.test(text)) return null;
  text = text.replace(/[\s().-]/g, "");
  if (text.startsWith("00")) text = "+" + text.slice(2);
  else if (/^971\d{8,9}$/.test(text)) text = "+" + text;
  const parsed = parsePhoneNumberFromString(text, {
    defaultCountry: "AE",
    extract: false,
  });
  // UAE metadata also allows short service numbers. The desk needs a complete
  // member contact number, not a short code or unfinished keypad input.
  if (
    parsed?.countryCallingCode === "971" &&
    !/^[2-9]\d{7,8}$/.test(parsed.nationalNumber)
  )
    return null;
  return parsed && !parsed.ext && parsed.isPossible() ? parsed.number : null;
}

export function formatPhone(value = "") {
  const normalized = normalizePhone(value);
  if (!normalized) return value || "Phone not added";
  const parsed = parsePhoneNumberFromString(normalized);
  return parsed.country === "AE"
    ? parsed.formatNational()
    : parsed.formatInternational();
}

// Complete numbers use an exact match; four digits use a suffix match.
// Longer unfinished input supports narrowing results while reception types.
export function phoneSearch(value = "") {
  let text = westernDigits(value).trim();
  if (!text || !/^[+\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 15) return null;
  if (digits.length === 4 && !text.includes("+"))
    return { kind: "suffix", key: digits };
  const normalized = normalizePhone(text);
  if (normalized) return { kind: "exact", key: normalized.slice(1) };
  let key = digits;
  if (key.startsWith("00")) key = key.slice(2);
  else if (key.startsWith("0")) key = "971" + key.slice(1);
  else if (key.startsWith("5") && key.length <= 9 && !text.includes("+"))
    key = "971" + key;
  return key.length >= 4 ? { kind: "prefix", key } : null;
}
