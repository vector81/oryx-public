"use client";
import { Children, isValidElement, useState, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type OptionProps = { value: string; children: ReactNode };
export function SelectOption(props: OptionProps) {
  return <>{props.children}</>;
}
type Props = {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  name?: string;
  disabled?: boolean;
  variant?: "default" | "entity";
  "aria-label"?: string;
  onChange?: (event: { target: { value: string } }) => void;
};
const EMPTY = "__oryx_empty_option__";
export default function CustomSelect({
  children,
  value,
  defaultValue,
  name,
  disabled,
  variant = "default",
  onChange,
  "aria-label": label,
}: Props) {
  const options = Children.toArray(children)
    .filter(isValidElement<OptionProps>)
    .map((child) => child.props);
  const [internal, setInternal] = useState(
    defaultValue ?? options[0]?.value ?? "",
  );
  const selected = value ?? internal;
  const entityInfo: Record<string, { badge: string; detail: string }> = {
    me: { badge: "DU", detail: "Personal accounts" },
    "business-one": { badge: "B1", detail: "Example accounts" },
    "business-two": { badge: "B2", detail: "Example business" },
    all: { badge: "ALL", detail: "Combined overview" },
  };
  return (
    <Select.Root
      value={selected || EMPTY}
      disabled={disabled}
      onValueChange={(v) => {
        const next = v === EMPTY ? "" : v;
        setInternal(next);
        onChange?.({ target: { value: next } });
      }}
    >
      {name && <input type="hidden" name={name} value={selected} />}
      <Select.Trigger
        className={`custom-select ${variant === "entity" ? "entity-trigger" : ""}`}
        aria-label={label}
      >
        {variant === "entity" && (
          <span className="entity-monogram" aria-hidden="true">
            {entityInfo[selected]?.badge}
          </span>
        )}
        <span className="select-value">
          <Select.Value />
          {variant === "entity" && (
            <small>{entityInfo[selected]?.detail}</small>
          )}
        </span>
        <Select.Icon>
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={`custom-select-menu ${variant === "entity" ? "entity-menu" : ""}`}
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="custom-select-scroll">
            <ChevronUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className="custom-select-viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value || EMPTY}
                value={option.value || EMPTY}
                className="custom-select-option"
              >
                {variant === "entity" && (
                  <span className="entity-monogram" aria-hidden="true">
                    {entityInfo[option.value]?.badge}
                  </span>
                )}
                <span className="select-option-copy">
                  <Select.ItemText>{option.children}</Select.ItemText>
                  {variant === "entity" && (
                    <small>{entityInfo[option.value]?.detail}</small>
                  )}
                </span>
                <Select.ItemIndicator>
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="custom-select-scroll">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
