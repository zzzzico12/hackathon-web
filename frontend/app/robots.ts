import type { MetadataRoute } from "next";

// 個人利用のみ: 検索エンジンにインデックスさせない
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
