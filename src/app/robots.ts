import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://firststoryfilms.com";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/inquiry"],
      disallow: ["/dashboard/", "/api/", "/login", "/auth/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
