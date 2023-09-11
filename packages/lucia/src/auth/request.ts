import { debug } from "../utils/debug.js";

import type { Auth, Env, Session } from "./index.js";
import type { Cookie } from "./cookie.js";
import { LuciaError } from "./error.js";
import { createHeadersFromObject, safeParseUrl } from "../utils/request.js";
import { isAllowedOrigin } from "../utils/url.js";

export type LuciaRequest = {
	method: string;
	url?: string;
	headers: Headers;
};
export type RequestContext = {
	sessionCookie?: string | null;
	request: LuciaRequest;
	setCookie: (cookie: Cookie) => void;
};

export type Middleware<Args extends any[] = any> = (context: {
	args: Args;
	env: Env;
	sessionCookieName: string;
}) => MiddlewareRequestContext;

type MiddlewareRequestContext = Omit<RequestContext, "request"> & {
	sessionCookie?: string | null;
	request: {
		method: string;
		url?: string;
		headers:
			| Headers
			| {
					origin: string | null;
					cookie: string | null;
					authorization: string | null;
			  }; // remove regular object: v3
		storedSessionCookie?: string | null; // remove: v3
	};
	setCookie: (cookie: Cookie) => void;
};

export type CSRFProtectionConfiguration = {
	host?: string;
	hostHeader?: string;
	allowedSubDomains?: string[] | "*";
};

export class AuthRequest<_Auth extends Auth = any> {
	private auth: _Auth;
	private requestContext: RequestContext;
	private csrfProtectionEnabled = true;
	private host: string | null = null;
	private hostHeader = "Host";
	private allowedSubdomains: string[] | "*" = [];

	constructor(
		auth: _Auth,
		config: {
			requestContext: RequestContext;
			csrfProtection: boolean | CSRFProtectionConfiguration;
		}
	) {
		debug.request.init(
			config.requestContext.request.method,
			config.requestContext.request.url ?? "(url unknown)"
		);
		this.auth = auth;
		this.requestContext = config.requestContext;

		const csrfProtectionConfig =
			typeof config.csrfProtection === "object" ? config.csrfProtection : {};
		const csrfProtectionEnabled = config.csrfProtection !== false;

		if (
			!csrfProtectionEnabled ||
			isValidRequestOrigin(this.requestContext.request, csrfProtectionConfig)
		) {
			this.storedSessionId =
				this.requestContext.sessionCookie ??
				auth.readSessionCookie(
					this.requestContext.request.headers.get("Cookie")
				);
		} else {
			this.storedSessionId = null;
		}
		this.bearerToken = auth.readBearerToken(
			this.requestContext.request.headers.get("Authorization")
		);
	}

	private validatePromise: Promise<Session | null> | null = null;
	private validateBearerTokenPromise: Promise<Session | null> | null = null;
	private storedSessionId: string | null;
	private bearerToken: string | null;

	public setSession = (session: Session | null) => {
		const sessionId = session?.sessionId ?? null;
		if (this.storedSessionId === sessionId) return;
		this.validatePromise = null;
		this.setSessionCookie(session);
	};

	private setSessionCookie = (session: Session | null) => {
		const sessionId = session?.sessionId ?? null;
		if (this.storedSessionId === sessionId) return;
		this.storedSessionId = sessionId;
		try {
			this.requestContext.setCookie(this.auth.createSessionCookie(session));
			if (session) {
				debug.request.notice("Session cookie stored", session.sessionId);
			} else {
				debug.request.notice("Session cookie deleted");
			}
		} catch (e) {
			// ignore
		}
	};

	public validate = async (): Promise<Session | null> => {
		if (this.validatePromise) {
			debug.request.info("Using cached result for session validation");
			return this.validatePromise;
		}
		this.validatePromise = new Promise(async (resolve) => {
			if (!this.storedSessionId) return resolve(null);
			try {
				const session = await this.auth.validateSession(this.storedSessionId);
				if (session.fresh) {
					this.setSessionCookie(session);
				}
				return resolve(session);
			} catch (e) {
				if (e instanceof LuciaError) {
					this.setSessionCookie(null);
					return resolve(null);
				}
				throw e;
			}
		});

		return await this.validatePromise;
	};

	public validateBearerToken = async (): Promise<Session | null> => {
		if (this.validateBearerTokenPromise) {
			debug.request.info("Using cached result for bearer token validation");
			return this.validatePromise;
		}
		this.validatePromise = new Promise(async (resolve) => {
			if (!this.bearerToken) return resolve(null);
			try {
				const session = await this.auth.validateSession(this.bearerToken);
				return resolve(session);
			} catch (e) {
				if (e instanceof LuciaError) {
					return resolve(null);
				}
				throw e;
			}
		});

		return await this.validatePromise;
	};
}

const isValidRequestOrigin = (
	request: LuciaRequest,
	config: CSRFProtectionConfiguration
): boolean => {
	const requestOrigin = request.headers.get("Origin");
	if (!requestOrigin) return false;
	if (!requestOrigin) {
		debug.request.fail("No request origin available");
		return false;
	}
	let host: string | null = null;
	if (config.host !== null) {
		host = config.host ?? null;
	} else if (request.url !== null && request.url !== undefined) {
		host = safeParseUrl(request.url)?.host ?? null;
	} else {
		host = request.headers.get(config.hostHeader ?? "Host");
	}
	if (
		host !== null &&
		isAllowedOrigin(requestOrigin, host, config.allowedSubDomains ?? [])
	) {
		debug.request.info("Valid request origin", requestOrigin);
		return true;
	}
	debug.request.info("Invalid request origin", requestOrigin);
	return false;
};

export const transformRequestContext = ({
	request,
	setCookie,
	sessionCookie
}: MiddlewareRequestContext): RequestContext => {
	return {
		request: {
			url: request.url,
			method: request.method,
			headers:
				"authorization" in request.headers
					? createHeadersFromObject(request.headers)
					: request.headers
		},
		setCookie,
		sessionCookie: sessionCookie ?? request.storedSessionCookie
	};
};
