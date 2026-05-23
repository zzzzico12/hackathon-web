import type { MetadataRoute } from "next";
import { fetchHackathons } from "@/lib/api";

const BASE_URL = "https://hackathon.zzzzico.click";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await fetchHackathons({ status: "ALL", limit: 100 }).catch(
    () => ({ items: [], count: 0, next_token: null })
  );

  const hackathonUrls: MetadataRoute.Sitemap = data.items.map((h) => ({
    url: `${BASE_URL}/hackathons/${encodeURIComponent(h.source_id)}`,
    lastModified: h.updated_at ? new Date(h.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    ...hackathonUrls,
  ];
}
