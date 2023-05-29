import mongoose from "mongoose";
import type {
	LuciaQueryHandler,
	TestUserSchema
} from "@lucia-auth/adapter-test";
import mongodb from "../src/index.js";

import dotenv from "dotenv";
import { resolve } from "path";
import { transformKeyDoc, transformSessionDoc } from "../src/utils.js";
import { LuciaError } from "lucia-auth";

dotenv.config({
	path: `${resolve()}/.env`
});

const url = process.env.MONGODB_URL ?? "mongodb://localhost:27017";

if (!url) throw new Error(".env is not set up");

const User = mongoose.model(
	"auth_user",
	new mongoose.Schema(
		{
			_id: {
				type: String
			},
			username: {
				unique: true,
				type: String,
				required: true
			}
		},
		{ _id: false }
	)
);

const Session = mongoose.model(
	"auth_session",
	new mongoose.Schema(
		{
			_id: {
				type: String
			},
			user_id: {
				type: String,
				required: true
			},
			active_expires: {
				type: Number,
				required: true
			},
			idle_expires: {
				type: Number,
				required: true
			}
		},
		{ _id: false }
	)
);

const Key = mongoose.model(
	"auth_key",
	new mongoose.Schema(
		{
			_id: {
				type: String
			},
			user_id: {
				type: String,
				required: true
			},
			hashed_password: String,
			primary_key: {
				type: Boolean,
				required: true
			},
			expires: Number
		},
		{ _id: false }
	)
);
const clientPromise = mongoose.connect(url);

export const adapter = mongodb(mongoose)(LuciaError);

const inputToMongooseDoc = (obj: Record<string, any>) => {
	if (obj.id === undefined) return obj;
	const { id, ...data } = obj;
	return {
		_id: id,
		...data
	};
};

export const queryHandler: LuciaQueryHandler = {
	user: {
		get: async () => {
			await clientPromise;
			const userDocs = await User.find().lean();
			return userDocs.map((doc) => {
				const { _id: id, ...attributes } = doc;
				return {
					id,
					...attributes
				} as TestUserSchema;
			});
		},
		insert: async (user) => {
			await clientPromise;
			const userDoc = new User(inputToMongooseDoc(user));
			await userDoc.save();
		},
		clear: async () => {
			await clientPromise;
			await User.deleteMany().lean();
		}
	},
	session: {
		get: async () => {
			await clientPromise;
			const sessionDocs = await Session.find().lean();
			return sessionDocs.map((doc) => transformSessionDoc(doc));
		},
		insert: async (session) => {
			await clientPromise;
			const sessionDoc = new Session(inputToMongooseDoc(session));
			await sessionDoc.save();
		},
		clear: async () => {
			await clientPromise;
			await Session.deleteMany().lean();
		}
	},
	key: {
		get: async () => {
			await clientPromise;
			const keyDocs = await Key.find().lean();
			return keyDocs.map((doc) => transformKeyDoc(doc));
		},
		insert: async (key) => {
			await clientPromise;
			const keyDoc = new Key(inputToMongooseDoc(key));
			await keyDoc.save();
		},
		clear: async () => {
			await clientPromise;
			await Key.deleteMany().lean();
		}
	}
};
