/* ============================================================
   VERCEL BACKEND SERVERLESS LOGGING ENDPOINT
   ============================================================ */

module.exports = async function handler(req, res) {
  // Enable CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};
    const { flow, action, sessionId, studentId, name, rollNo, lat, lng, email, details } = body;
    const timestamp = new Date().toISOString();

    if (flow === 'qr_generation') {
      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] QR Generated | Session ID: ${sessionId} | Teacher Email: ${email} | Generator Lat: ${lat}, Lng: ${lng}`);
    } else if (flow === 'qr_scan') {
      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] Participant Scanned QR | Session ID: ${sessionId} | Student: ${name || 'Unknown'} (Roll: ${rollNo || 'N/A'}, ID: ${studentId}) | Scanner Lat: ${lat}, Lng: ${lng}`);
    } else if (flow === 'auth') {
      console.log(`[auth_flow] [VERCEL BACKEND LOG] [${timestamp}] Auth Action: ${action} | Email: ${email} | Details: ${details || 'N/A'}`);
    } else {
      console.log(`[app_log] [VERCEL BACKEND LOG] [${timestamp}] Payload:`, JSON.stringify(body));
    }

    return res.status(200).json({
      success: true,
      loggedAt: timestamp,
      received: { flow, sessionId, studentId, lat, lng }
    });
  } catch (err) {
    console.error('[VERCEL BACKEND ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
