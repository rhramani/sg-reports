import React, { useState, useEffect, useRef } from "react";
import {
  isValidPhoneNumber,
  parsePhoneNumber,
  getCountries,
  getCountryCallingCode,
  AsYouType,
  CountryCode as Country,
} from "libphonenumber-js";
import flags from "react-phone-number-input/flags";
import { Search, ChevronDown, CheckCircle2, AlertCircle, Phone, X } from "lucide-react";
import en from "react-phone-number-input/locale/en.json";

interface CountryPhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  defaultCountry?: Country;
  className?: string;
  disabled?: boolean;
}

// Map ISO country code to country name
const getCountryName = (country: Country): string => {
  return (en as Record<string, string>)[country] || country;
};

// Helper to extract country and national number from E.164 or raw value
function parsePhoneValue(
  value: string,
  fallbackCountry: Country = "US"
): { country: Country; nationalNumber: string } {
  if (!value) return { country: fallbackCountry, nationalNumber: "" };

  try {
    const parsed = parsePhoneNumber(value, fallbackCountry);
    if (parsed) {
      return {
        country: (parsed.country || fallbackCountry) as Country,
        nationalNumber: parsed.nationalNumber || "",
      };
    }
  } catch (e) {
    if (value.startsWith("+")) {
      const digits = value.replace(/\D/g, "");
      const allCountries = getCountries();
      for (const c of allCountries) {
        const code = getCountryCallingCode(c);
        if (digits.startsWith(code)) {
          return { country: c, nationalNumber: digits.slice(code.length) };
        }
      }
    }
  }

  const cleanDigits = value.replace(/\D/g, "");
  return { country: fallbackCountry, nationalNumber: cleanDigits };
}

export function CountryPhoneInput({
  value,
  onChange,
  onValidChange,
  placeholder = "Enter phone number",
  defaultCountry = "US",
  className = "",
  disabled = false,
}: CountryPhoneInputProps) {
  const parsedInitial = parsePhoneValue(value, defaultCountry);
  const [selectedCountry, setSelectedCountry] = useState<Country>(parsedInitial.country);
  const [nationalInput, setNationalInput] = useState<string>(parsedInitial.nationalNumber);
  
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync state when external value changes
  useEffect(() => {
    if (value) {
      const parsed = parsePhoneValue(value, selectedCountry);
      if (parsed.country !== selectedCountry) {
        setSelectedCountry(parsed.country);
      }
      const formatted = new AsYouType(parsed.country).input(parsed.nationalNumber);
      setNationalInput(formatted);
    } else if (!value && nationalInput) {
      setNationalInput("");
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Validation status
  const isValid = Boolean(value && isValidPhoneNumber(value));
  const isNotEmpty = Boolean(nationalInput && nationalInput.trim().length > 0);

  useEffect(() => {
    if (onValidChange) {
      onValidChange(!isNotEmpty || isValid);
    }
  }, [value, isValid, isNotEmpty, onValidChange]);

  // Handle typing in national number field
  const handleNationalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const digitsOnly = rawVal.replace(/\D/g, "");
    
    // Format national input as typed
    const formatted = new AsYouType(selectedCountry).input(digitsOnly);
    setNationalInput(formatted);

    // Build full E.164 string with selected country code
    const callingCode = getCountryCallingCode(selectedCountry);
    const fullE164 = digitsOnly ? `+${callingCode}${digitsOnly}` : "";
    onChange(fullE164);
  };

  // Handle country selection change
  const handleSelectCountry = (country: Country) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearchQuery("");

    // Rebuild full E.164 string with new country code
    const digitsOnly = nationalInput.replace(/\D/g, "");
    const callingCode = getCountryCallingCode(country);
    const fullE164 = digitsOnly ? `+${callingCode}${digitsOnly}` : "";
    
    const formatted = new AsYouType(country).input(digitsOnly);
    setNationalInput(formatted);
    onChange(fullE164);
  };

  const allCountries = getCountries();

  // Filter countries by name or calling code
  const filteredCountries = allCountries.filter((country) => {
    const countryName = getCountryName(country).toLowerCase();
    const callingCode = getCountryCallingCode(country);
    const query = searchQuery.toLowerCase().trim().replace("+", "");

    return (
      countryName.includes(query) ||
      country.toLowerCase().includes(query) ||
      callingCode.includes(query)
    );
  });

  const SelectedFlagComponent = flags[selectedCountry];

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative flex items-stretch" ref={dropdownRef}>
        {/* Country Selector Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/90 border border-r-0 border-slate-200 rounded-l-xl text-slate-700 text-xs sm:text-sm font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-[#18476A]/20 ${
            disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : ""
          }`}
          title="Select Country Code"
        >
          {SelectedFlagComponent && (
            <span className="w-5 h-3.5 flex items-center justify-center overflow-hidden rounded-[2px] shadow-sm shrink-0">
              <SelectedFlagComponent title={selectedCountry} />
            </span>
          )}
          <span className="font-bold text-slate-800 text-xs font-mono">
            +{getCountryCallingCode(selectedCountry)}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {/* National Phone Input Box (Only National Number, No Prepending +Code) */}
        <div className="relative flex-1">
          <input
            type="tel"
            value={nationalInput}
            onChange={handleNationalInputChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full pl-3 pr-9 py-2.5 bg-slate-50 text-slate-900 text-sm font-medium rounded-r-xl border border-slate-200 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition placeholder:text-slate-400 ${
              isNotEmpty
                ? isValid
                  ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-100"
                  : "border-rose-300 focus:border-rose-500 focus:ring-rose-100"
                : ""
            }`}
          />

          {/* Validation / Phone icon inside input */}
          <div className="absolute right-3 top-3 pointer-events-none flex items-center">
            {isNotEmpty ? (
              isValid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              )
            ) : (
              <Phone className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Country Picker Searchable Dropdown */}
        {isOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 max-h-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input Header */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 ml-1.5 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or code (e.g. +91, India)..."
                className="w-full py-1.5 px-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#18476A] focus:ring-1 focus:ring-[#18476A]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Country List */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50 py-1">
              {filteredCountries.length > 0 ? (
                filteredCountries.map((countryCode) => {
                  const FlagComp = flags[countryCode];
                  const countryName = getCountryName(countryCode);
                  const dialCode = getCountryCallingCode(countryCode);
                  const isSelected = countryCode === selectedCountry;

                  return (
                    <button
                      key={countryCode}
                      type="button"
                      onClick={() => handleSelectCountry(countryCode)}
                      className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-[#18476A]/10 text-[#18476A] font-bold"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {FlagComp && (
                          <span className="w-5 h-3.5 flex items-center justify-center overflow-hidden rounded-[2px] shadow-sm shrink-0">
                            <FlagComp title={countryName} />
                          </span>
                        )}
                        <span className="truncate">{countryName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({countryCode})</span>
                      </div>
                      <span className="font-mono text-slate-500 shrink-0 font-semibold text-xs">
                        +{dialCode}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching country or code found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Validation helper label */}
      {isNotEmpty && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium pt-0.5">
          {isValid ? (
            <p className="text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              Valid phone number for {getCountryName(selectedCountry)} (+{getCountryCallingCode(selectedCountry)})
            </p>
          ) : (
            <p className="text-rose-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Please enter a valid phone number for {getCountryName(selectedCountry)} (+{getCountryCallingCode(selectedCountry)})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
