export async function GET() {
  try {
    const res = await fetch(
      'https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=60'
    )

    const data = await res.json()

    return Response.json(data.slice(0, 10)) // solo 10 resultados por ahora
  } catch (error) {
    return Response.json({ error: 'Error al obtener deals' }, { status: 500 })
  }
}