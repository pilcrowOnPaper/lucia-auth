---
title: "Github OAuth in Express"
description: "Learn the basic of Lucia and the OAuth integration by implementing Github OAuth in Express"
menuTitle: "Express"
---

_Before starting, make sure you've [setup Lucia and your database](/start-here/getting-started/express)._

This guide will cover how to implement Github OAuth using Lucia in Express. It will have 3 parts:

- A sign up page
- An endpoint to authenticate users with Github
- A profile page with a logout button

### Clone project

You can get started immediately by cloning the Express example from the repository.

```
npx degit pilcrowonpaper/lucia/examples/express/github-oauth <directory_name>
```

Alternatively, you can [open it in StackBlitz](https://stackblitz.com/github/pilcrowOnPaper/lucia/tree/main/examples/express/github-oauth).

## Create an OAuth app

[Create a Github OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Set the redirect uri to:

```
http://localhost:3000/login/github/callback
```

Copy and paste the client id and client secret into your `.env` file:

```bash
# .env
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
```

## Update your database

Add a `github_username` column to your table. It should be a `string` (`TEXT`, `VARCHAR` etc) type (optionally unique).

Make sure you update `Lucia.DatabaseUserAttributes` whenever you add any new columns to the user table.

```ts
// app.d.ts

/// <reference types="lucia" />
declare namespace Lucia {
	type Auth = import("./lucia.js").Auth;
	type DatabaseUserAttributes = {
		github_username: string;
	};
	type DatabaseSessionAttributes = {};
}
```

## Configure Lucia

We'll expose the user's Github username to the `User` object by defining [`getUserAttributes`](/basics/configuration#getuserattributes).

```ts
// lucia.ts
import { lucia } from "lucia";
import { express } from "lucia/middleware";

export const auth = lucia({
	adapter: ADAPTER,
	env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
	middleware: express(),

	getUserAttributes: (data) => {
		return {
			githubUsername: data.github_username
		};
	}
});

export type Auth = typeof auth;
```

## Configure Express

Since we'll be using `application/x-www-form-urlencoded` to send forms, install `body-parser`.

```ts
import express from "express";
import bodyParser from "body-parser";

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
```

## Sign up page

Create `signup.html` and add a form with inputs for username and password

```html
<h1>Sign up</h1>
<form method="post">
	<label for="username">Username</label>
	<input name="username" id="username" /><br />
	<label for="password">Password</label>
	<input type="password" name="password" id="password" /><br />
	<input type="submit" />
</form>
<a href="/login">Sign in</a>
```

### Create users

Users can be created with [`Auth.createUser()`](/reference/lucia/interfaces/auth#createuser). This will create a new user, and if `key` is defined, a new key. The key here defines the connection between the user and the provided unique username (`providerUserId`) when using the username & password authentication method (`providerId`). We'll also store the password in the key. This key will be used get the user and validate the password when logging them in. The type for `attributes` property is `Lucia.DatabaseUserAttributes`, which we added `username` to previously.

After successfully creating a user, we'll create a new session with [`Auth.createSession()`](/reference/lucia/interfaces/auth#createsession) and store it as a cookie with [`AuthRequest.setSession()`](). [`AuthRequest`]() can be created by calling [`Auth.handleRequest()`]() with Express' `Request` and `Response`.

```ts
import { auth } from "./lucia.js";

app.get("/signup", async (req, res) => {
	return renderPage("signup.html"); // example
});

app.post("/signup", async (req, res) => {
	const { username, password } = req.body;
	// basic check
	if (
		typeof username !== "string" ||
		username.length < 4 ||
		username.length > 31
	) {
		return res.status(400).send("Invalid username");
	}
	if (
		typeof password !== "string" ||
		password.length < 6 ||
		password.length > 255
	) {
		return res.status(400).send("Invalid password");
	}
	try {
		const user = await auth.createUser({
			key: {
				providerId: "username", // auth method
				providerUserId: username, // unique id when using "username" auth method
				password // hashed by Lucia
			},
			attributes: {
				username
			}
		});
		const session = await auth.createSession({
			userId: user.userId,
			attributes: {}
		});
		const authRequest = auth.handleRequest(req, res);
		authRequest.setSession(session);
		// redirect to profile page
		return res.status(302).setHeader("Location", "/").end();
	} catch (e) {
		// this part depends on the database you're using
		// check for unique constraint error in user table
		if (
			e instanceof SomeDatabaseError &&
			e.message === USER_TABLE_UNIQUE_CONSTRAINT_ERROR
		) {
			return res.status(400).send("Username already taken");
		}

		return res.status(500).send("An unknown error occurred");
	}
});
```

#### Error handling

Lucia throws 2 types of errors: [`LuciaError`](/reference/lucia/main#luciaerror) and database errors from the database driver or ORM you're using. Most database related errors, such as connection failure, duplicate values, and foreign key constraint errors, are thrown as is. These need to be handled as if you were using just the driver/ORM.

```ts
if (
	e instanceof SomeDatabaseError &&
	e.message === USER_TABLE_UNIQUE_CONSTRAINT_ERROR
) {
	// username already taken
}
```

### Redirect authenticated users

Authenticated users should be redirected to the profile page whenever they try to access the sign in page. You can validate requests by creating a new [`AuthRequest` instance](/reference/lucia/interfaces/authrequest) with [`Auth.handleRequest()`](/reference/lucia/interfaces/auth#handlerequest), which is stored as `Astro.locals.auth`, and calling [`AuthRequest.validate()`](/reference/lucia/interfaces/authrequest#validate). This method returns a [`Session`](/reference/lucia/interfaces#session) if the user is authenticated or `null` if not.

```ts
import { auth } from "./lucia.js";

app.get("/signup", async (req, res) => {
	const authRequest = auth.handleRequest(req, res);
	const session = await authRequest.validate();
	if (session) {
		// redirect to profile page
		return res.status(302).setHeader("Location", "/").end();
	}
	return renderPage("signup.html"); // example
});

app.post("/signup", async (req, res) => {
	// ...
});
```

## Sign in page

Create `login.html` and add a form with inputs for username and password.

```html
<h1>Sign in</h1>
<form method="post">
	<label for="username">Username</label>
	<input name="username" id="username" /><br />
	<label for="password">Password</label>
	<input type="password" name="password" id="password" /><br />
	<input type="submit" />
</form>
<a href="/signup">Create an account</a>
```

### Authenticate users

The key we created for the user allows us to get the user via their username, and validate their password. This can be done with [`Auth.useKey()`](/reference/lucia/interfaces/auth#usekey). If the username and password is correct, we'll create a new session just like we did before. If not, Lucia will throw an error.

```ts
import { auth } from "./lucia.js";
import { LuciaError } from "lucia";

app.get("/login", async (req, res) => {
	return renderPage("login.html"); // example
});

app.post("/login", async (req, res) => {
	const { username, password } = req.body;
	// basic check
	if (
		typeof username !== "string" ||
		username.length < 1 ||
		username.length > 31
	) {
		return res.status(400).send("Invalid username");
	}
	if (
		typeof password !== "string" ||
		password.length < 1 ||
		password.length > 255
	) {
		return res.status(400).send("Invalid password");
	}
	try {
		// find user by key
		// and validate password
		const user = await auth.useKey("username", username, password);
		const session = await auth.createSession({
			userId: user.userId,
			attributes: {}
		});
		const authRequest = auth.handleRequest(req, res);
		authRequest.setSession(session);
		// redirect to profile page
		return res.status(302).setHeader("Location", "/").end();
	} catch (e) {
		// check for unique constraint error in user table
		if (
			e instanceof LuciaError &&
			(e.message === "AUTH_INVALID_KEY_ID" ||
				e.message === "AUTH_INVALID_PASSWORD")
		) {
			return res.status(400).send("Incorrect username or password");
		}

		return res.status(500).send("An unknown error occurred");
	}
});
```

### Redirect authenticated users

As we did in the sign up page, redirect authenticated users to the profile page.

```ts
import { auth } from "./lucia.js";

app.get("/login", async (req, res) => {
	const authRequest = auth.handleRequest(req, res);
	const session = await authRequest.validate();
	if (session) {
		// redirect to profile page
		return res.status(302).setHeader("Location", "/").end();
	}
	return renderPage("login.html"); // example
});

app.post("/login", async (req, res) => {
	// ...
});
```

## Profile page

Create `index.html`. This will show some basic user info and include a logout button.

```html
<h1>Profile</h1>
<!-- some template stuff -->
<p>User id: %%user_id%%</p>
<p>Username: %%username%%</p>
<form method="post" action="/logout">
	<input type="submit" value="Sign out" />
</form>
```

### Get authenticated user

Unauthenticated users should be redirected to the login page. The user object is available in `Session.user`, and you'll see that `User.username` exists because we defined it in first step with `getUserAttributes()` configuration.

```ts
import { auth } from "./lucia.js";

app.get("/", async (req, res) => {
	const authRequest = auth.handleRequest(req, res);
	const session = await authRequest.validate();
	if (!session) {
		// redirect to login page
		return res.status(302).setHeader("Location", "/login").end();
	}
	return renderPage("index.html", {
		// display dynamic data
		user_id: session.user.userId, // replace '%%user_id%%'
		username: session.user.username // replace '%%username%%'
	});
});
```

### Sign out users

When logging out users, it's critical that you invalidate the user's session. This can be achieved with [`Auth.invalidateSession()`](/reference/lucia/interfaces/auth#invalidatesession). You can delete the session cookie by overriding the existing one with a blank cookie that expires immediately. This can be created by passing `null` to `Auth.createSessionCookie()`.

```ts
import { auth } from "./lucia.js";

app.post("/logout", async (req, res) => {
	const authRequest = auth.handleRequest(req, res);
	const session = await authRequest.validate();
	if (!session) {
		return res.sendStatus(401);
	}
	await auth.invalidateSession(session.sessionId);
	authRequest.setSession(null);
	// redirect back to login page
	return res.status(302).setHeader("Location", "/login").end();
});
```