import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/middleware'
import { handleApiError } from '@/lib/utils/errors'
import { ensureInitialized, db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const auth = await requirePermission(request, 'report.view')
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get('from') || undefined
    const toDate = searchParams.get('to') || undefined
    const partnerId = searchParams.get('partnerId') ? Number(searchParams.get('partnerId')) : undefined

    let where = "WHERE i.type IN ('sales', 'debit_note') AND i.status IN ('posted', 'partial_paid', 'paid')"
    const params: any[] = []
    if (fromDate) { where += ' AND i.invoiceDate >= ?'; params.push(fromDate) }
    if (toDate) { where += ' AND i.invoiceDate <= ?'; params.push(toDate) }
    if (partnerId) { where += ' AND i.businessPartnerId = ?'; params.push(partnerId) }

    const rows = db.prepare(`
      SELECT
        i.id AS invoiceId, i.invoiceNumber, i.invoiceDate, i.partnerName, i.businessPartnerId,
        i.totalAmount, i.paidAmount,
        COALESCE(SUM(CASE WHEN il.lineType = 'service' THEN 0 ELSE il.costAmount * il.quantity END), 0) AS totalCost,
        i.subtotal AS revenue
      FROM invoice i
      JOIN invoice_line il ON il.invoiceId = i.id
      ${where}
      GROUP BY i.id
      ORDER BY i.invoiceDate DESC, i.id DESC
    `).all(...params) as any[]

    const summary = rows.reduce((acc, r) => {
      const cost = r.totalCost || 0
      const profit = (r.revenue || 0) - cost
      acc.totalRevenue += r.revenue || 0
      acc.totalCost += cost
      acc.totalProfit += profit
      return acc
    }, { totalRevenue: 0, totalCost: 0, totalProfit: 0 })

    return NextResponse.json({
      success: true,
      data: rows.map(r => ({
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        partnerName: r.partnerName,
        revenue: r.revenue || 0,
        cost: r.totalCost || 0,
        profit: (r.revenue || 0) - (r.totalCost || 0),
        marginPercent: r.revenue ? Math.round(((r.revenue - (r.totalCost || 0)) / r.revenue) * 1000) / 10 : 0,
      })),
      summary,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
