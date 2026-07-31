export function sanitizeNumericInput(value: string, allowDecimal: boolean) {
  const digitsAndSeparators = value.replace(/[^\d.]/g, "");

  if (!allowDecimal) {
    return digitsAndSeparators.replace(/\./g, "");
  }

  const [whole = "", ...fractionParts] = digitsAndSeparators.split(".");

  return fractionParts.length > 0 ? `${whole}.${fractionParts.join("")}` : whole;
}
