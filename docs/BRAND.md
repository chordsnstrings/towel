# MOVE at FIVE visual references

The interface follows MOVE at FIVE’s monochrome identity: black surfaces, white wordmarks, broad bold headings, restrained grey details and sharp, uncluttered reception controls. Amber and red are reserved for operational exceptions and errors.

## Sources checked

- [Official MOVE at FIVE, Jumeirah Village](https://jumeirahvillage.fivehotelsandresorts.com/spa-wellbeing/the-gym/)
- [Official July pricing artwork](https://jumeirahvillage.fivehotelsandresorts.com/wp-content/uploads/2026/07/GYM-PRICING-July.pdf)

`public/move-logo.svg` contains the original MOVE at FIVE vector paths extracted from that official pricing artwork. The paths have not been redrawn. The PWA icons in `public/icons/` use these same paths on a black background, with padding for rounded and maskable home-screen icons. The source artwork contains the distinctive M and E forms plus the AT FIVE arrow.

The current official website uses Nimbus Sans D OT Bold Extended for headings. This project bundles the open-source Nimbus Sans Bold fallback from URW Base35 for a self-contained, reliable deployment; it is not the exact proprietary extended font. If the gym supplies its licensed webfont, replace `public/fonts/nimbus-sans-bold.otf` and the `@font-face` definition in `src/styles.css` to make the heading typography exact. The included font’s license is in `public/fonts/LICENSE.txt`.

The supplied member barcode screenshot was used only for local decoder validation. It is not included in the repository, demo data, import template or public assets.

MOVE and FIVE trademarks remain the property of their respective owners. These brand assets are included for the requested MOVE at FIVE reception application.
