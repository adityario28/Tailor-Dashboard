// Supabase Edge Function: send-wa-notification
// Triggered by Database Webhook on UPDATE trx.transaction
// Sends WhatsApp notification via Fonnte when order status changes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FONNTE_API = 'https://api.fonnte.com/send';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  schema: string;
  record: Record<string, any>;
  old_record: Record<string, any>;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    'Cuci Bahan':   '🧼 Cuci Bahan',
    'Potong Bahan': '✂️ Potong Bahan',
    'Jahit':        '🪡 Jahit',
    'Finishing':    '✨ Finishing',
    'Siap Diambil': '✅ Siap Diambil',
  };
  return map[status] ?? status;
}

function buildMessage(
  customerName: string,
  outfitType: string,
  newStatus: string,
  portalUrl: string
): string {
  const isReady = newStatus === 'Siap Diambil';

  if (isReady) {
    return (
      `Halo *${customerName}*! 👋\n\n` +
      `Kabar baik! Pesanan *${outfitType}* Anda sudah *siap diambil*. ✅\n\n` +
      `Silakan datang ke toko kami untuk mengambil pesanan Anda.\n\n` +
      `Lihat detail: ${portalUrl}\n\n` +
      `Terima kasih telah mempercayai kami! 🙏`
    );
  }

  return (
    `Halo *${customerName}*! 👋\n\n` +
    `Update status pesanan *${outfitType}* Anda:\n` +
    `${formatStatus(newStatus)}\n\n` +
    `Lihat progress lengkap: ${portalUrl}\n\n` +
    `_Kami akan memberitahu Anda setiap ada update._`
  );
}

Deno.serve(async (req: Request) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const payload: WebhookPayload = await req.json();

    // Only process UPDATE events on transaction table
    if (payload.type !== 'UPDATE') {
      return new Response(JSON.stringify({ skipped: 'not an update' }), { status: 200 });
    }

    const newRecord = payload.record;
    const oldRecord = payload.old_record;

    // Skip if status didn't change
    if (newRecord.status === oldRecord.status) {
      return new Response(JSON.stringify({ skipped: 'status unchanged' }), { status: 200 });
    }

    // Skip if customer has no phone
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fonnte_token = Deno.env.get('FONNTE_TOKEN')!;
    const app_url      = Deno.env.get('APP_URL') ?? 'https://your-app-domain.com';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch customer data
    const { data: customer, error: custError } = await supabase
      .schema('trx')
      .from('customer')
      .select('name, phone')
      .eq('id', newRecord.customer_id)
      .single();

    if (custError || !customer) {
      console.error('Customer fetch error:', custError);
      return new Response(JSON.stringify({ error: 'customer not found' }), { status: 200 });
    }

    if (!customer.phone) {
      return new Response(JSON.stringify({ skipped: 'no phone number' }), { status: 200 });
    }

    // Build portal URL
    const portalUrl = `${app_url}/notify?id=${newRecord.portal_token}`;

    // Build WA message
    const message = buildMessage(
      customer.name,
      newRecord.outfit_type ?? 'Pakaian',
      newRecord.status,
      portalUrl
    );

    // Send via Fonnte
    let waStatus = 'failed';
    let errorMsg: string | null = null;

    try {
      const fonnte_res = await fetch(FONNTE_API, {
        method: 'POST',
        headers: {
          'Authorization': fonnte_token,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          target:      customer.phone,
          message:     message,
          countryCode: '62', // Indonesia
        }),
      });

      const fonnte_data = await fonnte_res.json();
      console.log('Fonnte response:', JSON.stringify(fonnte_data));

      if (fonnte_data.status === true) {
        waStatus = 'success';
      } else {
        errorMsg = fonnte_data.reason ?? JSON.stringify(fonnte_data);
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // Insert notification log
    const { error: logError } = await supabase
      .schema('trx')
      .from('notification_log')
      .insert({
        transaction_id: newRecord.id,
        customer_name:  customer.name,
        customer_phone: customer.phone,
        status_sent:    newRecord.status,
        message:        message,
        wa_status:      waStatus,
        error_msg:      errorMsg,
      });

    if (logError) {
      console.error('notification_log insert error:', logError);
    }

    return new Response(
      JSON.stringify({ success: true, wa_status: waStatus }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
