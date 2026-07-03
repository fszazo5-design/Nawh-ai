export function formatCurrency(amount, currency = 'SAR') {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount ?? 0)
}

export function formatDate(dateStr) {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

export function calcProfit(revenue, cost) {
  const profit = (revenue ?? 0) - (cost ?? 0)
  const margin = revenue ? (profit / revenue) * 100 : 0
  return { profit, margin: parseFloat(margin.toFixed(2)) }
}
