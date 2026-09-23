import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    
    console.log('=== PAYHOOK WEBHOOK RECEIVED ===')
    console.log('Payload:', JSON.stringify(payload, null, 2))

    // Support multiple payload formats from Payhook
    const data = payload.data || payload
    
    // Extract reference_id (try multiple field names)
    const referenceId = data.reference || data.reference_id || data.referenceId || 
                       data.external_id || data.externalId ||
                       data.merchant_ref || data.merchantRef ||
                       data.trx_id || data.trxId
    
    // Extract amount - try to parse from various formats
    let paidAmount = Number(data.amount || data.paid_amount || data.paidAmount || 
                       data.total_amount || data.totalAmount || 0)
    
    // Try to extract amount from notification_text if amount is 0 or missing
    if (!paidAmount && data.notification_text) {
      const amountMatch = data.notification_text.match(/Rp\.?\s*([\d.,]+)/i)
      if (amountMatch) {
        paidAmount = Number(amountMatch[1].replace(/\./g, '').replace(',', '.'))
      }
    }
    
    console.log('Reference ID:', referenceId)
    console.log('Paid Amount:', paidAmount)

    // Connect to Supabase with service role key (full access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let orderId: number | null = null
    let order: any = null
    let pendingPaymentId: number | null = null

    // Method 1: Try to find order by reference_id first
    if (referenceId) {
      const match = referenceId.toString().match(/(?:ORDER|DP|TRX)-(\d+)/i)
      if (match) {
        orderId = parseInt(match[1], 10)
      } else if (/^\d+$/.test(referenceId.toString())) {
        orderId = parseInt(referenceId.toString(), 10)
      }
      
      if (orderId) {
        const { data: foundOrder, error } = await supabase
          .schema('trx')
          .from('transaction')
          .select('*')
          .eq('id', orderId)
          .single()
        
        if (!error && foundOrder) {
          order = foundOrder
          console.log('Found order by reference_id:', orderId)
        }
      }
    }

    // Method 2: If no order found by reference, use pending_qris_payment table
    if (!order && paidAmount > 0) {
      console.log('No reference_id match, checking pending_qris_payment table for amount:', paidAmount)
      
      // Find oldest pending payment with matching amount (FIFO)
      const { data: pendingPayment, error } = await supabase
        .schema('trx')
        .from('pending_qris_payment')
        .select('*')
        .eq('amount', paidAmount)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString()) // Not expired
        .order('created_at', { ascending: true }) // FIFO - oldest first
        .limit(1)
        .single()
      
      if (!error && pendingPayment) {
        orderId = pendingPayment.order_id
        pendingPaymentId = pendingPayment.id
        console.log('Found pending payment:', pendingPaymentId, 'for order:', orderId)
        
        // Fetch the order
        const { data: foundOrder, error: orderError } = await supabase
          .schema('trx')
          .from('transaction')
          .select('*')
          .eq('id', orderId)
          .single()
        
        if (!orderError && foundOrder) {
          order = foundOrder
          console.log('Found order from pending payment:', orderId)
        }
      } else {
        console.log('No pending payment found for amount:', paidAmount)
      }
    }

    // If still no order found, return success (might be test ping or unrelated payment)
    if (!order) {
      console.log('No matching order found - might be test or unrelated payment')
      return new Response(
        JSON.stringify({ success: true, message: 'No matching order found', matched: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Processing order:', order.id)
    console.log('  Total price:', order.total_price)
    console.log('  Already paid:', order.amount_paid)
    console.log('  Current status:', order.payment_status)

    const totalPrice = order.total_price || 0
    const alreadyPaid = order.amount_paid || 0
    const remainingAmount = totalPrice - alreadyPaid

    let newAmountPaid = alreadyPaid + paidAmount
    let newPaymentStatus = order.payment_status

    // Check if payment covers remaining amount
    // Use tolerance only for large amounts (>= 10000), max 1% or 500 rupiah
    const tolerance = Math.min(remainingAmount * 0.01, 500)

    if (paidAmount >= remainingAmount - tolerance && paidAmount > 0) {
      // Full payment - mark as LUNAS
      newPaymentStatus = 'lunas'
      newAmountPaid = totalPrice
      console.log('>>> FULL PAYMENT - marking as LUNAS')
    } else if (paidAmount > 0) {
      // Partial payment - mark as DP
      newPaymentStatus = 'dp'
      console.log('>>> PARTIAL PAYMENT - marking as DP')
    }

    // Update the order
    const { error: updateError } = await supabase
      .schema('trx')
      .from('transaction')
      .update({
        amount_paid: newAmountPaid,
        payment_status: newPaymentStatus
      })
      .eq('id', orderId)

    if (updateError) {
      console.log('ERROR: Update failed:', updateError.message)
      return new Response(
        JSON.stringify({ success: false, error: 'Update failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Mark pending payment as matched
    if (pendingPaymentId) {
      await supabase
        .schema('trx')
        .from('pending_qris_payment')
        .update({
          status: 'matched',
          matched_at: new Date().toISOString()
        })
        .eq('id', pendingPaymentId)
      
      console.log('Marked pending payment as matched:', pendingPaymentId)
    }

    console.log('=== PAYMENT UPDATED SUCCESSFULLY ===')
    console.log('  New amount_paid:', newAmountPaid)
    console.log('  New payment_status:', newPaymentStatus)

    return new Response(
      JSON.stringify({ 
        success: true, 
        matched: true,
        order_id: orderId,
        payment_status: newPaymentStatus,
        amount_paid: newAmountPaid
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('ERROR:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
