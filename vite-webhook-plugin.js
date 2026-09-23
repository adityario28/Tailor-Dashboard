import { createClient } from '@supabase/supabase-js';

export function webhookPlugin() {
  return {
    name: 'webhook-plugin',
    configureServer(server) {
      // Webhook endpoint
      server.middlewares.use('/api/payhook/callback', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            try {
              const payload = JSON.parse(body);
              
              console.log('\n=== PAYHOOK WEBHOOK RECEIVED ===');
              console.log('Time:', new Date().toISOString());
              console.log('Payload:', JSON.stringify(payload, null, 2));

              const data = payload.data || payload;
              
              const referenceId = data.reference_id || data.referenceId || 
                                 data.external_id || data.externalId ||
                                 data.merchant_ref || data.merchantRef;
              
              const paidAmount = data.amount || data.paid_amount || data.paidAmount || 
                                data.total_amount || data.totalAmount || 0;
              
              console.log('Reference ID:', referenceId);
              console.log('Paid Amount:', paidAmount);

              if (!referenceId) {
                console.log('ERROR: No reference_id found');
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'No reference_id' }));
                return;
              }

              let orderId;
              const match = referenceId.match(/(?:ORDER|DP|TRX)-(\d+)/i);
              if (match) {
                orderId = parseInt(match[1], 10);
              } else if (/^\d+$/.test(referenceId)) {
                orderId = parseInt(referenceId, 10);
              } else {
                console.log('ERROR: Invalid reference_id format');
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'Invalid reference format' }));
                return;
              }
              
              console.log('Parsed Order ID:', orderId);

              // Connect to Supabase
              const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
              const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
              const supabase = createClient(supabaseUrl, supabaseKey);
              const trx = supabase.schema('trx');

              const { data: order, error: fetchError } = await trx
                .from('transaction')
                .select('*')
                .eq('id', orderId)
                .single();

              if (fetchError || !order) {
                console.log('ERROR: Order not found:', fetchError?.message);
                res.statusCode = 404;
                res.end(JSON.stringify({ success: false, error: 'Order not found' }));
                return;
              }

              console.log('Found order:', order.id);
              console.log('  Total price:', order.total_price);
              console.log('  Already paid:', order.amount_paid);
              console.log('  Current status:', order.payment_status);

              const totalPrice = order.total_price || 0;
              const alreadyPaid = order.amount_paid || 0;
              const remainingAmount = totalPrice - alreadyPaid;

              const isDP = referenceId.toUpperCase().includes('DP');
              
              let newAmountPaid = alreadyPaid + paidAmount;
              let newPaymentStatus = order.payment_status;

              const tolerance = 500;

              if (paidAmount >= remainingAmount - tolerance) {
                newPaymentStatus = 'lunas';
                newAmountPaid = totalPrice;
                console.log('>>> FULL PAYMENT - marking as LUNAS');
              } else if (paidAmount > 0) {
                newPaymentStatus = 'dp';
                console.log('>>> PARTIAL PAYMENT - marking as DP');
              }

              const { error: updateError } = await trx
                .from('transaction')
                .update({
                  amount_paid: newAmountPaid,
                  payment_status: newPaymentStatus,
                  updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

              if (updateError) {
                console.log('ERROR: Update failed:', updateError.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: 'Update failed' }));
                return;
              }

              console.log('=== PAYMENT UPDATED SUCCESSFULLY ===');
              console.log('  New amount_paid:', newAmountPaid);
              console.log('  New payment_status:', newPaymentStatus);
              console.log('');

              res.statusCode = 200;
              res.end(JSON.stringify({ 
                success: true, 
                order_id: orderId,
                payment_status: newPaymentStatus,
                amount_paid: newAmountPaid
              }));

            } catch (error) {
              console.error('ERROR:', error.message);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: 'Internal error' }));
            }
          });
          return;
        }

        // GET for health check
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'Webhook endpoint ready',
            usage: 'POST with { data: { reference_id: "ORDER-123", amount: 150000 } }'
          }));
          return;
        }

        next();
      });

      // Test endpoint - simulate webhook
      server.middlewares.use('/api/payhook/test', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const referenceId = url.searchParams.get('ref');
        const amount = parseInt(url.searchParams.get('amount') || '0', 10);

        res.setHeader('Content-Type', 'application/json');

        if (!referenceId || !amount) {
          res.statusCode = 400;
          res.end(JSON.stringify({ 
            error: 'Missing parameters',
            usage: '/api/payhook/test?ref=ORDER-123&amount=150000'
          }));
          return;
        }

        // Make internal request to callback
        const payload = {
          event: 'payment.success',
          data: {
            reference_id: referenceId,
            amount: amount,
            status: 'SUCCESS',
            paid_at: new Date().toISOString()
          }
        };

        try {
          const response = await fetch('http://localhost:3000/api/payhook/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const result = await response.json();
          res.statusCode = response.status;
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });

      console.log('\n========================================');
      console.log('  WEBHOOK ENDPOINTS ACTIVE');
      console.log('========================================');
      console.log('  POST /api/payhook/callback    Webhook');
      console.log('  GET  /api/payhook/test        Simulate');
      console.log('');
      console.log('  Test example:');
      console.log('  /api/payhook/test?ref=ORDER-123&amount=150000');
      console.log('========================================\n');
    }
  };
}
