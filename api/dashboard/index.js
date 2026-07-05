import { getDb } from '../_db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sql = getDb();
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || 5);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. الفواتير الأخيرة خفيفة ومباشرة
    if (type === 'recent-invoices') {
      const recentInvoices = await sql`
        SELECT i.*, c.name as customer_name FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC LIMIT ${limit}
      `;
      return jsonResponse(recentInvoices); 
    }

    // 2. إحصائيات الأرقام فقط
    if (type === 'stats') {
      const todayStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count FROM invoices WHERE created_at >= ${today + 'T00:00:00'} AND status != 'cancelled'`;
      const totalStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_count FROM invoices WHERE status != 'cancelled'`;
      const purchaseTotal = await sql`SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE status != 'cancelled'`;
      const expenseTotal = await sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses`;
      const productCount = await sql`SELECT COUNT(*) as count FROM products WHERE is_active = true`;

      const statsObj = {
        todaySales: Number(todayStats[0]?.today_sales || 0),
        todayCount: Number(todayStats[0]?.today_count || 0),
        totalRevenue: Number(totalStats[0]?.total_revenue || 0),
        netProfit: Number(totalStats[0]?.total_revenue || 0) - Number(purchaseTotal[0]?.total || 0) - Number(expenseTotal[0]?.total || 0),
        productCount: Number(productCount[0]?.count || 0),
        totalExpenses: Number(expenseTotal[0]?.total || 0)
      };
      return jsonResponse(statsObj);
    }

    // 3. طلب تجميعي (إذا تم استدعاء الرابط الأساسي بدون فلاتر)
    const todayStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count FROM invoices WHERE created_at >= ${today + 'T00:00:00'} AND status != 'cancelled'`;
    const totalStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_count FROM invoices WHERE status != 'cancelled'`;
    const purchaseTotal = await sql`SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE status != 'cancelled'`;
    const expenseTotal = await sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses`;
    const productCount = await sql`SELECT COUNT(*) as count FROM products WHERE is_active = true`;
    const recentInvoices = await sql`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC LIMIT 5`;

    return jsonResponse({
      stats: {
        todaySales: Number(todayStats[0]?.today_sales || 0),
        todayCount: Number(todayStats[0]?.today_count || 0),
        totalRevenue: Number(totalStats[0]?.total_revenue || 0),
        netProfit: Number(totalStats[0]?.total_revenue || 0) - Number(purchaseTotal[0]?.total || 0) - Number(expenseTotal[0]?.total || 0),
        productCount: Number(productCount[0]?.count || 0),
        totalExpenses: Number(expenseTotal[0]?.total || 0)
      },
      recentInvoices
    });

  } catch (error) {
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500);
  }
}
