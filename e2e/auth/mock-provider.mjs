// A fake GitHub and Google for the browser tests: the same three steps every provider has
// (authorize, exchange the code, read the profile), answering with a fixed person.
// Runs only on the local test server; the real providers are never contacted.
import { createServer } from "node:http";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost:8790");
  const json = (body) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body));
  };
  if (url.pathname === "/health") return json({ ok: true });

  // Authorize: the "user" approves at once, and is sent back with a code and the state.
  if (url.pathname === "/login/oauth/authorize" || url.pathname === "/google/authorize") {
    if (url.searchParams.get("code_challenge_method") !== "S256") {
      response.statusCode = 400;
      return response.end("PKCE is required");
    }
    const back = new URL(url.searchParams.get("redirect_uri") ?? "");
    back.searchParams.set("code", "fake-code");
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    response.statusCode = 302;
    response.setHeader("Location", back.href);
    return response.end();
  }

  if (url.pathname === "/login/oauth/access_token" || url.pathname === "/google/token") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const form = new URLSearchParams(body);
      const ok =
        form.get("code") === "fake-code" && form.get("code_verifier") && form.get("client_secret");
      if (!ok) response.statusCode = 400;
      json(
        ok
          ? { access_token: "fake-token", token_type: "bearer" }
          : { error: "bad_verification_code" },
      );
    });
    return;
  }

  if (request.headers.authorization !== "Bearer fake-token") {
    response.statusCode = 401;
    return json({ message: "Bad credentials" });
  }
  if (url.pathname === "/user")
    return json({
      login: "ravi-k",
      name: "Ravi Kumar",
      email: "ravi@example.com",
      avatar_url: "https://example.com/a.png",
    });
  if (url.pathname === "/google/userinfo")
    return json({
      name: "Asha Rao",
      given_name: "Asha",
      email: "asha@example.com",
      picture: "https://example.com/p.jpg",
      sub: "123",
    });
  response.statusCode = 404;
  response.end();
});

server.listen(8790, "127.0.0.1");
