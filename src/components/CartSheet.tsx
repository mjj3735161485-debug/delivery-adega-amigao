import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";

export function CartSheet() {
  const { items, count, subtotal, setQty, remove } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2" aria-label={`Abrir carrinho${count > 0 ? ` (${count} itens)` : ""}`}>
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Carrinho</span>
          {count > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full h-5 min-w-5 px-1 text-[11px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Seu carrinho</SheetTitle>
          <SheetDescription>
            {count === 0 ? "Vazio por enquanto" : `${count} item(ns)`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-border">
          {items.length === 0 && (
            <p className="py-16 text-center text-muted-foreground text-sm">
              Adicione bebidas do catálogo para começar.
            </p>
          )}
          {items.map((it) => (
            <div key={it.id} className="py-4 flex gap-3">
              {it.imagem_url && (
                <img src={it.imagem_url} alt="" className="h-16 w-16 rounded-md object-cover bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{it.nome}</p>
                <p className="text-primary font-semibold text-sm mt-1">{brl(it.preco)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    aria-label={`Diminuir quantidade de ${it.nome}`}
                    onClick={() => setQty(it.id, it.quantidade - 1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{it.quantidade}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    aria-label={`Aumentar quantidade de ${it.nome}`}
                    onClick={() => setQty(it.id, it.quantidade + 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-muted-foreground"
                    aria-label={`Remover ${it.nome} do carrinho`}
                    onClick={() => remove(it.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{brl(subtotal)}</span>
            </div>
            <Button asChild size="lg" className="w-full" onClick={() => setOpen(false)}>
              <Link to="/checkout">Finalizar pedido</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}