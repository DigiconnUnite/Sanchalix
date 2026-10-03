/** Spreads a payment over invoices in the order given (oldest first), filling each before moving to the next. */
export function allocateInOrder(invoices: { id: string; balanceMinor: number }[], amountMinor: number) {
  let remaining = amountMinor;
  const allocations: { invoiceId: string; amountMinor: number }[] = [];
  for (const invoice of invoices) {
    const part = Math.min(remaining, invoice.balanceMinor);
    if (part > 0) allocations.push({ invoiceId: invoice.id, amountMinor: part });
    remaining -= part;
  }
  return { allocations, unallocatedMinor: remaining };
}
