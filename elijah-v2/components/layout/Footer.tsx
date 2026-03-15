import Link from 'next/link';

const ELIJAH_CHANNELS = [
  { label: 'YouTube', href: 'https://www.youtube.com/@ElijahBryant3' },
  { label: 'Instagram', href: 'https://www.instagram.com/elijahbryant3/' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@elijah.bryant3' },
  { label: 'Twitter / X', href: 'https://x.com/Elijah_Bryant3' },
];

const CONSISTENCY_CLUB_CHANNELS = [
  { label: 'YouTube', href: 'https://www.youtube.com/@ConsistencyClubFilm' },
  { label: 'Instagram', href: 'https://www.instagram.com/consistencyclub3/' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@consistencyclub3' },
];

const ECOSYSTEM_LINKS = [
  { label: 'Newsletter', href: 'https://yourplaybook.beehiiv.com' },
  { label: 'Things I Use', href: '/things-i-use' },
  { label: 'Ask Elijah', href: '#ask-elijah' },
];

function FooterColumn({
  title,
  links,
  external = true,
}: {
  title: string;
  links: { label: string; href: string }[];
  external?: boolean;
}) {
  return (
    <div>
      <p className="font-display text-xl font-light text-brand-text mb-5 tracking-wide">
        {title}
      </p>
      <ul className="flex flex-col gap-3">
        {links.map((link) =>
          external ? (
            <li key={link.label}>
              <a
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={
                  link.href.startsWith('http')
                    ? 'noopener noreferrer'
                    : undefined
                }
                className="font-body text-sm text-muted hover:text-brand-text transition-colors duration-200 tracking-wide"
              >
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.label}>
              <Link
                href={link.href}
                className="font-body text-sm text-muted hover:text-brand-text transition-colors duration-200 tracking-wide"
              >
                {link.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="bg-bg border-t border-white/5 pt-20 pb-10 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        {/* Top statement */}
        <div className="mb-16">
          <p className="font-display text-5xl md:text-7xl lg:text-8xl font-light text-brand-text leading-none">
            Faith{' '}
            <span className="text-muted font-light">+</span>{' '}
            Consistency
          </p>
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16 border-t border-white/5 pt-12">
          <FooterColumn title="Elijah Bryant" links={ELIJAH_CHANNELS} external />
          <FooterColumn
            title="Consistency Club"
            links={CONSISTENCY_CLUB_CHANNELS}
            external
          />
          <div>
            <p className="font-display text-xl font-light text-brand-text mb-5 tracking-wide">
              Ecosystem
            </p>
            <ul className="flex flex-col gap-3">
              {ECOSYSTEM_LINKS.map((link) =>
                link.href.startsWith('http') ? (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-body text-sm text-muted hover:text-brand-text transition-colors duration-200 tracking-wide"
                    >
                      {link.label}
                    </a>
                  </li>
                ) : (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="font-body text-sm text-muted hover:text-brand-text transition-colors duration-200 tracking-wide"
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body text-xs text-dim tracking-widest uppercase">
            © 2024 Elijah Bryant · faith · family · purpose
          </p>
          <p className="font-body text-xs text-dim tracking-widest uppercase">
            Built with faith + consistency
          </p>
        </div>
      </div>
    </footer>
  );
}
