/* ── Ask Elijah — Export Questions/Users as Excel ── */
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

let supabase;

function initClient() {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Admin auth
  var token = event.queryStringParameters && event.queryStringParameters.token;
  if (token !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  initClient();

  var type = (event.queryStringParameters && event.queryStringParameters.type) || 'questions';

  try {
    var workbook = new ExcelJS.Workbook();

    if (type === 'questions' || type === 'all') {
      var { data: questions } = await supabase
        .from('questions')
        .select('id, user_id, question_text, response_text, confidence, status, notify_user, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      var qSheet = workbook.addWorksheet('Questions');
      qSheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'User ID', key: 'user_id', width: 36 },
        { header: 'Question', key: 'question_text', width: 50 },
        { header: 'Response', key: 'response_text', width: 60 },
        { header: 'Confidence', key: 'confidence', width: 12 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Notify', key: 'notify_user', width: 8 },
        { header: 'Date', key: 'created_at', width: 20 }
      ];
      (questions || []).forEach(function (q) { qSheet.addRow(q); });
    }

    if (type === 'users' || type === 'all') {
      var { data: users } = await supabase
        .from('user_profiles')
        .select('user_id, location_city, location_country, total_questions, first_seen, last_active')
        .order('last_active', { ascending: false })
        .limit(5000);

      var uSheet = workbook.addWorksheet('Users');
      uSheet.columns = [
        { header: 'User ID', key: 'user_id', width: 36 },
        { header: 'City', key: 'location_city', width: 20 },
        { header: 'Country', key: 'location_country', width: 20 },
        { header: 'Questions', key: 'total_questions', width: 12 },
        { header: 'First Seen', key: 'first_seen', width: 20 },
        { header: 'Last Active', key: 'last_active', width: 20 }
      ];
      (users || []).forEach(function (u) { uSheet.addRow(u); });
    }

    var buffer = await workbook.xlsx.writeBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=ask-elijah-export-' + Date.now() + '.xlsx'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Export error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
