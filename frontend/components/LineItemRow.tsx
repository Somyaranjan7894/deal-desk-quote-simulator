import { Product, QuoteFormLineItem, QuoteLineItemResponse } from "@/types";
import { formatCurrency } from "@/lib/formatters";

interface LineItemRowProps {
  index: number;
  item: QuoteFormLineItem;
  products: Product[];
  usedSkus: string[];
  calculatedDetail?: QuoteLineItemResponse;
  onChangeSku: (newSku: string) => void;
  onChangeQuantity: (newQuantity: number | "") => void;
  onRemove: () => void;
}

export function LineItemRow({
  index,
  item,
  products,
  usedSkus,
  calculatedDetail,
  onChangeSku,
  onChangeQuantity,
  onRemove,
}: LineItemRowProps) {
  // Find catalog product info for unit price reference
  const selectedProduct = products.find((p) => p.sku === item.sku);

  const unitPrice =
    calculatedDetail?.unit_price ?? selectedProduct?.unit_price ?? "0";
  const lineTotal = calculatedDetail?.line_total;

  return (
    <div className="line-item-row" data-testid={`line-item-row-${index}`}>
      <div>
        <label htmlFor={`product-select-${index}`} className="visually-hidden">
          Product {index + 1}
        </label>
        <select
          id={`product-select-${index}`}
          className="select-input"
          aria-label={`Product selection for line ${index + 1}`}
          value={item.sku}
          onChange={(e) => onChangeSku(e.target.value)}
        >
          <option value="" disabled>
            Select a product...
          </option>
          {products.map((product) => {
            const isUsedElsewhere =
              product.sku !== item.sku && usedSkus.includes(product.sku);

            return (
              <option
                key={product.sku}
                value={product.sku}
                disabled={isUsedElsewhere}
              >
                {product.name} ({formatCurrency(product.unit_price)})
                {isUsedElsewhere ? " (already added)" : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label htmlFor={`quantity-input-${index}`} className="visually-hidden">
          Quantity {index + 1}
        </label>
        <input
          id={`quantity-input-${index}`}
          type="number"
          min={1}
          step={1}
          className="input-text"
          placeholder="Qty"
          aria-label={`Quantity for line ${index + 1}`}
          value={item.quantity}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "") {
              onChangeQuantity("");
            } else {
              const parsed = parseInt(val, 10);
              onChangeQuantity(isNaN(parsed) ? "" : Math.max(1, parsed));
            }
          }}
        />
      </div>

      <div className="line-item-price-preview">
        {lineTotal ? (
          <div>
            <strong>{formatCurrency(lineTotal)}</strong>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              {formatCurrency(unitPrice)} ea
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)" }}>
            {formatCurrency(unitPrice)} ea
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRemove}
          title="Remove line item"
          aria-label={`Remove item ${index + 1}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
