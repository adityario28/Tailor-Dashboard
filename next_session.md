# 📋 Next Session Handover & Action Plan

This document outlines the core features, improvements, and testing checklists for the next development session.

---

## 🚀 Upcoming Features

### 💵 1. Down Payment (DP) & Settlement Printing
Currently, the system assumes all transactions are paid in full or registered in a simple single-step print layout. In a real-world tailoring workflow, customers often pay a smaller down payment when the order is created, and settle the remaining balance (Paid Off) when picking up their garments.

> [!IMPORTANT]
> **Key Flow to Implement:**
> 1. **Initial Order Creation (Down Payment):**
>    - Add a field for `down_payment` or `amount_paid` during transaction submission.
>    - Generate a print receipt explicitly showing **Down Payment (DP)**, **Remaining Balance**, and a **"Belum Lunas" (Unpaid)** status badge.
> 2. **Final Pick-Up (Paid Off):**
>    - Allow cashiers to locate an active transaction in the Dashboard and click a **"Selesaikan Pembayaran / Lunas" (Settle / Pay Off)** button.
>    - Update transaction status to `Siap Diambil` (or a dedicated `Lunas` state).
>    - Print a final receipt showing **Total Price**, **Previous DP**, **Final Payment**, and a **"LUNAS" (PAID OFF)** stamp.

---

## 🧪 Testing Checklist

Make sure to thoroughly test these core components in the next session to guarantee system stability and offline capabilities:

- [ ] **1. Create Order Flow**
  - [ ] Submit the tailor form with all 8 required measurements.
  - [ ] Validate proper default calculation of cloth length (`panjang_kain`) based on selected garment types.
  - [ ] Confirm print dialog triggers automatically with both copies (Customer + Tailor labels).
  - [ ] Verify entry is successfully stored in IndexedDB (`db.transaction`).

- [ ] **2. Customer Search & Autocomplete**
  - [ ] Test the React-hydrated `CustomerSearch` component on the `new-order.astro` page.
  - [ ] Search for existing customers and verify details auto-fill the form correctly.
  - [ ] Choose "Pelanggan Baru" (New Customer) and verify form resets/clears for fresh input.

- [ ] **3. Size Chart Preset System**
  - [ ] Save an order as a new size profile (preset).
  - [ ] Verify the preset is added to `db.preset_customer`.
  - [ ] Reload the page, select that customer, and verify their saved preset size chart fills out the 8 measurement fields correctly.

- [ ] **4. Dashboard & Status Flow**
  - [ ] Verify the metrics (Total, Active, Ready to Pick) update immediately when new orders are created.
  - [ ] Test the forward-only status dropdown in the Dashboard list.
  - [ ] Verify changing status updates the transaction locally in IndexedDB.

---

## 🌐 Offline & Sync Capabilities

> [!TIP]
> Ensure to test the offline-first robustness of the app:
> 1. Turn off your internet connection.
> 2. Create multiple transactions and customers.
> 3. Verify they are stored locally in IndexedDB with `synced: false`.
> 4. Go back online and check if `syncPending()` triggers successfully to push data to Supabase and mark entries as `synced: true`.
