/* ============================================================
   VERCEL BACKEND SERVERLESS LOGGING ENDPOINT (location-v2.0)
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
      email, details, status, gps, proximity, session, decision, decisionVersion
    } = body;
    const timestamp = new Date().toISOString();

    if (flow === 'qr_generation') {
      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] QR Generated | Session: ${sessionId} | Teacher Email: ${email} | Generator Lat: ${lat}, Lng: ${lng}, Acc: ${body.teacherAccuracy || 'N/A'}m`);
    } else if (flow === 'qr_scan') {
      const gpsInfo = gps || {};
      const proxInfo = proximity || {};
      const decInfo = decision || {};
      const version = decisionVersion || 'location-v2.0';

      console.log(`[qr_flow] [VERCEL BACKEND LOG] [${timestamp}] [Ver: ${version}] Multi-Signal QR Telemetry | Status: ${status || 'N/A'} | Reason: ${decInfo.decisionReason || body.decisionReason || 'N/A'} | Dist: ${gpsInfo.distanceMeters ?? body.distanceMeters ?? 'N/A'}m | Student: ${name || 'Unknown'} (${rollNo || 'N/A'}, ID: ${studentId}) | Student Acc: ${gpsInfo.studentAccuracy ?? body.studentAccuracy ?? 'N/A'}m | Teacher Acc: ${gpsInfo.teacherAccuracy ?? body.teacherAccuracy ?? 'N/A'}m (${gpsInfo.teacherGpsRating || 'N/A'}) | Spread: ${gpsInfo.positionSpreadMeters ?? body.positionSpreadMeters ?? 'N/A'}m | Samples: ${gpsInfo.validSamplesCount ?? body.validSamplesCount ?? 0}/${gpsInfo.requestedSamplesCount || 8} | Proximity: ${proxInfo.method || 'NONE'} (${proxInfo.detected ? 'DETECTED' : 'NOT_DETECTED'}) | Conf: ${decInfo.locationConfidence || body.locationConfidence || 'N/A'} | Session: ${sessionId}`);
    } else if (flow === 'auth') {
      console.log(`[auth_flow] [VERCEL BACKEND LOG] [${timestamp}] Auth Action: ${action} | Email: ${email} | Details: ${details || 'N/A'}`);
    } else {
      console.log(`[app_log] [VERCEL BACKEND LOG] [${timestamp}] Payload:`, JSON.stringify(body));
    }

    return res.status(200).json({
      success: true,
      loggedAt: timestamp,
      decisionVersion: decisionVersion || 'location-v2.0',
      received: { flow, sessionId, studentId, status }
    });
  } catch (err) {
    console.error('[VERCEL BACKEND ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
