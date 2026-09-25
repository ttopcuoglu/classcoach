type FooterContactProps = {
  // Matches the width of the footer row above it — pages use 6xl, the feature guide 5xl.
  widthClassName?: string
}

// The operating entity, mailing address and role addresses, kept on every page
// footer so districts (and app store reviewers) can find a vendor contact
// without reading the Terms.
export default function FooterContact({ widthClassName = 'max-w-6xl' }: FooterContactProps) {
  return (
    <div className={`mx-auto mt-6 mb-12 w-full ${widthClassName} px-6`}>
      <div className="flex flex-col items-center justify-center gap-1 text-center text-xs text-ink-soft sm:flex-row sm:flex-wrap sm:gap-x-4">
        <span>233 Broad Street, Ste 13A #135, Bridgewater, MA 02324</span>
        <a href="mailto:support@wivoza.com" className="hover:text-ink">
          Support: support@wivoza.com
        </a>
        <a href="mailto:hello@wivoza.com" className="hover:text-ink">
          Privacy: hello@wivoza.com
        </a>
      </div>
    </div>
  )
}
