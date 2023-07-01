---
title: "Sign in with email and password in Next.js Pages Router"
menuTitle: "Next.js Pages Router"
description: "Learn the basic of Lucia by implementing a basic username and password authentication in Next.js Pages Router"
---

_Before starting, make sure you've [setup Lucia and your database](/start-here/getting-started/nextjs-pages)._

This guide will cover how to implement a simple username and password authentication using Lucia in Next.js Pages Router. It will have 3 parts:

- A sign up page
- A sign in page
- A profile page with a logout button

## Update your database

Add a `username` column to your table. It should be a `string` (`TEXT`, `VARCHAR` etc) type that's unique.

Make sure you update `Lucia.DatabaseUserAttributes` whenever you add any new columns to the user table.

```ts
// env.d.ts

/// <reference types="lucia" />
declare namespace Lucia {
	type Auth = import("./lucia.js").Auth;
	type DatabaseUserAttributes = {
		username: string;
	};
	type DatabaseSessionAttributes = {};
}
```

## Configure Lucia

We lso want to expose the user's username to the `User` object returned by Lucia's APIs. We'll define [`getUserAttributes`](/basics/configuration#getuserattributes) and return the username.

```ts
// auth/lucia.ts
import { lucia } from "lucia";
import { nextjs } from "lucia/middleware";

export const auth = lucia({
	adapter: ADAPTER,
	env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
	middleware: nextjs(),

	getUserAttributes: (data) => {
		return {
			username: data.username
		};
	}
});
```

## Sign up page

Create `pages/signup.tsx` and add a form with inputs for username and password. The form should make a POST request to `/api/signup`.

```tsx
// pages/signup.tsx
import { auth } from "../auth/lucia";
import { useRouter } from "next/router";

import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<{}>> => {
	// TODO
};

const Page = () => {
	const router = useRouter();
	return (
		<>
			<h1>Sign up</h1>
			<form
				method="post"
				action="/api/signup"
				onSubmit={async (e) => {
					e.preventDefault();
					const formData = new FormData(e.currentTarget);
					const response = await fetch("/api/signup", {
						method: "POST",
						body: formData
					});
					if (response.ok) {
						router.push("/"); // redirect to profile page on success
					}
				}}
			>
				<label for="username">Username</label>
				<input name="username" id="username" />
				<label for="password">Password</label>
				<input type="password" name="password" id="password" />
				<input type="submit" />
			</form>
		</>
	);
};

export default Page;
```

### Create users

Create `pages/api/signup.ts` and handle POST requests.

Users can be created with [`Auth.createUser()`](/reference/lucia/interfaces/auth#createuser). This will create a new user, and if `key` is defined, a new key. The key here defines the connection between the user and the provided unique username (`providerUserId`) when using the username & password authentication method (`providerId`). We'll also store the password in the key. This key will be used get the user and validate the password when logging them in. The type for `attributes` property is `Lucia.DatabaseUserAttributes`, which we added `username` to previously.

After successfully creating a user, we'll create a new session with [`Auth.createSession()`](/reference/lucia/interfaces/auth#createsession) and store it as a cookie with [`AuthRequest.setSession()`](). [`AuthRequest`]() can be created by calling [`Auth.handleRequest()`]() with `IncomingMessage` and `OutgoingMessage`.

```ts
// pages/api/signup.ts
import { auth } from "../../auth/lucia";

import type { NextApiRequest, NextApiResponse } from "next";

export default async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== "POST") return res.status(405);
	const { username, password } = req.body as {
		username: unknown;
		password: unknown;
	};
	// basic check
	if (
		typeof username !== "string" ||
		username.length < 4 ||
		username.length > 31
	) {
		return res.status(400).json({
			error: "Invalid username"
		});
	}
	if (
		typeof password !== "string" ||
		password.length < 6 ||
		password.length > 255
	) {
		return res.status(400).json({
			error: "Invalid password"
		});
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
		const authRequest = auth.handleRequest({
			req,
			res
		});
		authRequest.setSession(session);
	} catch (e) {
		// this part depends on the database you're using
		// check for unique constraint error in user table
		if (
			e instanceof SomeDatabaseError &&
			e.message === USER_TABLE_UNIQUE_CONSTRAINT_ERROR
		) {
			return res.status(400).json({
				error: "Username already taken"
			});
		}

		return res.status(500).json({
			error: "An unknown error occurred"
		});
	}
};
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

Authenticated users should be redirected to the profile page whenever they try to access the sign up page. You can validate requests by creating by calling [`AuthRequest.validate()`](/reference/lucia/interfaces/authrequest#validate). This method returns a [`Session`](/reference/lucia/interfaces#session) if the user is authenticated or `null` if not.

```tsx
// pages/signup.tsx
import { auth } from "../auth/lucia";
import { useRouter } from "next/router";

import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<{}>> => {
	const authRequest = auth.handleRequest(context);
	const session = await authRequest.validate();
	if (session) {
		return {
			redirect: {
				destination: "/",
				permanent: false
			}
		};
	}
	return {
		props: {}
	};
};

const Page = () => {
	// ...
};

export default Page;
```

## Sign in page

Create `pages/login.tsx` and also add a form with inputs for username and password. The form should make a POST request to `/api/login`.

```tsx
// pages/login.tsx
import { auth } from "../auth/lucia";
import { useRouter } from "next/router";

import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<{}>> => {
	// TODO
};

const Page = () => {
	const router = useRouter();
	return (
		<>
			<h1>Sign in</h1>
			<form
				method="post"
				action="/api/login"
				onSubmit={async (e) => {
					e.preventDefault();
					const formData = new FormData(e.currentTarget);
					const response = await fetch("/api/login", {
						method: "POST",
						body: formData
					});

					if (response.ok) {
						router.push("/"); // redirect to profile page on success
					}
				}}
			>
				<label for="username">Username</label>
				<input name="username" id="username" />
				<label for="password">Password</label>
				<input type="password" name="password" id="password" />
				<input type="submit" />
			</form>
		</>
	);
};

export default Page;
```

### Authenticate users

Create `pages/api/login.ts` and handle POST requests.

The key we created for the user allows us to get the user via their username, and validate their password. This can be done with [`Auth.useKey()`](/reference/lucia/interfaces/auth#usekey). If the username and password is correct, we'll create a new session just like we did before. If not, Lucia will throw an error.

```ts
// pages/api/login.ts
import { auth } from "../../auth/lucia";

import type { NextApiRequest, NextApiResponse } from "next";

export default async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== "POST") return res.status(405);
	const { username, password } = req.body as {
		username: unknown;
		password: unknown;
	};
	// basic check
	if (
		typeof username !== "string" ||
		username.length < 4 ||
		username.length > 31
	) {
		return res.status(400).json({
			error: "Invalid username"
		});
	}
	if (
		typeof password !== "string" ||
		password.length < 6 ||
		password.length > 255
	) {
		return res.status(400).json({
			error: "Invalid password"
		});
	}
	try {
		// find user by key
		// and validate password
		const user = await auth.useKey("username", username, password);
		const session = await auth.createSession({
			userId: user.userId,
			attributes: {}
		});
		const authRequest = auth.handleRequest({
			req,
			res
		});
		authRequest.setSession(session);
	} catch (e) {
		if (
			e instanceof LuciaError &&
			(e.message === "AUTH_INVALID_KEY_ID" ||
				e.message === "AUTH_INVALID_PASSWORD")
		) {
			return res.status(400).json({
				error: "Incorrect username of password"
			});
		}
		return res.status(500).json({
			error: "An unknown error occurred"
		});
	}
};
```

### Redirect authenticated users

As we did in the sign up page, redirect authenticated users to the profile page.

```ts
// pages/login.tsx
import { auth } from "../auth/lucia";
import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<{}>> => {
	const authRequest = auth.handleRequest(context);
	const session = await authRequest.validate();
	if (session) {
		return {
			redirect: {
				destination: "/",
				permanent: false
			}
		};
	}
	return {
		props: {}
	};
};

