// Every visitor-facing string of the demo: the banner's locale strings and the page chrome.
import type { LocaleStrings } from "@edgesweden/consent/astro";

export const consentStrings: Record<"en" | "sv", LocaleStrings> = {
  en: {
    title: "Cookies on this site",
    description:
      "We use a necessary cookie to remember your choice. With your consent we also measure visits and show relevant offers. Read more in our {link:privacy}.",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    settings: "Settings",
    save: "Save choices",
    close: "Decide later",
    alwaysActive: "Always active",
    settingsTitle: "Cookie settings",
    settingsDescription: "Choose which optional categories to allow. See our {link:privacy}.",
    links: [{ id: "privacy", label: "privacy policy", href: "/privacy/" }],
    categories: {
      necessary: { name: "Necessary", description: "Needed for the site to work." },
      analytics: { name: "Analytics", description: "Counts visits so we can improve the site." },
      marketing: { name: "Marketing", description: "Shows offers based on your visits." },
    },
    services: {
      session: { name: "Session", description: "Keeps the site working between pages." },
      stats: { name: "Example Stats", description: "Anonymous visit counts." },
      ads: { name: "Example Ads", description: "Offers on other sites." },
    },
  },
  sv: {
    title: "Kakor på den här webbplatsen",
    description:
      "Vi använder en nödvändig kaka för att komma ihåg ditt val. Med ditt samtycke mäter vi också besök och visar relevanta erbjudanden. Läs mer i vår {link:privacy}.",
    acceptAll: "Godkänn alla",
    rejectAll: "Avvisa alla",
    settings: "Inställningar",
    save: "Spara val",
    close: "Bestäm senare",
    alwaysActive: "Alltid aktiv",
    settingsTitle: "Inställningar för kakor",
    settingsDescription: "Välj vilka valfria kategorier du tillåter. Se vår {link:privacy}.",
    links: [{ id: "privacy", label: "integritetspolicy", href: "/sv/integritet/" }],
    categories: {
      necessary: { name: "Nödvändiga", description: "Behövs för att webbplatsen ska fungera." },
      analytics: { name: "Statistik", description: "Räknar besök så att vi kan förbättra sidan." },
      marketing: { name: "Marknadsföring", description: "Visar erbjudanden utifrån dina besök." },
    },
    services: {
      session: { name: "Session", description: "Håller webbplatsen igång mellan sidor." },
      stats: { name: "Example Stats", description: "Anonym besöksräkning." },
      ads: { name: "Example Ads", description: "Erbjudanden på andra webbplatser." },
    },
  },
};

export type PageId = "home" | "about" | "privacy";

/** Each page's path, title and body per locale; the nav, footer and pages read nothing else. */
export const pageStrings = {
  en: {
    pages: {
      home: {
        path: "/",
        title: "Consent demo",
        body: "A neutral site that exercises @edgesweden/consent.",
      },
      about: {
        path: "/about/",
        title: "About",
        body: "A second page, so a choice can be checked across navigation.",
      },
      privacy: {
        path: "/privacy/",
        title: "Privacy policy",
        body: "Placeholder policy text for the demo.",
      },
    },
    otherLanguage: { label: "Svenska", lang: "sv", href: "/sv/" },
    cookieSettings: "Cookie settings",
    withdraw: "Withdraw consent",
    state: "Current consent",
    records: "Recorded choices",
  },
  sv: {
    pages: {
      home: {
        path: "/sv/",
        title: "Samtyckesdemo",
        body: "En neutral webbplats som provar @edgesweden/consent.",
      },
      about: {
        path: "/sv/om/",
        title: "Om",
        body: "En andra sida, så att ett val kan kontrolleras mellan sidor.",
      },
      privacy: {
        path: "/sv/integritet/",
        title: "Integritetspolicy",
        body: "Platshållartext för demons policy.",
      },
    },
    otherLanguage: { label: "English", lang: "en", href: "/" },
    cookieSettings: "Inställningar för kakor",
    withdraw: "Återkalla samtycke",
    state: "Nuvarande samtycke",
    records: "Registrerade val",
  },
} satisfies Record<
  "en" | "sv",
  { pages: Record<PageId, { path: string; title: string; body: string }> } & Record<string, unknown>
>;
