
import type { Locale } from '@/lib/locale'
import { t } from '@/lib/i18n'



export default function AboutPage({ locale = 'en' }: { locale?: Locale }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="border-b border-white/10 pb-10">
        <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
          <span className="h-px w-8 bg-[#990303]" aria-hidden="true" />
          {t(locale, "About LoboDeals")}
        </p>

        <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
          {t(locale, "Official stores. Official sale campaigns.")}
        </h1>

        <p className="mt-5 max-w-3xl text-base leading-7 text-[#aaa8a4] sm:text-lg">
          {t(locale, "LoboDeals helps you find official digital game stores and see when their official sale campaigns are live or announced.")}
        </p>
      </header>

      <section
        aria-labelledby="scope-heading"
        className="grid gap-8 py-10 lg:grid-cols-[0.7fr_1.3fr]"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
            {t(locale, "Product boundary")}
          </p>

          <h2
            id="scope-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-white"
          >
            {t(locale, "Directory + Sales")}
          </h2>
        </div>

        <dl className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#171717] px-5 sm:px-7">
          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">{t(locale, "Directory")}</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              {t(locale, "Find the ten official stores LoboDeals follows and the platforms where each store operates.")}
            </dd>
          </div>

          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">{t(locale, "Sales")}</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              {t(locale, "See official store-wide or themed sale campaigns that are live or officially announced.")}
            </dd>
          </div>

          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">{t(locale, "Official links")}</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              {t(locale, "LoboDeals does not sell games. Store and sale links take you to official store or campaign pages.")}
            </dd>
          </div>

          <div className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="font-semibold text-white">{t(locale, "Prices")}</dt>
            <dd className="leading-7 text-[#aaa8a4]">
              {t(locale, "LoboDeals does not track individual game prices, compare prices between stores, or guarantee the lowest price.")}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="how-it-works-heading"
        className="grid gap-8 border-t border-white/10 py-10 lg:grid-cols-[0.7fr_1.3fr]"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
            {t(locale, "How it works")}
          </p>

          <h2
            id="how-it-works-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-white"
          >
            {t(locale, "Official sources, real precision.")}
          </h2>
        </div>

        <div className="grid gap-4">
          <article className="rounded-lg border border-white/10 bg-[#171717] px-5 py-5 sm:px-7">
            <h3 className="font-semibold text-white">
              {t(locale, "Campaigns, not products")}
            </h3>
            <p className="mt-2 leading-7 text-[#aaa8a4]">
              {t(locale, "Campaigns are discovered and verified from official store sources. LoboDeals follows official sale campaigns rather than monitoring every individual discount.")}
            </p>
          </article>

          <article className="rounded-lg border border-white/10 bg-[#171717] px-5 py-5 sm:px-7">
            <h3 className="font-semibold text-white">{t(locale, "Timing")}</h3>
            <p className="mt-2 leading-7 text-[#aaa8a4]">
              {t(locale, "LoboDeals preserves the precision published by the official source. Exact times are only shown when the source provides them. When only a date is published, LoboDeals does not invent a time.")}
            </p>
          </article>

          <article className="rounded-lg border border-white/10 bg-[#171717] px-5 py-5 sm:px-7">
            <h3 className="font-semibold text-white">
              {t(locale, "Commercial relationships")}
            </h3>
            <p className="mt-2 leading-7 text-[#aaa8a4]">
              {t(locale, "If LoboDeals uses an eligible authorized affiliate link, that relationship will be disclosed. Commercial relationships do not affect which stores or sales are listed.")}
            </p>
          </article>
        </div>
      </section>

      <p className="border-t border-white/10 pt-8 text-sm font-semibold text-[#d0cdc7]">
        {t(locale, "A LoboVolk brand")}
      </p>
      <section className="mt-6 space-y-4 text-sm leading-7 text-[#aaa8a4]" aria-labelledby="lobovolk-heading">
        <h2 id="lobovolk-heading" className="text-xl font-semibold text-white">LoboVolk</h2>
        <p>{t(locale, "LoboVolk is an independent gaming brand and the creator behind LoboDeals, focused on video game coverage, reviews, gameplay and gaming content.")}</p>
        <ul className="flex flex-wrap gap-5">
          <li><a className="underline" href="https://www.youtube.com/@LoboVolk">YouTube</a></li>
          <li><a className="underline" href="https://www.tiktok.com/@lobovolk2">TikTok</a></li>
          <li><a className="underline" href="https://www.facebook.com/LoboVolk2">Facebook</a></li>
          <li><a className="underline" href="https://www.instagram.com/lobovolk2/">Instagram</a></li>
        </ul>
        <p><a className="underline" href="mailto:contact@lobodeals.com">contact@lobodeals.com</a><br />{t(locale, "General questions, feedback, corrections.")}</p>
        <p><a className="underline" href="mailto:business@lobodeals.com">business@lobodeals.com</a><br />{t(locale, "Business, partnerships, affiliate matters, publishers/agencies, professional opportunities.")}</p>
      </section>
    </main>
  )
}