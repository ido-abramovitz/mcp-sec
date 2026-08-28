import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/enterprise", "/assessments", "/scanner", "/methodology"].map((path) => ({ url: `https://mcpsecurity.cloud${path}`, changeFrequency: path === "" ? "weekly" : "monthly", priority: path === "" ? 1 : .8 })); }
