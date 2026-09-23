import http from 'http';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

const PORT = process.env.WEBHOOK_PORT || 3001;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Webhook server running' }));
    return;
  }

  // Webhook endpoint
  if (req.method === 'POST' && req.url === '/api/payhook/callback') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        
        console.log('\n=== PAYHOOK WEBHOOK RECEIVED ===');
        console.log('Time:', new Date().toISOString());
        console.log('Payload:', JSON.stringify(payload, null, 2));

        // Support multiple payload formats
        const data = payload.data || payload;
        
        // Extract reference_id (try multiple field names)
        const referenceId = data.reference_id || data.referenceId || 
                           data.external_id || data.externalId ||
                           data.merchant_ref || data.merchantRef;
        
        // Extract amount
        const paidAmount = data.amount || data.paid_amount || data.paidAmount || 
                          data.total_amount || data.totalAmount || 0;
        
        console.log('Reference ID:', referenceId);
        console.log('Paid Amount:', paidAmount);

        if (!referenceId) {
          console.log('ERROR: No reference_id found');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No reference_id' }));
          return;
        }

        // Parse order ID from reference
        // Formats: "ORDER-123", "DP-123", "TRX-123", or just "123"
        let orderId;
        const match = referenceId.match(/(?:ORDER|DP|TRX)-(\d+)/i);
        if (match) {
          orderId = parseInt(match[1], 10);
        } else if (/^\d+$/.test(referenceId)) {
          orderId = parseInt(referenceId, 10);
        } else {
          console.log('ERROR: Invalid reference_id format');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid reference format' }));
          return;
        }
        
        console.log('Parsed Order ID:', orderId);

        // Connect to Supabase
        const supabase = createClient(supabaseUrl, supabaseKey);
        const trx = supabase.schema('trx');

        // Fetch the order
        const { data: order, error: fetchError } = await trx
          .from('transaction')
          .select('*')
          .eq('id', orderId)
          .single();

        if (fetchError || !order) {
          console.log('ERROR: Order not found:', fetchError?.message);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Order not found' }));
          return;
        }

        console.log('Found order:', order.id);
        console.log('  Total price:', order.total_price);
        console.log('  Already paid:', order.amount_paid);
        console.log('  Current status:', order.payment_status);

        // Calculate expected amount
        const totalPrice = order.total_price || 0;
        const alreadyPaid = order.amount_paid || 0;
        const remainingAmount = totalPrice - alreadyPaid;

        // Determine payment type from reference
        const isDP = referenceId.toUpperCase().includes('DP');
        
        let newAmountPaid = alreadyPaid + paidAmount;
        let newPaymentStatus = order.payment_status;

        // Tolerance for rounding (500 rupiah)
        const tolerance = 500;

        if (paidAmount >= remainingAmount - tolerance) {
          // Full payment or settlement - mark as LUNAS
          newPaymentStatus = 'lunas';
          newAmountPaid = totalPrice;
          console.log('>>> FULL PAYMENT - marking as LUNAS');
        } else if (paidAmount > 0) {
          // Partial payment - mark as DP
          newPaymentStatus = 'dp';
          console.log('>>> PARTIAL PAYMENT - marking as DP');
        }

        // Update the order
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
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Update failed' }));
          return;
        }

        console.log('=== PAYMENT UPDATED SUCCESSFULLY ===');
        console.log('  New amount_paid:', newAmountPaid);
        console.log('  New payment_status:', newPaymentStatus);
        console.log('');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          order_id: orderId,
          payment_status: newPaymentStatus,
          amount_paid: newAmountPaid
        }));

      } catch (error) {
        console.error('ERROR:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Internal error' }));
      }
    });
    return;
  }

  // Test endpoint - simulate webhook
  if (req.method === 'GET' && req.url?.startsWith('/test/')) {
    // Format: /test/ORDER-123/150000
    const parts = req.url.split('/');
    const referenceId = parts[2];
    const amount = parseInt(parts[3] || '0', 10);

    if (!referenceId || !amount) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Usage: /test/ORDER-{id}/{amount}',
        example: '/test/ORDER-123/150000'
      }));
      return;
    }

    // Simulate webhook by calling ourselves
    const payload = JSON.stringify({
      event: 'payment.success',
      data: {
        reference_id: referenceId,
        amount: amount,
        status: 'SUCCESS',
        paid_at: new Date().toISOString()
      }
    });

    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/payhook/callback',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });

    proxyReq.write(payload);
    proxyReq.end();
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    error: 'Not found',
    endpoints: {
      'GET /': 'Health check',
      'POST /api/payhook/callback': 'Webhook endpoint',
      'GET /test/ORDER-{id}/{amount}': 'Test/simulate payment'
    }
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('  PAYHOOK WEBHOOK SERVER');
  console.log('========================================');
  console.log(`  Running on port ${PORT}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('  - GET  /                        Health check');
  console.log('  - POST /api/payhook/callback    Webhook');
  console.log('  - GET  /test/ORDER-{id}/{amt}   Simulate payment');
  console.log('');
  console.log('  Example test:');
  console.log(`  curl http://localhost:${PORT}/test/ORDER-123/150000`);
  console.log('========================================');
  console.log('');
});
