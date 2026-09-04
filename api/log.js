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
    const {
      flow, action, sessionId, studentId, name, rollNo, lat, lng,
      email, details, distanceMeters, status, decisionReason,
      validSamplesCount, requestedSamplesCount, studentAccuracy,
      teacherAccuracy, positionSpreadMeters, timeDeltaSeconds, locationConfidence
    } = body;
    const timestamp = new Date().toISOString();

    if (flow === 'qr_generation') {
      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] QR Generated | Session: ${sessionId} | Email: ${email} | Generator Lat: ${lat}, Lng: ${lng}, Acc: ${teacherAccuracy || 'N/A'}m`);
    } else if (flow === 'qr_scan') {
      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] QR Scan Telemetry | Status: ${status || 'N/A'} | Reason: ${decisionReason || 'N/A'} | Distance: ${distanceMeters || 'N/A'}m | Student: ${name || 'Unknown'} (${rollNo || 'N/A'}) | Student Lat: ${lat}, Lng: ${lng}, Acc: ${studentAccuracy}m | Spread: ${positionSpreadMeters}m | Valid Samples: ${validSamplesCount}/${requestedSamplesCount || 8} | Conf: ${locationConfidence || 'N/A'} | Delta: ${timeDeltaSeconds}s | Session: ${sessionId}`);
    } else if (flow === 'auth') {
      console.log(`[auth_flow] [VERCEL BACKEND LOG] [${timestamp}] Auth Action: ${action} | Email: ${email} | Details: ${details || 'N/A'}`);
    } else {
      console.log(`[app_log] [VERCEL BACKEND LOG] [${timestamp}] Payload:`, JSON.stringify(body));
    }

    return res.status(200).json({
      success: true,
      loggedAt: timestamp,
      received: { flow, sessionId, studentId, status, distanceMeters, decisionReason }
    });
  } catch (err) {
    console.error('[VERCEL BACKEND ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
