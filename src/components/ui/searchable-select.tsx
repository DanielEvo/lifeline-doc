// Combobox simples com busca — usado nos campos de especialidade, UF e cidade.

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  allowCustom?: boolean;
  className?: string;
};

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  disabled,
  loading,
  allowCustom = true,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const custom =
    allowCustom &&
    query.trim().length > 1 &&
    !options.some((o) => o.toLowerCase() === query.trim().toLowerCase())
      ? query.trim()
      : null;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[150px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {custom && (
                <CommandItem value={custom} onSelect={() => pick(custom)}>
                  Usar “{custom}”
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => pick(o)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
