import { mysql2Runner } from "./runner.js";
import { createCoreAdapter } from "../core.js";
import { createOperator } from "../query.js";

import type { Adapter, AdapterFunction } from "lucia-auth";
import type { Pool, QueryError, Connection } from "mysql2/promise";
import { MySQLUserSchema } from "../utils.js";

export const mysql2Adapter = (db: Pool): AdapterFunction<Adapter> => {
	const transaction = async <_Execute extends () => Promise<any>>(
		execute: _Execute
	) => {
		const connection = await db.getConnection();
		try {
			await connection.beginTransaction();
			await execute();
			await connection.commit();
			return;
		} catch (e) {
			await connection.rollback();
			throw e;
		}
	};

	return (LuciaError) => {
		const operator = createOperator(mysql2Runner(db));
		const coreAdapter = createCoreAdapter(operator);
		return {
			getUser: coreAdapter.getUser,
			getSessionAndUserBySessionId: coreAdapter.getSessionAndUserBySessionId,
			getSession: coreAdapter.getSession,
			getSessionsByUserId: coreAdapter.getSessionsByUserId,
			setUser: async (userId, attributes, key) => {
				const user = {
					id: userId,
					...attributes
				};
				try {
					if (key) {
						await transaction(async () => {
							await operator.run<MySQLUserSchema>((ctx) => [
								ctx.insertInto("auth_user", user)
							]);
							await operator.run((ctx) => [ctx.insertInto("auth_key", key)]);
						});
						return
					}
					await operator.run<MySQLUserSchema>((ctx) => [
						ctx.insertInto("auth_user", user)
					]);
				} catch (e) {
					const error = e as Partial<QueryError>;
					if (
						error.code === "ER_DUP_ENTRY" &&
						error.message?.includes("PRIMARY")
					) {
						throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
					}
					throw e;
				}
			},
			deleteUser: coreAdapter.deleteUser,
			setSession: async (session) => {
				try {
					return await coreAdapter.setSession(session);
				} catch (e) {
					const error = e as Partial<QueryError>;
					if (error.errno === 1452 && error.message?.includes("(`user_id`)")) {
						throw new LuciaError("AUTH_INVALID_USER_ID");
					}
					if (
						error.code === "ER_DUP_ENTRY" &&
						error.message?.includes("PRIMARY")
					) {
						throw new LuciaError("AUTH_DUPLICATE_SESSION_ID");
					}
					throw e;
				}
			},
			deleteSession: coreAdapter.deleteSession,
			deleteSessionsByUserId: coreAdapter.deleteSessionsByUserId,
			updateUserAttributes: coreAdapter.updateUserAttributes,
			setKey: async (key) => {
				try {
					return await coreAdapter.setKey(key);
				} catch (e) {
					const error = e as Partial<QueryError>;
					if (error.errno === 1452 && error.message?.includes("(`user_id`)")) {
						throw new LuciaError("AUTH_INVALID_USER_ID");
					}
					if (
						error.code === "ER_DUP_ENTRY" &&
						error.message?.includes("PRIMARY")
					) {
						throw new LuciaError("AUTH_DUPLICATE_KEY_ID");
					}
					throw e
				}
			},
			getKey: coreAdapter.getKey,
			getKeysByUserId: coreAdapter.getKeysByUserId,
			updateKeyPassword: coreAdapter.updateKeyPassword,
			deleteKeysByUserId: coreAdapter.deleteKeysByUserId,
			deleteNonPrimaryKey: coreAdapter.deleteNonPrimaryKey
		};
	};
};
