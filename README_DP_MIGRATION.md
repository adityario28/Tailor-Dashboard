# Down Payment (DP) Feature Migration Guide

## 1. Run SQL Migration in Supabase

Copy and paste the contents of `supabase_migration_payment.sql` into your Supabase SQL Editor and execute it.

This will:
- Add `total_price`, `amount_paid`, and `payment_status` columns to the transaction table
- Update the audit log trigger to track payment changes

## 2. Clear Browser Data (Optional but Recommended)

Since we've upgraded Dexie from v7 to v8, you may want to clear IndexedDB to ensure a clean migration:

1. Open browser DevTools (F12)
2. Go to Application tab
3. Find IndexedDB > TailorDB
4. Right-click and delete
5. Refresh the page - Dexie will recreate with the new schema

## 3. Features Added

### Dashboard
- New "Status Pembayaran" column showing:
  - **Belum Bayar** (red badge) - No payment yet
  - **DP** (yellow badge) - Down payment made
  - **Lunas** (green badge) - Fully paid

### Order Form (New Order)
- **Total Harga** input field
- **Uang Muka (DP)** input field
- **Sisa Pembayaran** auto-calculated display

### Order Detail Page
- Payment information section showing Total, Amount Paid, and Remaining
- **Bayar DP** button (when payment_status is 'belum_bayar')
- **Settlement Modal** automatically shows when changing status to "Siap Diambil" and payment not yet complete
  - Shows payment summary
  - Payment method selector (Tunai / QRIS)
  - QRIS placeholder for future integration

## 4. Payment Flow

1. **Create Order**: Enter total price and optionally DP amount
2. **Pay DP Later**: If no DP was entered, use "Bayar DP" button on detail page
3. **Final Payment**: When status changes to "Siap Diambil", settlement modal appears
4. **Settlement**: Enter remaining amount, choose payment method, and mark as "Lunas"

## 5. Draft Auto-Save (Pending)

The draft auto-save feature using sessionStorage is prepared but not yet implemented in the UI. This will be added in a future update to prevent data loss during long measurement sessions.

## 6. Print Receipt (TODO)

Print functionality for DP receipt and final settlement receipt is marked as TODO and will be implemented next.

