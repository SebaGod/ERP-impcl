"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { addQuoteItem, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export interface ProductOption {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  base_price_net: number;
  unit_cost: number;
}

export function ItemForm({
  quoteId,
  products,
}: {
  quoteId: string;
  products: ProductOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addQuoteItem.bind(null, quoteId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");

  function applyProduct(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product) {
      setDescription(
        product.description
          ? `${product.name} — ${product.description}`
          : product.name
      );
      setUnitPrice(String(product.base_price_net));
      setUnitCost(String(product.unit_cost));
    }
  }

  useResetOnSuccess(state, formRef, () => {
    setProductId("");
    setDescription("");
    setUnitPrice("");
    setUnitCost("");
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4"
    >
      <p className="text-sm font-medium">Agregar ítem</p>

      {products.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-product">Desde el catálogo (opcional)</Label>
          <Select
            id="item-product"
            name="product_id"
            value={productId}
            onChange={(event) => applyProduct(event.target.value)}
          >
            <option value="">Ítem manual…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.unit})
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-description">Descripción *</Label>
        <Input
          id="item-description"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="1000 tarjetas couché 300g, full color"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-qty">Cantidad *</Label>
          <Input
            id="item-qty"
            name="quantity"
            type="text"
            inputMode="decimal"
            defaultValue="1"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-price">Precio neto *</Label>
          <Input
            id="item-price"
            name="unit_price_net"
            type="text"
            inputMode="numeric"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            placeholder="25000"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-cost">Costo unit.</Label>
          <Input
            id="item-cost"
            name="unit_cost"
            type="text"
            inputMode="numeric"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            placeholder="10000"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus className="size-4" /> {pending ? "Agregando…" : "Agregar ítem"}
        </Button>
      </div>
    </form>
  );
}
