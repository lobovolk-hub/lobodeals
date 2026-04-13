import Link from 'next/link'

export const metadata = {
  title: 'Data Deletion | LoboDeals',
  description: 'Instructions for requesting account or data deletion in LoboDeals.',
}

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Support
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Data Deletion Instructions
          </h1>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            If you want your account or related data removed from LoboDeals, use
            the instructions below.
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <section>
            <h2 className="text-xl font-semibold text-white">
              1. How to request deletion
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              Send an email to{' '}
              <a
                href="mailto:admin@lobodeals.com"
                className="font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                admin@lobodeals.com
              </a>{' '}
              with the subject line:
            </p>

            <div className="mt-3 rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3 text-sm font-medium text-zinc-200">
              Data Deletion Request
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              2. What to include
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
              <p>Please include enough information to identify your account, such as:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>the email address linked to your account</li>
                <li>your username, if available</li>
                <li>the provider you used to sign in, if relevant, such as Google or Facebook</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              3. What may be deleted
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
              <p>A deletion request may include removal of:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>your LoboDeals account profile</li>
                <li>tracked games and account-linked preferences</li>
                <li>stored region and interface language preferences</li>
                <li>linked authentication references where applicable</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              4. Verification
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              For security reasons, LoboDeals may request basic verification
              before processing an account deletion request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">
              5. Related policy
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 sm:text-base">
              You can also review the{' '}
              <Link
                href="/privacy"
                className="font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                Privacy Policy
              </Link>{' '}
              for more information.
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