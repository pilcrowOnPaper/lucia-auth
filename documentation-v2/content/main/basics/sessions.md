---
order: 2
title: "Sessions"
description: "Learn about sessions in Lucia"
---

A session allows Lucia to keep track of requests made by authenticated users. They are identified by their id, which is used as a credential that identifies and authenticate the user. Session ids can be stored in a cookie or used as a traditional token manually added to each request.

Sessions should be created and stored on registration and login, validated on every request, and deleted on sign out.

```ts
const session: Session = {
	sessionId: "CAbc9LAUY3Q18f0s92Jo817dna8eDtmRrUrDuVFM", // 40 chars
	user: {
		userId: "laRZ8RgA34YYcgj"
	}, // `User` object
	activePeriodExpiresAt: new Date(),
	idlePeriodExpiresAt: new Date(),
	state: "active", // or "idle"
	fresh: false
};
```

### Session states

Sessions can be in one of 3 states:

- Active: A valid session. Goes "idle" after some time.
- Idle: Still a valid session but must be renewed by Lucia. Goes "dead" after some time.
- Dead: An invalid session. The user must sign in again.

This allows sessions to be persisted for active users, while invalidating inactive users. If you have used access tokens and refresh tokens, Lucia's sessions are a combination of both. Active sessions are your access tokens, and idle sessions are your refresh tokens.

### Validating requests

Requests can be validated by validating the session id included. There are mainly ways to send sessions: cookies and bearer tokens. Cookies are preferred for regular websites and web-apps, whereas bearer tokens are preferred for standalone servers for mobile/desktop apps. Refer to [Handle requests]() page to learn more about how to validate and work with incoming requests from your clients.

## Defining session attributes

You can define custom session attributes by returning them in [`getSessionAttributes()`]() configuration. As long as the required fields are defined in the session table, you can add any number of fields to the session table.

```ts
import { lucia } from "lucia";

lucia({
	// ...
	getSessionAttributes: (databaseSession) => {
		return {
			createdAt: databaseSession.created_at
		};
	}
});

const session: Session = await auth.validateSession(sessionId);
// `sessionId` etc are always included
const { sessionId, createdAt } = session;

// `getSessionAttributes()` params
// `Lucia.DatabaseSessionAttributes`: see next section
type DatabaseSession = {
	// session table must have these fields
	id: string;
	user_id: string;
	active_expires: number;
	idle_expires;
} & Lucia.DatabaseSessionAttributes;
```

### Typing additional fields in the session table

Additional fields in your session table should be defined in [`Lucia.DatabaseSessionAttributes`]().

```ts
/// <reference types="lucia" />
declare namespace Lucia {
	// ...
	type DatabaseSessionAttributes = {
		// do not include required fields (e.g. id, user_id, etc)
		created_at: Date;
	}; // =>
}
```

## Create sessions

[`Auth.createSession()`]() can be used to create a new session. It takes a user id and returns the newly created session. If the user id is invalid, it will throw `AUTH_INVALID_USER_ID`.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const session = await auth.createSession(userId);
	const sessionCookie = auth.createSessionCookie(session);
	setSessionCookie(session);
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_USER_ID`) {
		// invalid user id
	}
	// unexpected database errors
}
```

If you have properties defined in `Lucia.DatabaseSessionAttributes`, pass whatever you defined to `attributes`.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const session = await auth.createSession(userId, {
		attributes: {
			created_at: new Date()
		} // expects `Lucia.DatabaseSessionAttributes`
	});
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_USER_ID`) {
		// invalid user id
	}
	// provided session attributes violates database rules (e.g. unique constraint)
	// or unexpected database errors
}
```

### Session attributes errors

If the session attributes provided violates a database rule (such a unique constraint), Lucia will throw the database/driver/ORM error instead of a regular `LuciaError`. For example, if you're using Prisma, Lucia will throw a Prisma error.

## Validate sessions

