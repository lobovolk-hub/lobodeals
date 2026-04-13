import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy | LoboDeals',
  description: 'Privacy Policy for LoboDeals.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            Last updated: April 12, 2026
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Overview</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              LoboDeals is a game discovery and price tracking platform. This
              policy explains what information may be stored when you create an
              account, sign in, track games, or interact with your profile and
              preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              2. Information we may store
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
              <p>Depending on how you use LoboDeals, we may store:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>your email address</li>
                <li>your username</li>
                <li>authentication provider information, such as Google or Facebook</li>
                <li>your tracked games or favorites</li>
                <li>your profile preferences, such as region and interface language</li>
                <li>basic technical and security information needed to keep the service working</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              3. How your information is used
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
              <p>Your information may be used to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>create and maintain your account</li>
                <li>let you sign in and keep your session active</li>
                <li>save your tracked games and profile settings</li>
                <li>show prices according to your selected region</li>
                <li>improve platform stability, security, and product quality</li>
                <li>respond to support or account-related requests</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              4. Authentication providers
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              If you sign in using a third-party provider such as Google or
              Facebook, LoboDeals may receive basic account data made available by
              that provider, such as your email address and profile name, in
              order to authenticate your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Region and language preferences
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              LoboDeals may store your selected region and interface language so
              the platform can remember your preferred experience. Region is used
              for price context. Interface language is used for UI preference.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              6. Account and data requests
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              If you want to request deletion of your account or personal data,
              please review the instructions on the{' '}
              <Link
                href="/data-deletion"
                className="font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                Data Deletion
              </Link>{' '}
              page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Contact</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              For privacy-related questions, contact:{' '}
              <a
                href="mailto:admin@lobodeals.com"
                className="font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                admin@lobodeals.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            ← Back to home
          </Link>
        </div>
      </section>
    </main>
  )
}