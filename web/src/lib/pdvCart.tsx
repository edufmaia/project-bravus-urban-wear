import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartDiscountType = "AMOUNT" | "PERCENT";

export type CartItem = {
  sku_id: string;
  sku: string;
  product_code: string;
  product_name: string;
  color: string;
  size: string;
  unit_price: number;
  stock_current: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  discountType: CartDiscountType;
  discountValue: number;
  notes: string;
};

type CartTotals = {
  subtotal: number;
  discountAmount: number;
  total: number;
  itemsCount: number;
};

type PdvCartContextValue = {
  cart: CartState;
  totals: CartTotals;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (skuId: string, quantity: number) => void;
  removeItem: (skuId: string) => void;
  clearCart: () => void;
  setDiscount: (type: CartDiscountType, value: number) => void;
  setNotes: (value: string) => void;
};

const STORAGE_KEY = "bravus-urban-wear-pdv-cart-v1";

const defaultCart: CartState = {
  items: [],
  discountType: "AMOUNT",
  discountValue: 0,
  notes: "",
};

const PdvCartContext = createContext<PdvCartContextValue | undefined>(undefined);

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
};

export function PdvCartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultCart;
      const parsed = JSON.parse(raw) as CartState;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        discountType: parsed.discountType === "PERCENT" ? "PERCENT" : "AMOUNT",
        discountValue: normalizeMoney(Number(parsed.discountValue) || 0),
        notes: parsed.notes ?? "",
      };
    } catch {
      return defaultCart;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addItem = (item: Omit<CartItem, "quantity">, quantity = 1) => {
    setCart((current) => {
      const existing = current.items.find((entry) => entry.sku_id === item.sku_id);
      if (!existing) {
        return {
          ...current,
          items: [
            ...current.items,
            {
              ...item,
              quantity,
            },
          ],
        };
      }
      return {
        ...current,
        items: current.items.map((entry) =>
          entry.sku_id === item.sku_id
            ? {
                ...entry,
                quantity: entry.quantity + quantity,
                stock_current: item.stock_current,
                unit_price: item.unit_price,
              }
            : entry
        ),
      };
    });
  };

  const updateQuantity = (skuId: string, quantity: number) => {
    setCart((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.sku_id === skuId
          ? {
              ...entry,
              quantity: Math.max(1, Math.floor(quantity) || 1),
            }
          : entry
      ),
    }));
  };

  const removeItem = (skuId: string) => {
    setCart((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.sku_id !== skuId),
    }));
  };

  const clearCart = () => {
    setCart(defaultCart);
  };

  const setDiscount = (type: CartDiscountType, value: number) => {
    setCart((current) => ({
      ...current,
      discountType: type,
      discountValue: normalizeMoney(value),
    }));
  };

  const setNotes = (value: string) => {
    setCart((current) => ({
      ...current,
      notes: value,
    }));
  };

  const totals = useMemo(() => {
    const subtotal = normalizeMoney(
      cart.items.reduce((sum, item) => sum + normalizeMoney(item.unit_price) * item.quantity, 0)
    );
    const rawDiscount =
      cart.discountType === "PERCENT"
        ? subtotal * (Math.min(100, Math.max(0, cart.discountValue)) / 100)
        : cart.discountValue;
    const discountAmount = normalizeMoney(Math.min(subtotal, rawDiscount));
    const total = normalizeMoney(Math.max(0, subtotal - discountAmount));
    const itemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      subtotal,
      discountAmount,
      total,
      itemsCount,
    };
  }, [cart]);

  const value = useMemo(
    () => ({
      cart,
      totals,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      setDiscount,
      setNotes,
    }),
    [cart, totals]
  );

  return <PdvCartContext.Provider value={value}>{children}</PdvCartContext.Provider>;
}

export function usePdvCart() {
  const context = useContext(PdvCartContext);
  if (!context) throw new Error("usePdvCart must be used within PdvCartProvider");
  return context;
}