Sessions can be validated using [`Auth.validateSession()`](). This will renew idle sessions, which may be unwanted if you're sending your session id via an authorization header. [Use `Auth.getSession()`]() instead if you do not want to renew idle sessions.

It will return the session provided if it's active, or a newly created sessions if the provided session was idle and hence renewed. You can check if the returned session was newly created with the `Session.fresh` property. If the session is dead (invalid), it will throw `AUTH_INVALID_SESSION_ID`.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const session = await auth.validateSession(sessionId);
	if (session.fresh) {
		// newly created
		const sessionCookie = auth.createSessionCookie(session);
		setSessionCookie(session);
	}
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_SESSION_ID`) {
		// invalid session
		deleteSessionCookie();
	}
	// unexpected database errors
}
```

## Get sessions

You can get a session with [`Auth.getSession()`](). Unlike `Auth.validateSession()`, it will not renew idle sessions and as such, the returned session may be active or idle.

It takes a session id, and returns the session if it exists or throw `AUTH_INVALID_SESSION_ID` if not.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const session = await auth.validateSession(sessionId);
	if (session.state === "active") {
		// valid sessions
	} else {
		// idle session
		// should be renewed
	}
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_SESSION_ID`) {
		// invalid session
	}
	// unexpected database errors
}
```

### Get all user sessions

You can get all valid sessions of a user, both active and idle, with [`Auth.getAllUserSessions()`](). It will throw `AUTH_INVALID_USER_ID` if the provided user is invalid.

```ts
import { auth } from "./lucia.js";

try {
	const sessions = await auth.getAllUserSessions(userId);
} catch (e) {
	if (e instanceof LuciaError && e.message === "AUTH_INVALID_USER_ID") {
		// invalid user id
	}
	// unexpected database error
}
```

## Renew sessions

You can renew a valid session (active or idle) using [`Auth.renewSession()`](). The session provided will be invalidated immediately, and a new session will be created and returned. It will throw `AUTH_INVALID_SESSION_ID` if the provided session is invalid.

The newly created session will inherit all the session attribute values of the provided session.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const session = await auth.renewSession(sessionId);
	const sessionCookie = auth.createSessionCookie(session);
	setSessionCookie(session);
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_SESSION_ID`) {
		// invalid session
	}
	// unexpected database errors
}
```

## Invalidate sessions

You can invalidate sessions with [`Auth.invalidateSession()`](). This will succeed regardless of the validity of the session.

```ts
import { auth } from "./lucia.js";

await auth.invalidateSession(sessionId);
```

### Invalid all user sessions

[`Auth.invalidateAllUserSessions()`]() can be used to invalidate all sessions belonging to a user. This will succeed regardless of the validity of the user id.

```ts
import { auth } from "./lucia.js";

await auth.invalidateAllUserSessions(userId);
```

## Update session attributes

You can update attributes of a session with [`Auth.updateSessionAttributes()`](). You can update a single field or multiple fields. It returns the update session, or throws `AUTH_INVALID_SESSION_ID` if the session does not exist.

In general however, **invalidating the current session and creating a new session is preferred.**


```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

try {
	const user = await auth.updateSessionAttributes(
		sessionId,
		{
			updated_at: new Date()
		} // expects partial `Lucia.DatabaseUserAttributes`
	);
} catch (e) {
	if (e instanceof LuciaError && e.message === `AUTH_INVALID_SESSION_ID`) {
		// invalid user id
	}
	// provided session attributes violates database rules (e.g. unique constraint)
	// or unexpected database errors
}
```

## Delete dead user sessions

You can delete dead user sessions with [`Auth.deleteDeadUserSessions()`]() to cleanup your database. It may be useful to call this whenever a user signs in or signs out. This will succeed regardless of the validity of the user id.

```ts
import { auth } from "./lucia.js";

await auth.deleteDeadUserSessions(userId);
```

## Configuration

You can configure sessions in a few ways:

- Session attributes with [`getSessionAttributes()`]()
- Session expiration with [`sessionExpiresIn`]()