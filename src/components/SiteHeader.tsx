import { Link } from "@tanstack/react-router";
import { Wine } from "lucide-react";
import { CartSheet } from "./CartSheet";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold">Bar do Zé</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Delivery de bebidas
            </p>
          </div>
        </Link>
        <CartSheet />
      </div>
    </header>
  );
}