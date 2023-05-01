import type {
	Adapter,
	AdapterFunction,
	KeySchema,
	SessionSchema,
	UserAdapter,
	UserSchema
} from "lucia-auth";
import { transformDatabaseKey, transformDatabaseSession } from "./utils.js";
import { PrismaClient, SmartPrismaClient } from "./prisma.js";

interface PossiblePrismaError {
	code: string;
	message: string;
}

type UserModels = {
	authUser: {
		schema: UserSchema;
		relations: {};
	};
	authKey: {
		schema: KeySchema;
		relations: {
			auth_user: UserSchema;
		};
	};
};

type SessionModels = {
	authSession: {
		schema: SessionSchema;
		relations: {
			auth_user: UserSchema;
		};
	};
};

export default function adapter(
	prismaClient: PrismaClient<UserModels & SessionModels>
): AdapterFunction<Adapter>;
export default function adapter(
	prismaClient: PrismaClient<UserModels>
): AdapterFunction<UserAdapter>;

export default function adapter(
	prismaClient: PrismaClient<(UserModels & SessionModels) | UserModels>
): AdapterFunction<Adapter | UserAdapter> {
	return (LuciaError) => {
		const prisma = prismaClient as SmartPrismaClient<
			(UserModels & SessionModels) | UserModels
		>;

		const userAdapter = {
			getUser: async (userId) => {
				return await prisma.authUser.findUnique({
					where: {
						id: userId
					}
				});
			},
			setUser: async (userId, attributes, key) => {
				if (!key) {
					return await prisma.authUser.create({
						data: {
							id: userId,
							...attributes
						}
					});
				}
				try {
					const [databaseUser] = await prisma.$transaction([
						prisma.authUser.create({
							data: {
								id: userId,
								...attributes
							}
						}),
						prisma.authKey.create({
							data: key
						})
					] as const);
					return databaseUser;
				} catch (e) {
					const error = e as Partial<PossiblePrismaError>;
					if (error.code === "P2002" && error.message?.includes("`id`"))
						throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
					throw error;
				}
			},
			deleteUser: async (userId) => {
				await prisma.authUser.deleteMany({
					where: {
						id: userId
					}
				});
			},
			updateUserAttributes: async (userId, attributes) => {
				try {
					const databaseUser = await prisma.authUser.update({
						data: attributes,
						where: {
							id: userId
						}
					});
					return databaseUser;
				} catch (e) {
					const error = e as Partial<PossiblePrismaError>;
					if (error.code === "P2025")
						throw new LuciaError("AUTH_INVALID_USER_ID");
					throw error;
				}
			},
			setKey: async (key) => {
				try {
					await prisma.authKey.create({
						data: key
					});
				} catch (e) {
					const error = e as Partial<PossiblePrismaError>;
					if (error.code === "P2003")
						throw new LuciaError("AUTH_INVALID_USER_ID");
					if (error.code === "P2002" && error.message?.includes("`id`"))
						throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
					throw error;
				}
			},
			getKey: async (keyId) => {
				const databaseKey = await prisma.authKey.findUnique({
					where: {
						id: keyId
					}
				});
				if (!databaseKey) return null;
				return transformDatabaseKey(databaseKey);
			},
			getKeysByUserId: async (userId) => {
				const keys = await prisma.authKey.findMany({
					where: {
						user_id: userId
					}
				});
				return keys.map((val) => transformDatabaseKey(val));
			},
			updateKeyPassword: async (keyId, hashedPassword) => {
				try {
					return await prisma.authKey.update({
						data: {
							hashed_password: hashedPassword
						},
						where: {
							id: keyId
						}
					});
				} catch (e) {
					const error = e as Partial<PossiblePrismaError>;
					if (error.code === "P2025")
						throw new LuciaError("AUTH_INVALID_KEY_ID");
					throw error;
				}
			},
			deleteKeysByUserId: async (userId) => {
				await prisma.authKey.deleteMany({
					where: {
						user_id: userId
					}
				});
			},
			deleteNonPrimaryKey: async (keyId) => {
				await prisma.authKey.deleteMany({
					where: {
						id: keyId,
						primary_key: false
					}
				});
			}
		} as const satisfies UserAdapter;

		if ("authSession" in prisma) {
			return {
				...userAdapter,
				setSession: async (session) => {
					try {
						await prisma.authSession.create({
							data: session
						});
					} catch (e) {
						const error = e as Partial<PossiblePrismaError>;
						if (error.code === "P2003")
							throw new LuciaError("AUTH_INVALID_USER_ID");
						if (error.code === "P2002" && error.message?.includes("`id`"))
							throw new LuciaError("AUTH_DUPLICATE_SESSION_ID");
						throw error;
					}
				},
				getSessionAndUserBySessionId: async (sessionId) => {
					const data = await prisma.authSession.findUnique({
						where: {
							id: sessionId
						},
						include: {
							auth_user: true
						}
					});
					if (!data) return null;
					const { auth_user: user, ...session } = data;
					return {
						user,
						session: transformDatabaseSession(session)
					};
				},
				getSession: async (sessionId) => {
					const session = await prisma.authSession.findUnique({
						where: {
							id: sessionId
						}
					});
					if (!session) return null;
					return transformDatabaseSession(session);
				},
				getSessionsByUserId: async (userId) => {
					const sessions = await prisma.authSession.findMany({
						where: {
							user_id: userId
						}
					});
					return sessions.map((session) => transformDatabaseSession(session));
				},
				deleteSession: async (sessionId) => {
					await prisma.authSession.delete({
						where: {
							id: sessionId
						}
					});
				},
				deleteSessionsByUserId: async (userId) => {
					await prisma.authSession.deleteMany({
						where: {
							user_id: userId
						}
					});
				}
			} as const satisfies Adapter;
		}

		return userAdapter;
	};
}
