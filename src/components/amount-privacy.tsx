"use client";

import { createContext, useContext, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { money, spoken } from "@/lib/money";

const PrivacyContext = createContext({ hidden: true, toggle: () => {} });

export function AmountPrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(true);
  return <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden(value => !value) }}>{children}</PrivacyContext.Provider>;
}

export function usePrivateAmounts() {
  const { hidden } = useContext(PrivacyContext);
  return {
    hidden,
    money: (...args: Parameters<typeof money>) => hidden ? "••••" : money(...args),
    spoken: (...args: Parameters<typeof spoken>) => hidden ? "Amount hidden" : spoken(...args),
  };
}

export function AmountPrivacyToggle() {
  const { hidden, toggle } = useContext(PrivacyContext);
  const label = hidden ? "Show all amounts" : "Hide all amounts";
  return <button type="button" className="icon amount-privacy-toggle" onClick={toggle} aria-label={label} title={label} aria-pressed={hidden}>
    {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
  </button>;
}
