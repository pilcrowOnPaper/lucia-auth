import { lucia } from "lucia";
import { nextjs } from "lucia/middleware";
import { github } from "@lucia-auth/oauth/providers";
import { betterSqlite3 } from "@lucia-auth/adapter-sqlite";
// import "lucia/polyfill/node";

import { cache } from "react";
import { cookies } from "next/headers";

import sqlite from "better-sqlite3";
import fs from "fs";

const db = sqlite(":memory:");
db.exec(fs.readFileSync("schema.sql", "utf8"));

export const auth = lucia({
	adapter: betterSqlite3(db, {
		user: "user",
		session: "user_session",
		key: "user_key"
	}),
	env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
	middleware: nextjs(),
	sessionCookie: {
		expires: false
	},
	getUserAttributes: (data) => {
		return {
			githubUsername: data.github_username
		};
	}
});

export const githubAuth = github(auth, {
	clientId: process.env.GITHUB_CLIENT_ID ?? "",
	clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
});

export type Auth = typeof auth;

export const getPageSession = cache(() => {
	const authRequest = auth.handleRequest({
		request: null,
		cookies
	});
	return authRequest.validate();
});
