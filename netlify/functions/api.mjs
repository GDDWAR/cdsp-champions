// Netlify Function: todas as rotas /api/* do CDSP Champions.
// Os dados ficam no Netlify Blobs (armazenamento do próprio site, sem banco externo).
import { getStore } from "@netlify/blobs";
import { handle } from "../../server/api-core.mjs";

function netlifyStore() {
  const s = getStore({ name: "cdsp-champions", consistency: "strong" });
  return {
    async getJSON(key) {
      const r = await s.getWithMetadata(key, { type: "json" });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async setJSON(key, data, opts = {}) {
      const r = await s.setJSON(key, data, opts);
      return { modified: r?.modified ?? true, etag: r?.etag };
    },
    async getBytes(key) {
      const r = await s.get(key, { type: "arrayBuffer" });
      return r ? Buffer.from(r) : null;
    },
    async setBytes(key, buf) {
      await s.set(key, buf);
    },
    async delete(key) {
      await s.delete(key);
    },
  };
}

export default async (req) => handle(req, netlifyStore(), process.env);

export const config = { path: "/api/*" };
