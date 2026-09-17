"""
merch/economics.py -- independent recompute of merch unit economics.

MerchPulse stores both the cost inputs *and* the derived figures
(profit_amount, margin_pct). Storing a derived value is how a stale number
survives a cost change: the blank cost goes up, nobody recomputes, and the
product keeps reporting the margin it had last quarter.

This module recomputes from the inputs and compares. It never edits the
export -- it reports drift so a human decides.

Cost model (all per unit, USD):

    cost  = blank + print + shipping + processing_fee
          + marketplace_fee + refund_allowance
    profit = retail - cost
    margin = profit / retail

`refund_allowance` is an expected-loss accrual, not a transaction cost, but
it is deducted here because MerchPulse's own stored figures include it --
verified against the export: 4.50+3.00+4.00+0.72+2.50+0.75 = 15.47, and
24.99-15.47 = 9.52 which is exactly its stored profit_amount.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

__all__ = [
    "ProductEconomics",
    "EconomicsDrift",
    "verify_product_economics",
    "verify_all_products",
    "COST_FIELDS",
    "CENT",
]

# Cost components summed to reach unit cost. Order is presentation order.
COST_FIELDS: tuple[str, ...] = (
    "blank_cost",
    "print_cost",
    "shipping_cost",
    "processing_fee",
    "marketplace_fee",
    "refund_allowance",
)

# Comparison tolerance. Money is stored as float in the export, so exact
# equality is not safe; half a cent is tighter than any real drift and looser
# than float noise.
CENT = 0.005

# Below this, a product is not worth producing -- surfaced, not enforced.
THIN_MARGIN_PCT = 20.0


def _num(record: dict[str, Any], key: str) -> float:
    """Read a numeric field, treating absent/null as zero.

    A missing cost component is materially different from a zero one, so
    `missing_fields` on the result records which were absent.
    """
    value = record.get(key)
    if value is None:
        return 0.0
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"field {key!r} is not numeric: {value!r}")
    return float(value)


@dataclass(frozen=True)
class EconomicsDrift:
    """One stored figure disagreeing with the recomputed one."""

    field: str
    stored: float
    computed: float

    @property
    def delta(self) -> float:
        return round(self.stored - self.computed, 4)

    def __str__(self) -> str:
        return (
            f"{self.field}: stored {self.stored:.4g}, "
            f"computed {self.computed:.4g} (off by {self.delta:+.4g})"
        )


@dataclass(frozen=True)
class ProductEconomics:
    """Recomputed unit economics for one Product record."""

    product_id: str
    product_type: str
    retail_price: float
    cost_breakdown: dict[str, float]
    missing_fields: tuple[str, ...]
    drift: tuple[EconomicsDrift, ...]

    @property
    def unit_cost(self) -> float:
        return round(sum(self.cost_breakdown.values()), 4)

    @property
    def profit(self) -> float:
        return round(self.retail_price - self.unit_cost, 4)

    @property
    def margin_pct(self) -> float:
        if self.retail_price <= 0:
            return 0.0
        return round(self.profit / self.retail_price * 100, 4)

    @property
    def is_consistent(self) -> bool:
        """True when every stored figure matches the recompute."""
        return not self.drift

    @property
    def is_viable(self) -> bool:
        return self.profit > 0

    def warnings(self) -> list[str]:
        out: list[str] = []
        if not self.is_viable:
            out.append(
                f"sells at a loss: retail {self.retail_price:.2f} "
                f"vs cost {self.unit_cost:.2f}"
            )
        elif self.margin_pct < THIN_MARGIN_PCT:
            out.append(
                f"thin margin {self.margin_pct:.1f}% "
                f"(below {THIN_MARGIN_PCT:.0f}% guideline)"
            )
        if self.missing_fields:
            out.append(
                f"cost fields absent, counted as zero: {', '.join(self.missing_fields)}"
            )
        for d in self.drift:
            out.append(f"stored figure is stale -- {d}")
        return out


def verify_product_economics(product: dict[str, Any]) -> ProductEconomics:
    """Recompute one Product's economics and compare against its stored values.

    Raises TypeError if a cost field holds a non-numeric value -- that is a
    corrupt record, not a drift.
    """
    retail = _num(product, "retail_price")
    breakdown = {f: _num(product, f) for f in COST_FIELDS}
    missing = tuple(f for f in COST_FIELDS if product.get(f) is None)

    computed_cost = round(sum(breakdown.values()), 4)
    computed_profit = round(retail - computed_cost, 4)
    computed_margin = round(computed_profit / retail * 100, 4) if retail > 0 else 0.0

    drift: list[EconomicsDrift] = []
    for key, computed in (
        ("profit_amount", computed_profit),
        ("desired_profit", computed_profit),
        ("margin_pct", computed_margin),
    ):
        if product.get(key) is None:
            continue
        stored = _num(product, key)
        if abs(stored - computed) > (CENT if key != "margin_pct" else 0.05):
            drift.append(EconomicsDrift(field=key, stored=stored, computed=computed))

    return ProductEconomics(
        product_id=str(product.get("id", "<no id>")),
        product_type=str(product.get("product_type", "unknown")),
        retail_price=retail,
        cost_breakdown=breakdown,
        missing_fields=missing,
        drift=tuple(drift),
    )


def verify_all_products(products: list[dict[str, Any]]) -> list[ProductEconomics]:
    return [verify_product_economics(p) for p in products]
