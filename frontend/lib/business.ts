/// Real business details, shown in the footer and on every legal page.
/// They come from environment variables so that NOTHING here is invented: fill them in
/// with the legal entity that operates this site (see .env.example). `npm run check:compliance`
/// fails until every required field is set.

const env = (v: string | undefined) => (v ?? "").trim();

export const BUSINESS = {
  legalName: env(process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME),
  tradingName: env(process.env.NEXT_PUBLIC_BUSINESS_TRADING_NAME) || "KiiEden",
  registeredAddress: env(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS),
  registrationNumber: env(process.env.NEXT_PUBLIC_BUSINESS_REG_NUMBER),
  jurisdiction: env(process.env.NEXT_PUBLIC_BUSINESS_JURISDICTION), // country whose law governs the Terms
  contactEmail: env(process.env.NEXT_PUBLIC_BUSINESS_EMAIL),
  phone: env(process.env.NEXT_PUBLIC_BUSINESS_PHONE), // optional, shown as a tap-to-call link
  privacyEmail: env(process.env.NEXT_PUBLIC_BUSINESS_PRIVACY_EMAIL) || env(process.env.NEXT_PUBLIC_BUSINESS_EMAIL),
  vatNumber: env(process.env.NEXT_PUBLIC_BUSINESS_VAT), // optional
};

export const REQUIRED_BUSINESS_FIELDS: (keyof typeof BUSINESS)[] = ["legalName", "registeredAddress", "registrationNumber", "jurisdiction", "contactEmail"];

export const BUSINESS_COMPLETE = REQUIRED_BUSINESS_FIELDS.every((k) => BUSINESS[k].length > 0);

/// Date the legal texts were last reviewed. Update it whenever you change them.
export const LEGAL_LAST_UPDATED = "21 September 2026";

/// tel: link for a phone number. Keeps digits, a leading + and nothing else; "" when there is no usable number.
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return /\d{6,}/.test(cleaned) ? `tel:${cleaned}` : "";
}
