---
title: "Using cookies"
---

Cookies is the preferred way of storing and sending session ids when the frontend and backend is hosted on the same domain.

If you're working with cookies, **CSRF protection must be implemented** to prevent [cross site request forgery (CSRF)](https://owasp.org/www-community/attacks/csrf).

## Session cookies

By default, session cookies have the following attributes:

- `HttpOnly`
- `SameSite: Lax`
- `Path: /`
- `Secure`

**This means by default, session cookies don't work in `localhost`**. You can configure some of these attributes, as well the cookie name and if the cookie expires or not, with the [`sessionCookie` configuration]().

## Using `AuthRequest`

In addition to the core `Lucia` instance, you can create `AuthRequest` the interact with requests and responses. See [Handle requests]() page to learn how to initialize it.

```ts
const authRequest = auth.handleRequest(/* ... */);
```

### Validate requests

Use [`AuthRequest.validate()`]() to validate the request origin and session cookie. You can configure the CSRF protection with the [`csrfProtection` configuration]().

```ts
const { session, user } = await authRequest.validate();
```

### Set session cookies

Set a new session cookie with [`AuthRequest.setSessionCookie()`](), which just takes a session ID.

```ts
authRequest.setSessionCookie(sessionId);
```

### Delete session cookie

Delete an existing session cookie with [`AuthRequest.authRequest.deleteSessionCookie();
()`]().

```ts
authRequest.deleteSessionCookie();
```

## Using core APIs

`Lucia` core provides some APIs for working with requests.

### Validate requests

Use [`Lucia.verifyRequestOrigin()`]() to verify the request origin (CSRF protection) and [`Lucia.readSessionCookie()`]() to parse the `Cookie` HTTP header. You can configure the CSRF protection with the [`csrfProtection` configuration]().

After validating the session, set a new session cookie to update the session expiration if `Session.fresh` is `true`.

```ts
const headers = new Headers();

const validRequestOrigin = auth.verifyRequestOrigin(headers);
if (!validRequestOrigin) {
	throw new Error("Invalid request origin");
}

const sessionId = auth.readSessionCookie(headers.get("Cookie") ?? "");
if (!sessionId) {
	throw new Error("Missing session cookie");
}

const { session } = await auth.validateSession(sessionId);
if (!session) {
	const blankSessionCookie = auth.createBlankSessionCookie();
	setResponseHeader("Set-Cookie", blankSessionCookie.serialize());
	throw new Error("Not authenticated");
}
if (session.fresh) {
	const sessionCookie = auth.createSessionCookie(session.id);
	setResponseHeader("Set-Cookie", sessionCookie.serialize());
}
```

### Set session cookies

You can create a new [`Cookie`]() with [`Lucia.createSessionCookie()`](), which takes a session ID. You can either use `Cookie.serialize()` to set cookies via the `Set-Cookie` header or use its properties to set cookies with the API provided by your framework/library.

```ts
const sessionCookie = auth.createSessionCookie(sessionId);

// both works
setResponseHeader("Set-Cookie", sessionCookie.serialize());
setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
```

### Delete session cookies

Use [`Lucia.createBlankSessionCookie()`]() to create a blank session cookie that immediately expires. Works similar to `Lucia.createSessionCookie()`.

```ts
const blankSessionCookie = auth.createBlankSessionCookie();

// both works
setResponseHeader("Set-Cookie", blankSessionCookie.serialize());
setCookie(blankSessionCookie.name, blankSessionCookie.value, blankSessionCookie.attributes);
```