import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  id: string;
  nome: string;
  preco: number;
  imagem_url: string | null;
  quantidade: number;
};

type CartCtx = {
  items: CartItem[];
  add: (p: Omit<CartItem, "quantidade">, qty?: number) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "barze_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const add: CartCtx["add"] = useCallback((p, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + qty };
        return copy;
      }
      return [...prev, { ...p, quantidade: qty }];
    });
  }, []);

  const remove: CartCtx["remove"] = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQty: CartCtx["setQty"] = useCallback((id, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, quantidade: qty } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const { subtotal, count } = useMemo(() => {
    let s = 0, c = 0;
    for (const i of items) {
      s += i.preco * i.quantidade;
      c += i.quantidade;
    }
    return { subtotal: s, count: c };
  }, [items]);

  return (
    <Ctx.Provider value={{ items, add, remove, setQty, clear, subtotal, count }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}