import { DurableObject } from "cloudflare:workers";

// One Room per code. It will pass sealed introduction messages between the two
// browsers; this stub only proves the routing works.
export class Room extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  }
}
