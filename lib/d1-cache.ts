export function d1Cache(db:D1Database){
  async function get(table:string,key:string,id:string){const row=await db.prepare(`SELECT payload FROM ${table} WHERE ${key}=?`).bind(id).first<{payload:string}>();return row?JSON.parse(row.payload):null;}
  async function set(table:string,key:string,id:string,data:any){return db.prepare(`INSERT INTO ${table} (${key},payload,updated_at) VALUES(?,?,?) ON CONFLICT(${key}) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`).bind(id,JSON.stringify(data),new Date().toISOString()).run();}
  return {getWallet:(address:string)=>get('wallet_cache','address',address),setWallet:(address:string,data:any)=>set('wallet_cache','address',address,data),getMetadata:(id:string)=>get('metadata_cache','id',id),setMetadata:(id:string,data:any)=>set('metadata_cache','id',id,data)};
}