const Page = () => {
	// ...
};

export default Page;
```

## Profile page

Create `pages/index.tsx`. This page will show some basic user info and include a logout button. Expect TS errors for now since we haven't defined `getServerSideProps()` yet.

```tsx
// pages/index.tsx
import { auth } from "../auth/lucia";
import { useRouter } from "next/router";

import type {
	GetServerSidePropsContext,
	GetServerSidePropsResult,
	InferGetServerSidePropsType
} from "next";

// expect error for now
export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<
	GetServerSidePropsResult<{
		userId: string;
		username: string;
	}>
> => {
	// TODO
};

const Page = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
	return (
		<>
			<h1>Profile</h1>
			<p>User id: {props.userId}</p>
			<p>Username: {props.username}</p>
			<form
				method="post"
				action="/api/logout"
				onSubmit={async (e) => {
					e.preventDefault();
					const formData = new FormData(e.currentTarget);
					const response = await fetch("/api/logout", {
						method: "POST"
					});
					if (response.ok) {
						router.push("/login"); // redirect to login page on success
					}
				}}
			>
				<input type="submit" value="Sign out" />
			</form>
		</>
	);
};

export default Page;
```

### Get authenticated users

Unauthenticated users should be redirected to the login page. The user object is available in `Session.user`, and you’ll see that `User.username` exists because we defined it in first step with `getUserAttributes()` configuration.

```tsx
// pages/index.tsx
import { auth } from "../auth/lucia";
import { useRouter } from "next/router";

import type {
	GetServerSidePropsContext,
	GetServerSidePropsResult,
	InferGetServerSidePropsType
} from "next";

export const getServerSideProps = async (
	context: GetServerSidePropsContext
): Promise<
	GetServerSidePropsResult<{
		userId: string;
		username: string;
	}>
> => {
	const authRequest = auth.handleRequest(context);
	const session = await authRequest.validate();
	if (!session) {
		return {
			redirect: {
				destination: "/login",
				permanent: false
			}
		};
	}
	return {
		props: {
			userId: session.user.userId,
			username: session.user.username
		}
	};
};

const Page = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
	// ...
};

export default Page;
```

### Sign out users

Create `pages/api/logout.ts` and handle POST requests.

When logging out users, it's critical that you invalidate the user's session. This can be achieved with [`Auth.invalidateSession()`](/reference/lucia/interfaces/auth#invalidatesession). You can delete the session cookie by overriding the existing one with a blank cookie that expires immediately. This can be created by passing `null` to `Auth.createSessionCookie()`.

```ts
// pages/api/logout.ts
import { auth } from "../../auth/lucia";

import type { NextApiRequest, NextApiResponse } from "next";

export default async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== "POST") return res.status(405);
	const authRequest = await auth.handleRequest({ req, res });
	// check if user is authenticated
	const session = await authRequest.validate();
	if (!session) {
		return res.status(401).json({
			error: "Not authenticated"
		});
	}
	// make sure to invalidate the current session!
	await auth.invalidateSession(session.sessionId);
	// delete session cookie
	context.locals.auth.setSession(null);
};
```