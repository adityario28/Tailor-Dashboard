"use client"

import * as React from "react"
import { CaretDownIcon, XIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface ComboboxProps {
  items: string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  showClear?: boolean
  eventName?: string
}

function Combobox({
  items,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled,
  showClear = true,
  eventName,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [internal, setInternal] = React.useState(defaultValue)

  const controlled = value !== undefined
  const selected = controlled ? value! : internal

  function handleSelect(item: string) {
    console.log("Combobox handleSelect received value:", item);
    const originalItem = items.find(i => i.toLowerCase() === item.toLowerCase()) || item
    console.log("Combobox matched originalItem:", originalItem);
    const next = originalItem === selected ? "" : originalItem
    if (!controlled) setInternal(next)
    onValueChange?.(next)
    if (eventName) {
      console.log("Combobox dispatching custom event:", eventName, "with value:", next);
      window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
    }
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    if (!controlled) setInternal("")
    onValueChange?.("")
    if (eventName) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: "" }));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal overflow-hidden", className)}
        >
          <span className={cn("truncate min-w-0", !selected && "text-muted-foreground")}>
            {selected || placeholder}
          </span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {selected && showClear && (
              <span
                role="button"
                aria-label="Clear"
                onClick={handleClear}
                className="rounded p-0.5 opacity-50 hover:opacity-100 hover:bg-accent"
              >
                <XIcon className="size-3" />
              </span>
            )}
            <CaretDownIcon className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item}
                  value={item}
                  data-checked={selected === item}
                  onSelect={handleSelect}
                >
                  {item}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
