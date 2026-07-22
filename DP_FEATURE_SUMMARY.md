# Down Payment (DP) Feature - Implementation Summary

## ✅ Completed Tasks

### 1. Database Schema Updates
- **File**: `src/lib/db.ts`
  - Added `PaymentStatus` type: `'belum_bayar' | 'dp' | 'lunas'`
  - Added `Draft` interface for future auto-save feature
  - Updated `Transaction` interface with:
    - `total_price?: number`
    - `amount_paid?: number`
    - `payment_status?: PaymentStatus`
  - Upgraded Dexie version from v7 to v8
  - Added `draft` table to schema

### 2. Supabase Migration
- **File**: `supabase_migration_payment.sql`
  - Adds 3 new columns to `trx.transaction` table
  - Updates audit log trigger to track payment field changes
  - **Action Required**: Run this SQL in Supabase SQL Editor

### 3. Dashboard Updates
- **File**: `src/components/OrdersTable.tsx`
  - Added "Status Pembayaran" column
  - Payment status badges:
    - 🔴 Belum Bayar (red)
    - 🟡 DP (yellow)
    - 🟢 Lunas (green)
  - Imports `PaymentStatus` type

### 4. Order Form Updates
- **File**: `src/components/OrderForm.tsx`
  - Added payment fields to `FormState`:
    - `totalPrice: string`
    - `amountPaid: string`
  - Added payment input section in UI:
    - Total Harga input
    - Uang Muka (DP) input
    - Sisa Pembayaran (read-only, auto-calculated)
  - Payment status automatically determined on save:
    - `belum_bayar` if no payment
    - `dp` if partial payment
    - `lunas` if amount_paid >= total_price
  - Updated `resetForm()` to include payment fields

### 5. Order Detail Page Updates
- **File**: `src/components/OrderDetail.tsx`
  - Added imports: `Dialog`, `Select` components, `PaymentStatus` type
  - Added state variables for modals and payment
  - **Payment Information Section**:
    - Displays Total Harga, Sudah Dibayar, Sisa Pembayaran
    - Shows "Bayar DP" button when `payment_status === 'belum_bayar'`
  - **DP Payment Modal**:
    - Input for DP amount
    - Updates `amount_paid` and `payment_status`
  - **Settlement Modal**:
    - Automatically triggered when status changes to "Siap Diambil" and not yet lunas
    - Shows payment summary (Total, DP Paid, Remaining)
    - Payment method selector (Tunai / QRIS)
    - QRIS placeholder (for future integration)
    - "Lunaskan & Cetak" button
  - **Status Save Logic**:
    - Intercepts "Siap Diambil" status change
    - Shows settlement modal if payment incomplete
    - Updates both status and payment in one transaction

### 6. Audit Log Updates
- **File**: `src/components/AuditLogList.tsx`
  - Added labels for payment fields:
    - `total_price`: "Total Harga"
    - `amount_paid`: "Jumlah Dibayar"
    - `payment_status`: "Status Pembayaran"
  - Changes to these fields will now appear in audit log

## 🔄 Payment Flow

### Scenario 1: Pay DP During Order Creation
1. User creates new order
2. Enters Total Harga: Rp 500,000
3. Enters Uang Muka: Rp 200,000
4. System calculates Sisa: Rp 300,000
5. Order saved with `payment_status: 'dp'`
6. Dashboard shows yellow "DP" badge

### Scenario 2: Pay DP Later
1. Order created without DP (`payment_status: 'belum_bayar'`)
2. Dashboard shows red "Belum Bayar" badge
3. User opens order detail
4. Clicks "Bayar DP" button
5. Modal appears, user enters DP amount
6. Payment saved, status changes to `'dp'`

### Scenario 3: Settlement at Pickup
1. Order status progresses through workflow
2. User changes status to "Siap Diambil"
3. Settlement modal automatically appears showing:
   - Total: Rp 500,000
   - DP Paid: Rp 200,000
   - Remaining: Rp 300,000
4. User enters remaining amount (default pre-filled)
5. Selects payment method (Tunai or QRIS)
6. If QRIS selected, QR placeholder shows (to be replaced with real QR)
7. Clicks "Lunaskan & Cetak"
8. System updates:
   - `amount_paid` = total_price
   - `payment_status` = 'lunas'
   - `status` = 'Siap Diambil'
9. Dashboard shows green "Lunas" badge

## 📋 Next Steps (TODO)

### High Priority
1. **Print Receipt Feature**
   - DP receipt when DP is paid
   - Final receipt when order is lunas
   - Format: Thermal 58mm compatible, also works on A4

2. **QRIS Integration**
   - Build dynamic QRIS generation API
   - Integrate with payment gateway
   - Add webhook for payment confirmation
   - Auto-update payment status on successful payment

3. **Draft Auto-Save**
   - Implement sessionStorage auto-save (debounced)
   - Add "Draft Pesanan" button in sidebar
   - Show draft count badge
   - Restore draft on form load

### Medium Priority
4. **Payment History**
   - Track partial payments (multiple DPs)
   - Show payment timeline in order detail
   - Payment receipt print for each transaction

5. **Reports & Analytics**
   - Total revenue (lunas orders)
   - Pending payments (DP orders)
   - Payment method breakdown

### Low Priority
6. **Notifications**
   - Remind for pending payments
   - Alert when payment received (QRIS webhook)

## 🧪 Testing Checklist

- [ ] Run Supabase migration SQL
- [ ] Clear IndexedDB and verify Dexie v8 migration
- [ ] Create new order with DP
- [ ] Create order without DP, pay DP later
- [ ] Change status to "Siap Diambil" and test settlement modal
- [ ] Verify payment status badges in dashboard
- [ ] Check audit log shows payment changes
- [ ] Test offline mode (Dexie sync)
- [ ] Verify tunai vs QRIS payment method selection
- [ ] Test edge cases:
  - DP amount > total price
  - Negative amounts
  - Empty/zero values

## 📁 Files Modified

1. `src/lib/db.ts` - Database schema
2. `src/components/OrdersTable.tsx` - Dashboard table
3. `src/components/OrderForm.tsx` - New order form
4. `src/components/OrderDetail.tsx` - Order detail page
5. `src/components/AuditLogList.tsx` - Audit log labels
6. `supabase_migration_payment.sql` - Database migration (NEW)
7. `README_DP_MIGRATION.md` - Migration guide (NEW)

## 🚀 Deployment Notes

1. **Database First**: Run SQL migration in Supabase before deploying frontend
2. **Clear Cache**: Users may need to clear browser cache/IndexedDB for clean Dexie v8 migration
3. **Backward Compatibility**: Old transactions without payment fields will default to `belum_bayar`
4. **Testing**: Test thoroughly in staging before production

