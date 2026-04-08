import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: Record<string, unknown>;
}

function setMeta(name: string, content: string, attr = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

const JSON_LD_ID = "hirestepx-jsonld";

export function useSEO({ title, description, canonical, ogImage, ogType, jsonLd }: SEOProps) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    setMeta("description", description);
    setMeta("og:title", description, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", ogType || "website", "property");
    setMeta("twitter:title", title, "name");
    setMeta("twitter:description", description, "name");

    if (ogImage) {
      setMeta("og:image", ogImage, "property");
      setMeta("twitter:image", ogImage, "name");
    }

    const canonicalUrl = canonical || `https://hirestepx.com${window.location.pathname}`;
    setLink("canonical", canonicalUrl);
    setMeta("og:url", canonicalUrl, "property");

    // JSON-LD structured data
    if (jsonLd) {
      let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = JSON_LD_ID;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    }

    return () => {
      document.title = prevTitle;
      // Clean up JSON-LD
      const script = document.getElementById(JSON_LD_ID);
      if (script) script.remove();
    };
  }, [title, description, canonical, ogImage, ogType, jsonLd]);
}

/* Helpers for generating JSON-LD */

export function articleJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  image: string;
  datePublished: string;
  author?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    image: opts.image,
    url: opts.url,
    datePublished: opts.datePublished,
    dateModified: opts.datePublished,
    author: {
      "@type": "Organization",
      name: opts.author || "HireStepX",
      url: "https://hirestepx.com",
    },
    publisher: {
      "@type": "Organization",
      name: "HireStepX",
      url: "https://hirestepx.com",
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
  };
}

export function faqJsonLd(faqs: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function webAppJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "HireStepX",
    description: "AI-powered mock interview platform with real-time feedback, score tracking, and personalized coaching.",
    url: "https://hirestepx.com",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      description: "Free plan with 3 interview sessions",
    },
  };
}
