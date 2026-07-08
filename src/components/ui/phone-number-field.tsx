import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { phoneCountryOptions } from "@/lib/phone";

type PhoneNumberFieldProps = {
  countryCode: string;
  disabled?: boolean;
  label: string;
  number: string;
  onCountryCodeChange: (value: string) => void;
  onNumberChange: (value: string) => void;
  placeholder?: string;
};

export function PhoneNumberField({
  countryCode,
  disabled = false,
  label,
  number,
  onCountryCodeChange,
  onNumberChange,
  placeholder,
}: PhoneNumberFieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-ink">{label}</label>
      <div className="grid gap-2 sm:grid-cols-[126px_minmax(0,1fr)]">
        <Select
          disabled={disabled}
          value={countryCode}
          onChange={(event) => onCountryCodeChange(event.target.value)}
        >
          {phoneCountryOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          disabled={disabled}
          inputMode="tel"
          placeholder={placeholder}
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
        />
      </div>
    </div>
  );
}
