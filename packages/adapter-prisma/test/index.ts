import { testAdapter, Database } from "@lucia-auth/adapter-test";
import { LuciaError } from "lucia";
import { PrismaClient } from "@prisma/client";

import { prismaAdapter } from "../src/prisma.js";
import { transformDatabaseSession } from "../src/utils.js";

import type { QueryHandler, TableQueryHandler } from "@lucia-auth/adapter-test";
import type { SmartPrismaModel } from "../src/prisma.js";

const client = new PrismaClient();

const createTableQueryHandler = (model: any): TableQueryHandler => {
	const Model = model as SmartPrismaModel;
	return {
		get: async () => {
			return await Model.findMany();
		},
		insert: async (value: any) => {
			await Model.create({
				data: value
			});
		},
		clear: async () => {
			await Model.deleteMany();
		}
	};
};

const queryHandler: QueryHandler = {
	user: createTableQueryHandler(client.user),
	session: {
		...createTableQueryHandler(client.session),
		get: async () => {
			const Session = client.session as any as SmartPrismaModel;
			const result = await Session.findMany();
			return result.map((val) => transformDatabaseSession(val));
		}
	},
	key: createTableQueryHandler(client.key)
};

const adapter = prismaAdapter({
	client,
	models: {
		user: "user",
		session: "session",
		key: "key"
	},
	tables: {
		user: "test_user"
	}
})(LuciaError);

await testAdapter(adapter, new Database(queryHandler));

process.exit(0);
