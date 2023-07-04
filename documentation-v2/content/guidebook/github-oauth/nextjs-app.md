---
title: "Github OAuth in Next.js App Router"
description: "Learn the basic of Lucia and the OAuth integration by implementing Github OAuth in Next.js App Router"
menuTitle: "Next.js App Router"
---

_Before starting, make sure you've [setup Lucia and your database](/start-here/getting-started/nextjs-app)._

This guide will cover how to implement Github OAuth using Lucia in Next.js App router. It will have 3 parts:

- A sign up page
- An endpoint to authenticate users with Github
- A profile page with a logout button

### Clone project

You can get started immediately by cloning the Next.js example from the repository.

```
npx degit pilcrowonpaper/lucia/examples/nextjs-app/github-oauth <directory_name>
```

Alternatively, you can [open it in StackBlitz](https://stackblitz.com/github/pilcrowOnPaper/lucia/tree/main/examples/nextjs-app/github-oauth).

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

Set [`sessionCookie.expires`](/basics/configuration#sessioncookie) to false since we can't update the session cookie when validating them.

```ts
// auth/lucia.ts
import { lucia } from "lucia";
import { nextjs } from "lucia/middleware";

export const auth = lucia({
	adapter: ADAPTER,
	env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
	middleware: nextjs(),

	sessionCookie: {
		expires: false
	}
});

export type Auth = typeof auth;
```

We'll also expose the user's Github username to the `User` object by defining [`getUserAttributes`](/basics/configuration#getuserattributes).

```ts
// auth/lucia.ts
import { lucia } from "lucia";
import { nextjs } from "lucia/middleware";

export const auth = lucia({
	adapter: ADAPTER,
	env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
	middleware: nextjs(),
	sessionCookie: {
		expires: false
	},

	getUserAttributes: (data) => {
		return {
			username: data.username
		};
	}
});

export type Auth = typeof auth;
```

## Initialize the OAuth integration

Install the OAuth integration.

```
npm i @lucia-auth/oauth
pnpm add @lucia-auth/oauth
yarn add @lucia-auth/oauth
```

Import the Github OAuth integration, and initialize it using your credentials.

```ts
// auth/lucia.ts
import { lucia } from "lucia";
import { nextjs } from "lucia/middleware";

import { github } from "@lucia-auth/oauth/providers";

export const auth = lucia({
	// ...
});

export const githubAuth = github(auth, {
	clientId: process.env.GITHUB_CLIENT_ID ?? "",
	clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
});

export type Auth = typeof auth;
```

## Sign in page

Create `app/login/page.tsx`. It will have a "Sign in with Github" button (actually a link).

```tsx
// app/login/page.tsx

const Page = async () => {
	return (
		<>
			<h1>Sign in</h1>
			<a href="/login/github">Sign in with Github</a>
		</>
	);
};

export default Page;
```

When a user clicks the link, the destination (`/login/github`) will redirect the user to Github to be authenticated.

## Authenticate with Github

As a general overview of OAuth, the user is redirected to github.com to be authenticated, and Github redirects the user back to your application with a code that can be validated and used to get the user's identity.

### Generate authorization url

Create `app/login/github/route.ts` and handle GET requests. This will create a new Github authorization url, where the user will be authenticated in github.com. When generating an authorization url, Lucia will also create a new state. This should be stored as a http-only cookie to be used later.

```ts
// app/login/github/route.ts
import { auth, githubAuth } from "@/auth/lucia";
import { cookies } from "next/headers";

import type { NextRequest } from "next/server";

export const GET = async (request: NextRequest) => {
	const [url, state] = await githubAuth.getAuthorizationUrl();
	const cookieStore = cookies();
	// store state
	cookieStore.set("github_oauth_state", state, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 60
	});
	return new Response(null, {
		status: 302,
		headers: {
			Location: url.toString()
		}
	});
};
```

### Validate callback

Create `app/login/github/callback/route.ts` and handle GET requests.

When the user authenticates with Github, Github will redirect back the user to your site with a code and a state. This state should be checked with the one stored as a cookie, and if valid, validate the code with [`GithubProvider.validateCallback()`](). This will return [`GithubUserAuth`]() if the code is valid, or throw an error if not.

After successfully creating a user, we'll create a new session with [`Auth.createSession()`](/reference/lucia/interfaces/auth#createsession) and store it as a cookie with [`AuthRequest.setSession()`](). [`AuthRequest`]() can be created by calling [`Auth.handleRequest()`]() with `cookies()` and `Request`.

```ts
// app/login/github/callback/route.ts
import { auth, githubAuth } from "@/auth/lucia";
import { OAuthRequestError } from "@lucia-auth/oauth";
import { cookies } from "next/headers";

import type { NextRequest } from "next/server";

export const GET = async (request: NextRequest) => {
	const cookieStore = cookies();
	const storedState = cookieStore.get("github_oauth_state")?.value;
	const url = new URL(request.url);
	const state = url.searchParams.get("state");
	const code = url.searchParams.get("code");
	// validate state
	if (!storedState || !state || storedState !== state || !code) {
		return new Response(null, {
			status: 400
		});
	}
	try {
		const { existingUser, githubUser, createUser } =
			await githubAuth.validateCallback(code);

		const getUser = async () => {
			if (existingUser) return existingUser;
			const user = await createUser({
				attributes: {
					github_username: githubUser.login
				}
			});
			return user;
		};

		const user = await getUser();
		const session = await auth.createSession({
			userId: user.userId,
			attributes: {}
		});
		authRequest.setSession(session);
		return new Response(null, {
			status: 302,
			headers: {
				Location: "/" // redirect to profile page
			}
		});
	} catch (e) {
		if (e instanceof OAuthRequestError) {
			// invalid code
			return new Response(null, {
				status: 400
			});
		}
		return new Response(null, {
			status: 500
		});
	}
};

```

#### Authenticate user with Lucia

You can check if the user has already registered with your app by checking `GithubUserAuth.existingUser`. Internally, this is done by checking if a [key]() with the Github user id already exists.

If they're a new user, you can create a new Lucia user (and key) with [`GithubUserAuth.createUser()`](). The type for `attributes` property is `Lucia.DatabaseUserAttributes`, which we added `github_username` to previously. You can access the Github user data with `GithubUserAuth.githubUser`, as well as the access tokens with `GithubUserAuth.githubTokens`.

```ts
const { existingUser, githubUser, createUser } =
	await githubAuth.validateCallback(code);

const getUser = async () => {
	if (existingUser) return existingUser;
	const user = await createUser({
		attributes: {
			github_username: githubUser.login
		}
	});
	return user;
};

const user = await getUser();
```

### Redirect authenticated users

Authenticated users should be redirected to the profile page whenever they try to access the sign in page. You can validate requests by creating by calling [`AuthRequest.validate()`](/reference/lucia/interfaces/authrequest#validate). This method returns a [`Session`](/reference/lucia/interfaces#session) if the user is authenticated or `null` if not.

Since `Request` is not available in pages, set it to `null`. This should only be done for GET requests.

```tsx
// app/login/page.tsx
import { auth } from "@/auth/lucia";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const Page = async () => {
	const authRequest = auth.handleRequest({
		request: null,
		cookies
	});
	const session = await authRequest.validate();
	if (session) redirect("/");
	return (
		<>
			<h1>Sign in</h1>
			<a href="/login/github">Sign in with Github</a>
		</>
	);
};

export default Page;
```

## Profile page

Create `app/page.tsx`. This page will show some basic user info and include a logout button.

Unauthenticated users should be redirected to the login page. The user object is available in `Session.user`, and you'll see that `User.username` exists because we defined it in first step with `getUserAttributes()` configuration.

```tsx
// app/page.tsx
import { auth } from "@/auth/lucia";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import Form from "@/components/form"; // expect error - see next section

const Page = async () => {
	const authRequest = auth.handleRequest({
		request: null,
		cookies
	});
	const session = await authRequest.validate();
	if (!session) redirect("/login");
	return (
		<>
			<h1>Profile</h1>
			<p>User id: {session.user.userId}</p>
			<p>Username: {session.user.username}</p>
			<Form action="/api/logout" successRedirect="/">
				<input type="submit" value="Sign out" />
			</Form>
		</>
	);
};

export default Page;
```

### Form component

Since the form will require client side JS, we will extract it into its own client component. We will not be using redirect responses as `fetch()` does not actually redirect the user, nor does the redirect url is exposed in the response object.

```tsx
// components/form.tsx
"use client";

import { useRouter } from "next/navigation";

const Form = ({
	children,
	action,
	successRedirect
}: {
	children: React.ReactNode;
	action: string;
	successRedirect: string;
}) => {
	const router = useRouter();
	return (
		<Form
			action={action}
			method="post"
			onSubmit={async (e) => {
				e.preventDefault();
				const formData = new FormData(e.currentTarget);
				const response = await fetch(action, {
					method: "POST",
					body: formData,
					redirect: "manual"
				});

				if (response.status === 0 || response.ok) {
					router.push(successRedirect);
				}
			}}
		>
			{children}
		</Form>
	);
};

export default Form;
```


### Sign out users

Create `app/api/logout/route.ts` and handle POST requests.

When logging out users, it's critical that you invalidate the user's session. This can be achieved with [`Auth.invalidateSession()`](/reference/lucia/interfaces/auth#invalidatesession). You can delete the session cookie by overriding the existing one with a blank cookie that expires immediately. This can be created by passing `null` to `AuthRequest.setSession()`.

```ts
// app/api/logout/route.ts
import { auth } from "@/auth/lucia";
import { cookies } from "next/headers";

import type { NextRequest } from "next/server";

export const POST = async (request: NextRequest) => {
	const authRequest = auth.handleRequest({ request, cookies });
	// check if user is authenticated
	const session = await authRequest.validate();
	if (!session) {
		return new Response(null, {
			status: 401
		});
	}
	// make sure to invalidate the current session!
	await auth.invalidateSession(session.sessionId);
	// delete session cookie
	authRequest.setSession(null);
	return new Response(null, {
		status: 302,
		headers: {
			Location: "/login" // redirect to login page
		}
	});
};
```