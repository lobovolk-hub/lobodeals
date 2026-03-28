export interface Env {
  REFRESH_URL: string
  INTERNAL_REFRESH_TOKEN: string
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    try {
      const res = await fetch(env.REFRESH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.INTERNAL_REFRESH_TOKEN}`,
        },
      })

      const text = await res.text()

      console.log(
        JSON.stringify({
          ok: res.ok,
          status: res.status,
          body: text,
        })
      )
    } catch (error) {
      console.error('Scheduled refresh failed', error)
    }
  },
}