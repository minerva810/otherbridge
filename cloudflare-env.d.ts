declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ALCHEMY_API_KEY?: string;
    OPENSEA_API_KEY?: string;
  }
}
