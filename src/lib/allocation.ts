// The allocator that used to live here (buildAllocation) is superseded by
// src/engine/size.ts's allocate() — it didn't enforce the 3-position cap or
// portfolio risk budget correctly and allowed the top-up loop to run past a
// provable bound. See docs/IMPLEMENTATION_PLAN.md Phase 1/2. Formatting
// helpers below are still used throughout the app.

export const inr = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits,
  }).format(value)

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
